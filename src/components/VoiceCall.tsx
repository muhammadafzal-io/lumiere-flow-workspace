"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { normalizeEmail } from "@/lib/email";
import { requestVoiceMicrophoneStream } from "@/lib/voice/microphone-constraints";
import { findVoiceConfirmedEmail } from "@/lib/voice/confirmed-email";
import { getToolCueRecoveryInstruction } from "@/lib/voice/tool-cue-recovery";
import { shouldRejectUserTranscript } from "@/lib/voice/transcript-filter";

type CallStatus = "idle" | "connecting" | "active" | "reconnecting" | "error";

interface TranscriptLine {
  role: "user" | "assistant";
  text: string;
}

interface VoiceCallProps {
  sessionId: string;
  onClose: () => void;
}

const TOOL_LABELS: Record<string, string> = {
  check_availability: "Checking the calendar...",
  find_earliest_availability: "Finding the soonest opening...",
  book_appointment: "Confirming your booking...",
  resend_booking_confirmation: "Sending your confirmation email...",
  get_practitioners: "Looking up practitioners...",
  find_appointment: "Looking up your booking...",
  find_upcoming_appointment: "Looking up your appointment...",
  check_reschedule_availability: "Checking openings for your reschedule...",
  cancel_appointment: "Cancelling your appointment...",
  reschedule_appointment: "Updating your appointment...",
  validate_credit_code: "Checking your promo code...",
  escalate_to_human: "Connecting you to our team...",
};

/** No loader — these run in the background during booking flow */
const SILENT_TOOLS = new Set(["upsert_client", "log_operation", "end_call"]);

/** Calendar / CRM tools that may take longer than a quick lookup */
const SLOW_TOOLS = new Set([
  "check_availability",
  "find_earliest_availability",
  "book_appointment",
  "find_upcoming_appointment",
  "check_reschedule_availability",
  "cancel_appointment",
  "reschedule_appointment",
  "resend_booking_confirmation",
]);

const VOICE_TOOL_TIMEOUT_MS = 45_000;

/** Max reconnect attempts per "stable window" — reset after a successful reconnect (FIX #R2) */
const MAX_RECONNECT_ATTEMPTS = 2;
/** Grace period before treating a "disconnected" ICE state as a real failure (FIX #R3) */
const DISCONNECTED_GRACE_MS = 2500;
/** How long a reconnect must stay stable before the attempt counter resets (FIX #R2) */
const RECONNECT_STABLE_MS = 3000;

export default function VoiceCall({ sessionId, onClose }: VoiceCallProps) {
  const [status, setStatus] = useState<CallStatus>("connecting");
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [liveText, setLiveText] = useState<string>("");
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [userSpeaking, setUserSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [processingLabel, setProcessingLabel] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  // FIX #8: Use a proper audio element ref rendered in JSX to avoid autoplay policy issues
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);
  const aiDraftRef = useRef<string>("");
  const pendingToolCallsRef = useRef<Array<{ callId: string; toolName: string; args: string }>>([]);
  // FIX #10: Use a stable ID-based lookup instead of array index to avoid desync on fast speech
  const pendingUserIdRef = useRef<string | null>(null);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callEndPendingRef = useRef(false);
  const aiSpeakingRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  // FIX #R1: Mutex so dc.onclose and pc.onconnectionstatechange can never both trigger
  // a reconnect for the same drop (previously caused two concurrent RTCPeerConnections)
  const reconnectingRef = useRef(false);
  // FIX #R2: Timer that resets the attempt budget once a reconnect has held for a while,
  // so a second, unrelated network blip later in a long call still gets its own retry
  const reconnectStableTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // FIX #R3: Debounce timer for the ICE "disconnected" state, which is often transient
  const disconnectedGraceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // FIX #1: Use a ref (not state) to capture transcript for reconnect — always current value
  const transcriptRef = useRef<TranscriptLine[]>([]);
  // FIX #5: Track whether stop() was intentionally called to suppress spurious error states
  const intentionalStopRef = useRef(false);
  const responseHadToolCallRef = useRef(false);
  const toolFetchCountRef = useRef(0);
  const callActiveAtRef = useRef(0);
  const micUnmuteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ignoreUserSpeechRef = useRef(false);

  const sendDc = useCallback((payload: Record<string, unknown>) => {
    const dc = dcRef.current;
    if (dc?.readyState === "open") dc.send(JSON.stringify(payload));
  }, []);

  const setMicEnabled = useCallback((enabled: boolean) => {
    streamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = enabled;
    });
  }, []);

  /** Keep mic muted while AI speaks, during tools, and briefly after (echo tail). */
  const scheduleMicAfterAi = useCallback(() => {
    setMicEnabled(false);
    if (micUnmuteTimerRef.current) clearTimeout(micUnmuteTimerRef.current);
    micUnmuteTimerRef.current = setTimeout(() => {
      micUnmuteTimerRef.current = null;
      if (!aiSpeakingRef.current && toolFetchCountRef.current === 0) {
        setMicEnabled(true);
      }
    }, 600);
  }, [setMicEnabled]);

  const clearProcessing = useCallback(() => {
    setProcessingLabel(null);
    setIsProcessing(false);
  }, []);

  const beginToolFetch = useCallback((toolName: string) => {
    if (SILENT_TOOLS.has(toolName)) return;
    ignoreUserSpeechRef.current = true;
    toolFetchCountRef.current += 1;
    const label = TOOL_LABELS[toolName];
    if (label) setProcessingLabel(label);
    setIsProcessing(true);
  }, []);

  const endToolFetch = useCallback(
    (toolName: string) => {
      if (SILENT_TOOLS.has(toolName)) return;
      toolFetchCountRef.current = Math.max(0, toolFetchCountRef.current - 1);
      if (toolFetchCountRef.current === 0) {
        clearProcessing();
        setTimeout(() => {
          if (toolFetchCountRef.current === 0 && !aiSpeakingRef.current) {
            ignoreUserSpeechRef.current = false;
          }
        }, 500);
      }
    },
    [clearProcessing],
  );

  // Keep transcriptRef in sync with transcript state
  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  useEffect(() => {
    if (status !== "active") return;
    const id = setInterval(() => setDuration((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [status]);

  useEffect(() => {
    if (aiSpeaking || isProcessing) {
      setMicEnabled(false);
      return;
    }
    scheduleMicAfterAi();
  }, [aiSpeaking, isProcessing, setMicEnabled, scheduleMicAfterAi]);

  /** Fetch with a hard timeout — prevents tool calls from hanging indefinitely */
  const fetchWithTimeout = useCallback(
    async (url: string, options: RequestInit, timeoutMs = 20000): Promise<Response> => {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await fetch(url, { ...options, signal: controller.signal });
      } finally {
        clearTimeout(id);
      }
    },
    [],
  );

  const stop = useCallback(() => {
    // FIX #R4: Make stop() idempotent — guards against end_call's own timeout firing
    // stop() a second time after the user has already hit the hang-up button
    if (intentionalStopRef.current) return;
    // FIX #5: Mark as intentional so dc.onclose / dc.onerror don't trigger error state
    intentionalStopRef.current = true;
    reconnectAttemptsRef.current = 99;
    reconnectingRef.current = false;
    toolFetchCountRef.current = 0;
    responseHadToolCallRef.current = false;
    // FIX #3: Always clear the resume timer on stop to prevent post-close response.create
    if (resumeTimerRef.current) {
      clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
    if (micUnmuteTimerRef.current) {
      clearTimeout(micUnmuteTimerRef.current);
      micUnmuteTimerRef.current = null;
    }
    // FIX #R2/#R3: Clear the reconnect-related timers too, or they can fire after teardown
    if (reconnectStableTimerRef.current) {
      clearTimeout(reconnectStableTimerRef.current);
      reconnectStableTimerRef.current = null;
    }
    if (disconnectedGraceTimerRef.current) {
      clearTimeout(disconnectedGraceTimerRef.current);
      disconnectedGraceTimerRef.current = null;
    }
    const dc = dcRef.current;
    const pc = pcRef.current;
    const str = streamRef.current;
    dcRef.current = null;
    pcRef.current = null;
    streamRef.current = null;
    dc?.close();
    pc?.close();
    str?.getTracks().forEach((t) => t.stop());
    if (audioRef.current) {
      audioRef.current.srcObject = null;
    }
    onClose();
  }, [onClose]);

  // FIX #2: handleDataChannelMessage is stable — deps are only stable refs and callbacks
  const handleDataChannelMessage = useCallback(
    async (raw: string) => {
      const rejectPhantomInput = (targetId: string | null) => {
        pendingUserIdRef.current = null;
        setUserSpeaking(false);
        if (targetId) {
          setTranscript((prev) =>
            prev.filter((l) => (l as TranscriptLine & { _id?: string })._id !== targetId),
          );
        }
        sendDc({ type: "input_audio_buffer.clear" });
        sendDc({ type: "response.cancel" });
      };

      let event: Record<string, unknown>;
      try {
        event = JSON.parse(raw);
      } catch {
        return;
      }

      const type = event.type as string;

      switch (type) {
        case "session.created": {
          setStatus("active");
          callActiveAtRef.current = Date.now();
          sendDc({
            type: "session.update",
            session: {
              type: "realtime",
              audio: {
                input: {
                  turn_detection: {
                    type: "server_vad",
                    threshold: 0.82,
                    prefix_padding_ms: 250,
                    silence_duration_ms: 900,
                  },
                },
              },
            },
          });
          const isReconnect = reconnectAttemptsRef.current > 0;
          if (isReconnect && transcriptRef.current.length > 0) {
            setTranscript(transcriptRef.current);
            // FIX #R2: This reconnect worked — once it's held for a bit without dropping
            // again, reset the attempt budget so a *later, unrelated* blip in this same
            // call still gets its own retry instead of failing immediately.
            if (reconnectStableTimerRef.current) clearTimeout(reconnectStableTimerRef.current);
            reconnectStableTimerRef.current = setTimeout(() => {
              reconnectStableTimerRef.current = null;
              reconnectAttemptsRef.current = 0;
            }, RECONNECT_STABLE_MS);
            const resumeDc = dcRef.current;
            if (resumeDc && resumeDc.readyState === "open") {
              resumeDc.send(
                JSON.stringify({
                  type: "response.create",
                  response: {
                    instructions:
                      "The call reconnected after a brief network drop. Do NOT repeat the opening greeting. Briefly apologise for the interruption in one short sentence, then continue exactly where the conversation left off.",
                  },
                }),
              );
            }
          } else {
            const greetDc = dcRef.current;
            if (greetDc && greetDc.readyState === "open") {
              greetDc.send(
                JSON.stringify({
                  type: "response.create",
                  response: {
                    instructions:
                      'Deliver the opening greeting now. Say word for word: "Welcome to Lumière Med Spa and Wellness! I\'m Lumière, your AI voice concierge. How may I assist you today?"',
                  },
                }),
              );
            }
          }
          break;
        }

        case "response.created":
          responseHadToolCallRef.current = false;
          if (toolFetchCountRef.current === 0) clearProcessing();
          break;

        case "input_audio_buffer.speech_started":
          if (
            ignoreUserSpeechRef.current ||
            aiSpeakingRef.current ||
            toolFetchCountRef.current > 0
          ) {
            break;
          }
          setUserSpeaking(true);
          break;

        case "input_audio_buffer.speech_stopped": {
          if (
            ignoreUserSpeechRef.current ||
            aiSpeakingRef.current ||
            toolFetchCountRef.current > 0
          ) {
            setUserSpeaking(false);
            break;
          }
          setUserSpeaking(false);
          // FIX #10: Use a UUID-keyed placeholder so array index never desync
          const pendingId = `user-${Date.now()}-${Math.random()}`;
          pendingUserIdRef.current = pendingId;
          setTranscript((prev) => [
            ...prev,
            { role: "user" as const, text: "", _id: pendingId } as TranscriptLine & { _id: string },
          ]);
          break;
        }

        case "conversation.item.input_audio_transcription.completed": {
          const text = (event.transcript as string | undefined)?.trim();
          const targetId = pendingUserIdRef.current;
          if (!text) {
            rejectPhantomInput(targetId);
            break;
          }

          const lastAssistant =
            [...transcriptRef.current].reverse().find((l) => l.role === "assistant")?.text ?? "";
          const msSinceCallActive = callActiveAtRef.current
            ? Date.now() - callActiveAtRef.current
            : undefined;

          if (
            shouldRejectUserTranscript(text, {
              lastAssistantText: lastAssistant,
              msSinceCallActive,
            })
          ) {
            rejectPhantomInput(targetId);
            break;
          }

          setTranscript((prev) => {
            // Find the placeholder by its stable ID
            const idx = prev.findIndex(
              (l) => (l as TranscriptLine & { _id?: string })._id === targetId && l.text === "",
            );
            if (idx !== -1) {
              pendingUserIdRef.current = null;
              const updated = [...prev];
              updated[idx] = { role: "user", text };
              return updated;
            }
            return [...prev, { role: "user", text }];
          });
          break;
        }

        case "response.output_audio_transcript.delta": {
          if (resumeTimerRef.current) {
            clearTimeout(resumeTimerRef.current);
            resumeTimerRef.current = null;
          }
          clearProcessing();
          const delta = event.delta as string | undefined;
          if (delta) {
            aiDraftRef.current += delta;
            setLiveText(aiDraftRef.current);
          }
          aiSpeakingRef.current = true;
          setAiSpeaking(true);
          ignoreUserSpeechRef.current = true;
          break;
        }

        case "response.output_audio_transcript.done": {
          const text =
            (event.transcript as string | undefined)?.trim() || aiDraftRef.current.trim();
          aiDraftRef.current = "";
          setLiveText("");
          clearProcessing();
          if (text) setTranscript((prev) => [...prev, { role: "assistant", text }]);
          aiSpeakingRef.current = false;
          setAiSpeaking(false);
          ignoreUserSpeechRef.current = true;
          setTimeout(() => {
            ignoreUserSpeechRef.current = false;
          }, 800);
          if (callEndPendingRef.current) {
            callEndPendingRef.current = false;
            setTimeout(() => stop(), 1000);
          }
          break;
        }

        case "response.function_call_arguments.done": {
          if (resumeTimerRef.current) {
            clearTimeout(resumeTimerRef.current);
            resumeTimerRef.current = null;
          }
          responseHadToolCallRef.current = true;
          const toolName = event.name as string;
          pendingToolCallsRef.current.push({
            callId: event.call_id as string,
            toolName,
            args: (event.arguments as string) ?? "{}",
          });
          beginToolFetch(toolName);
          break;
        }

        case "response.done": {
          aiSpeakingRef.current = false;
          setAiSpeaking(false);

          const allCalls = pendingToolCallsRef.current.splice(0);
          const endCallItem = allCalls.find((c) => c.toolName === "end_call");
          const toolCalls = allCalls.filter((c) => c.toolName !== "end_call");
          const heavyCalls = toolCalls.filter((c) => !SILENT_TOOLS.has(c.toolName));

          if (allCalls.length === 0) {
            clearProcessing();
            const lastAssistant =
              [...transcriptRef.current].reverse().find((l) => l.role === "assistant")?.text ?? "";
            const recovery = getToolCueRecoveryInstruction(lastAssistant);
            if (recovery) {
              const recoveryDc = dcRef.current;
              if (recoveryDc?.readyState === "open") {
                recoveryDc.send(
                  JSON.stringify({
                    type: "response.create",
                    response: { instructions: recovery },
                  }),
                );
              }
            }
            break;
          }

          const dc = dcRef.current;
          if (dc && dc.readyState === "open" && toolCalls.length > 0) {
            await Promise.all(
              toolCalls.map(async ({ callId, toolName, args }) => {
                let input: Record<string, unknown> = {};
                try {
                  input = JSON.parse(args);
                } catch {
                  /* keep empty */
                }

                const emailField =
                  toolName === "upsert_client"
                    ? "email"
                    : toolName === "book_appointment" ||
                        toolName === "resend_booking_confirmation" ||
                        toolName === "escalate_to_human"
                      ? "client_email"
                      : null;
                if (emailField) {
                  const confirmed = findVoiceConfirmedEmail(transcriptRef.current);
                  if (confirmed) {
                    const current = normalizeEmail(input[emailField]);
                    if (!current || current !== confirmed) {
                      input[emailField] = confirmed;
                    }
                  }
                }

                let output: unknown;
                try {
                  const timeoutMs = SLOW_TOOLS.has(toolName) ? VOICE_TOOL_TIMEOUT_MS : 20_000;
                  const res = await fetchWithTimeout(
                    "/api/voice/tool",
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        toolName,
                        input,
                        platform: "voice",
                        chatId: sessionId,
                      }),
                    },
                    timeoutMs,
                  );
                  output = await res.json();
                  if (!res.ok) {
                    const err =
                      output &&
                      typeof output === "object" &&
                      "error" in output &&
                      typeof (output as { error: unknown }).error === "string"
                        ? (output as { error: string }).error
                        : `Request failed (${res.status})`;
                    output = { error: err };
                  }
                } catch (err) {
                  const msg = err instanceof Error ? err.message : String(err);
                  output = {
                    error: msg.includes("abort") ? "Request timed out — please try again" : msg,
                  };
                } finally {
                  endToolFetch(toolName);
                }

                const liveDc = dcRef.current;
                if (liveDc && liveDc.readyState === "open") {
                  liveDc.send(
                    JSON.stringify({
                      type: "conversation.item.create",
                      item: {
                        type: "function_call_output",
                        call_id: callId,
                        output: JSON.stringify(output),
                      },
                    }),
                  );
                }
              }),
            );

            const afterDc = dcRef.current;
            if (afterDc && afterDc.readyState === "open") {
              afterDc.send(JSON.stringify({ type: "response.create" }));

              // Nudge only if AI stays silent after a heavy tool (calendar, booking, etc.)
              if (heavyCalls.length > 0) {
                resumeTimerRef.current = setTimeout(() => {
                  resumeTimerRef.current = null;
                  const retryDc = dcRef.current;
                  if (retryDc?.readyState === "open" && !aiSpeakingRef.current) {
                    retryDc.send(
                      JSON.stringify({
                        type: "response.create",
                        response: {
                          instructions:
                            "Speak immediately — read the tool results out loud. If check_availability returned slots, list up to 3 times and ask which works best. Never stay silent after a tool returns.",
                        },
                      }),
                    );
                  }
                }, 5000);
              }
            } else {
              clearProcessing();
            }
          } else if (toolCalls.length > 0) {
            // FIX #R5: The data channel dropped between the tool call being queued and
            // response.done firing (e.g. mid-reconnect). Without this branch,
            // toolFetchCountRef never gets decremented and the "Checking the calendar..."
            // spinner stays stuck forever, silently freezing the booking flow.
            toolCalls.forEach(({ toolName }) => endToolFetch(toolName));
            clearProcessing();
          } else {
            clearProcessing();
          }

          if (endCallItem) {
            callEndPendingRef.current = true;
            setTimeout(() => {
              if (callEndPendingRef.current) {
                callEndPendingRef.current = false;
                stop();
              }
            }, 4000);
          }
          break;
        }

        case "error": {
          const errObj = event.error as { message?: string; code?: string } | undefined;
          const msg = errObj?.message ?? "Unknown error";
          const code = errObj?.code ?? "";
          const fatal =
            code === "session_expired" || code === "invalid_api_key" || msg.includes("session");
          if (fatal) {
            setError(msg);
            setStatus("error");
          } else if (!msg.includes("active response")) {
            setTranscript((prev) => [...prev, { role: "assistant", text: `⚠️ ${msg}` }]);
          }
          break;
        }
      }
      // FIX #2: sessionId and fetchWithTimeout are the only true deps — no stale closure issues
    },
    [sessionId, fetchWithTimeout, stop, clearProcessing, beginToolFetch, endToolFetch, sendDc],
  );

  const start = useCallback(
    async (isReconnect = false) => {
      try {
        if (isReconnect) {
          // FIX #1: Read from ref (always current) instead of captured state snapshot
          // transcriptRef.current is updated by the useEffect above on every render
          setStatus("reconnecting");
          setError(null);
          clearProcessing();
          setLiveText("");
          // FIX #3: Clear resume timer before tearing down connection
          if (resumeTimerRef.current) {
            clearTimeout(resumeTimerRef.current);
            resumeTimerRef.current = null;
          }
          // FIX #4: Reset pending user ID ref on reconnect to avoid stale index
          pendingUserIdRef.current = null;
          pendingToolCallsRef.current = [];
          aiDraftRef.current = "";
          // Tear down old connection cleanly
          dcRef.current?.close();
          pcRef.current?.close();
          streamRef.current?.getTracks().forEach((t) => t.stop());
          dcRef.current = null;
          pcRef.current = null;
          streamRef.current = null;
        }

        // 1. Get ephemeral token from our backend
        const tokenRes = await fetch("/api/voice/session", { method: "POST" });
        const tokenData = (await tokenRes.json()) as {
          clientSecret?: string;
          error?: string;
          hint?: string;
        };
        if (!tokenRes.ok || !tokenData.clientSecret) {
          throw new Error(
            [tokenData.error, tokenData.hint].filter(Boolean).join(" — ") ||
              "Could not create voice session",
          );
        }
        const { clientSecret } = tokenData;

        // 2. Capture mic (requires secure context — localhost or HTTPS)
        const stream = await requestVoiceMicrophoneStream();
        streamRef.current = stream;

        // 3. Create peer connection — audio output handled by JSX <audio> element (FIX #8)
        const pc = new RTCPeerConnection();
        pcRef.current = pc;

        pc.ontrack = (e) => {
          if (audioRef.current) {
            audioRef.current.srcObject = e.streams[0];
          }
        };

        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        // 4. Data channel for events
        const dc = pc.createDataChannel("oai-events");
        dcRef.current = dc;
        dc.onmessage = (e) => handleDataChannelMessage(e.data as string);
        // FIX #5: Only fire error state if this was not an intentional stop
        dc.onerror = () => {
          if (intentionalStopRef.current) return;
          setError("Data channel error — please retry");
          setStatus("error");
        };
        dc.onclose = () => {
          // FIX #5: Suppress close events that fire as part of intentional stop()
          if (intentionalStopRef.current) return;
          if (!pcRef.current) return;
          // FIX #R1: Mutex guard — pc.onconnectionstatechange may already be reconnecting
          // for this exact drop. Without this, both handlers race to spin up a second
          // RTCPeerConnection, breaking or silently corrupting an in-progress booking call.
          if (reconnectingRef.current) return;
          if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
            reconnectingRef.current = true;
            reconnectAttemptsRef.current += 1;
            setTimeout(() => {
              reconnectingRef.current = false;
              start(true);
            }, 1500);
          } else {
            setError("Call disconnected — please retry");
            setStatus("error");
          }
        };

        pc.onconnectionstatechange = () => {
          if (intentionalStopRef.current) return;

          if (pc.connectionState === "failed") {
            // FIX #R1: Same mutex guard as dc.onclose above
            if (reconnectingRef.current) return;
            if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
              reconnectingRef.current = true;
              reconnectAttemptsRef.current += 1;
              setTimeout(() => {
                reconnectingRef.current = false;
                start(true);
              }, 1500);
            } else {
              setError("Network connection lost — please retry");
              setStatus("error");
            }
            return;
          }

          if (pc.connectionState === "disconnected") {
            // FIX #R3: "disconnected" is frequently transient (brief Wi-Fi/cellular blip)
            // and often self-heals within a couple seconds. Reconnecting immediately tears
            // down and rebuilds the whole call for something that may not need it — give
            // it a short grace window before treating it as a real failure.
            if (disconnectedGraceTimerRef.current) clearTimeout(disconnectedGraceTimerRef.current);
            disconnectedGraceTimerRef.current = setTimeout(() => {
              disconnectedGraceTimerRef.current = null;
              if (intentionalStopRef.current || reconnectingRef.current) return;
              if (pcRef.current !== pc || pc.connectionState !== "disconnected") return; // recovered on its own
              if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
                reconnectingRef.current = true;
                reconnectAttemptsRef.current += 1;
                setTimeout(() => {
                  reconnectingRef.current = false;
                  start(true);
                }, 1500);
              } else {
                setError("Network connection lost — please retry");
                setStatus("error");
              }
            }, DISCONNECTED_GRACE_MS);
          } else if (disconnectedGraceTimerRef.current) {
            // Connection recovered (e.g. back to "connected") before the grace period elapsed
            clearTimeout(disconnectedGraceTimerRef.current);
            disconnectedGraceTimerRef.current = null;
          }
        };

        // 5. SDP offer → OpenAI Realtime
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        const sdpRes = await fetch("https://api.openai.com/v1/realtime/calls", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${clientSecret}`,
            "Content-Type": "application/sdp",
          },
          body: offer.sdp,
        });
        if (!sdpRes.ok) {
          const errBody = await sdpRes.text();
          throw new Error(`WebRTC negotiation failed (${sdpRes.status}): ${errBody}`);
        }
        const answerSdp = await sdpRes.text();
        await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
      } catch (err) {
        if (intentionalStopRef.current) return;
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        setStatus("error");
      }
    },
    [handleDataChannelMessage, clearProcessing],
  );

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    intentionalStopRef.current = false;
    start();
    return () => {
      // FIX #3: Cleanup resume timer on unmount
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
      // FIX #R2/#R3: Also clean up the reconnect-related timers on unmount
      if (reconnectStableTimerRef.current) clearTimeout(reconnectStableTimerRef.current);
      if (disconnectedGraceTimerRef.current) clearTimeout(disconnectedGraceTimerRef.current);
      dcRef.current?.close();
      pcRef.current?.close();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="absolute inset-0 z-10 flex flex-col overflow-hidden rounded-2xl"
      style={{ background: "linear-gradient(160deg, #0e1929 0%, #180d2e 100%)" }}
    >
      {/* Hidden audio element for WebRTC playback */}
      <audio ref={audioRef} autoPlay playsInline style={{ display: "none" }} />

      <style>{`
        @keyframes audioBar {
          0%, 100% { transform: scaleY(0.25); opacity: 0.6; }
          50%       { transform: scaleY(1);    opacity: 1;   }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes processingPulse {
          0%, 100% { opacity: 0.4; transform: scale(0.95); }
          50%      { opacity: 1;   transform: scale(1.05); }
        }
      `}</style>

      {/* ── Header ── */}
      <div className="px-5 py-3.5 flex items-center gap-3 flex-shrink-0 border-b border-white/[0.07]">
        <div className="relative flex-shrink-0">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center shadow-md"
            style={{ background: "linear-gradient(135deg, #c4687a, #8b2e42)" }}
          >
            <span className="font-serif font-bold text-white text-sm">L</span>
          </div>
          {status === "active" && (
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-[#0e1929]" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm leading-tight">Lumière Voice</p>
          <p
            className="text-xs mt-0.5 truncate"
            style={{
              color:
                status === "error"
                  ? "#f87171"
                  : status === "reconnecting"
                    ? "rgba(251,191,36,0.9)"
                    : "rgba(196,168,130,0.8)",
            }}
          >
            {status === "connecting" && "Establishing secure connection..."}
            {status === "reconnecting" && "Reconnecting..."}
            {status === "active" &&
              (aiSpeaking
                ? "Speaking..."
                : userSpeaking
                  ? "Listening..."
                  : isProcessing
                    ? "Processing..."
                    : "Connected")}
            {status === "error" && "Connection failed"}
          </p>
        </div>

        {status === "active" && (
          <div
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1 mr-1"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
            <span className="text-white/50 text-[11px] font-mono tabular-nums">
              {String(Math.floor(duration / 60)).padStart(2, "0")}:
              {String(duration % 60).padStart(2, "0")}
            </span>
          </div>
        )}

        <button
          onClick={stop}
          className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all hover:brightness-110 active:scale-95"
          style={{
            background: "linear-gradient(135deg, #ef4444, #b91c1c)",
            boxShadow: "0 2px 10px rgba(239,68,68,0.4)",
          }}
          aria-label="End call"
        >
          <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z" />
          </svg>
        </button>
      </div>

      {/* ── Reconnecting screen ── */}
      {status === "reconnecting" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-5 px-6">
          <div className="relative">
            <span
              className="absolute inset-0 rounded-full"
              style={{
                border: "2px solid transparent",
                borderTopColor: "rgba(251,191,36,0.7)",
                animation: "spin 1s linear infinite",
              }}
            />
            <div
              className="relative w-20 h-20 rounded-full flex items-center justify-center border border-white/10"
              style={{ background: "rgba(251,191,36,0.08)" }}
            >
              <span
                className="font-serif font-bold text-2xl"
                style={{ color: "rgba(251,191,36,0.8)" }}
              >
                L
              </span>
            </div>
          </div>
          <div className="text-center">
            <p className="text-white/80 text-sm font-medium">Reconnecting…</p>
            <p className="text-white/35 text-xs mt-1">Brief network drop — resuming your session</p>
          </div>
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-1.5 h-1.5 rounded-full animate-pulse"
                style={{ background: "rgba(251,191,36,0.6)", animationDelay: `${i * 0.2}s` }}
              />
            ))}
          </div>
        </div>
      )}

      {/* FIX #9: Only render ping animation while status === 'connecting' — stops GPU burn after transition */}
      {status === "connecting" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-5 px-6">
          <div className="relative">
            <span
              className="absolute inset-0 rounded-full animate-ping"
              style={{ background: "rgba(196,104,122,0.15)" }}
            />
            <span
              className="absolute inset-2 rounded-full animate-pulse"
              style={{ background: "rgba(196,104,122,0.1)" }}
            />
            <div
              className="relative w-20 h-20 rounded-full flex items-center justify-center border border-white/10"
              style={{ background: "rgba(196,104,122,0.12)" }}
            >
              <span className="font-serif font-bold text-2xl" style={{ color: "#c4687a" }}>
                L
              </span>
            </div>
          </div>
          <div className="text-center">
            <p className="text-white/80 text-sm font-medium">Connecting to Lumière</p>
            <p className="text-white/35 text-xs mt-1">Your voice session is being prepared</p>
          </div>
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-1.5 h-1.5 rounded-full animate-pulse"
                style={{ background: "rgba(196,104,122,0.6)", animationDelay: `${i * 0.2}s` }}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Active / error content ── */}
      {status !== "connecting" && status !== "reconnecting" && (
        <>
          {/* Visualizer */}
          <div className="flex flex-col items-center justify-center py-7 gap-2.5 flex-shrink-0">
            <div className="relative flex items-center justify-center w-28 h-28">
              {aiSpeaking && (
                <>
                  <span
                    className="absolute w-28 h-28 rounded-full animate-ping"
                    style={{ background: "rgba(196,104,122,0.12)" }}
                  />
                  <span
                    className="absolute rounded-full animate-pulse"
                    style={{ width: 88, height: 88, background: "rgba(196,104,122,0.18)" }}
                  />
                </>
              )}
              {userSpeaking && (
                <>
                  <span
                    className="absolute w-28 h-28 rounded-full animate-ping"
                    style={{ background: "rgba(96,165,250,0.12)" }}
                  />
                  <span
                    className="absolute rounded-full animate-pulse"
                    style={{ width: 88, height: 88, background: "rgba(96,165,250,0.18)" }}
                  />
                </>
              )}
              {isProcessing && !aiSpeaking && !userSpeaking && (
                <span
                  className="absolute rounded-full"
                  style={{
                    width: 72,
                    height: 72,
                    border: "2px solid transparent",
                    borderTopColor: "rgba(196,104,122,0.7)",
                    borderRightColor: "rgba(196,104,122,0.3)",
                    animation: "spin 1s linear infinite",
                  }}
                />
              )}
              <div
                className="relative w-16 h-16 rounded-full flex items-center justify-center transition-all duration-500"
                style={{
                  background: userSpeaking
                    ? "linear-gradient(135deg, #60a5fa, #2563eb)"
                    : aiSpeaking
                      ? "linear-gradient(135deg, #c4687a, #8b2e42)"
                      : isProcessing
                        ? "rgba(196,104,122,0.15)"
                        : "rgba(255,255,255,0.06)",
                  border:
                    isProcessing && !aiSpeaking && !userSpeaking
                      ? "1px solid rgba(196,104,122,0.3)"
                      : "1px solid rgba(255,255,255,0.08)",
                  boxShadow:
                    aiSpeaking || userSpeaking
                      ? "0 0 28px rgba(196,104,122,0.35)"
                      : isProcessing
                        ? "0 0 18px rgba(196,104,122,0.2)"
                        : "none",
                }}
              >
                {aiSpeaking || userSpeaking ? (
                  <div className="flex items-end gap-0.5 h-5">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <span
                        key={i}
                        className="w-[3px] rounded-full bg-white"
                        style={{
                          height: "100%",
                          transformOrigin: "bottom center",
                          animation: "audioBar 0.55s ease-in-out infinite",
                          animationDelay: `${i * 0.1}s`,
                        }}
                      />
                    ))}
                  </div>
                ) : isProcessing ? (
                  <div className="flex items-center gap-1">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="w-1.5 h-1.5 rounded-full"
                        style={{
                          background: "rgba(196,104,122,0.85)",
                          animation: "processingPulse 1.2s ease-in-out infinite",
                          animationDelay: `${i * 0.2}s`,
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    style={{ color: "rgba(255,255,255,0.35)" }}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 18.364V21m0-2.636a9 9 0 01-9-9 9 9 0 0118 0 9 9 0 01-9 9z"
                    />
                  </svg>
                )}
              </div>
            </div>
            {processingLabel && !aiSpeaking && !userSpeaking ? (
              <div
                className="flex items-center gap-2 rounded-full px-3.5 py-1.5"
                style={{
                  background: "rgba(196,104,122,0.12)",
                  border: "1px solid rgba(196,104,122,0.2)",
                }}
              >
                <div className="flex gap-0.5 items-end h-3">
                  {[0, 1, 2, 3].map((i) => (
                    <span
                      key={i}
                      className="w-[3px] rounded-full"
                      style={{
                        height: "100%",
                        background: "rgba(196,104,122,0.8)",
                        transformOrigin: "bottom center",
                        animation: "audioBar 0.55s ease-in-out infinite",
                        animationDelay: `${i * 0.1}s`,
                      }}
                    />
                  ))}
                </div>
                <span
                  className="text-[11px] tracking-wide"
                  style={{ color: "rgba(196,104,122,0.9)" }}
                >
                  {processingLabel}
                </span>
              </div>
            ) : (
              <p className="text-xs tracking-wide" style={{ color: "rgba(255,255,255,0.3)" }}>
                {aiSpeaking
                  ? "Lumière is responding..."
                  : userSpeaking
                    ? "Listening..."
                    : status === "active"
                      ? "Speak to Lumière"
                      : ""}
              </p>
            )}
          </div>

          {/* Transcript */}
          <div className="flex-1 overflow-y-auto px-4 pb-3 space-y-2.5">
            {transcript.length === 0 && status === "active" && !error && (
              <p className="text-center pt-4 text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>
                Your conversation will appear here
              </p>
            )}
            {error && (
              <div
                className="mx-2 rounded-xl px-4 py-3 text-center"
                style={{
                  background: "rgba(239,68,68,0.08)",
                  border: "1px solid rgba(239,68,68,0.2)",
                }}
              >
                <p className="text-red-400 text-xs">{error}</p>
              </div>
            )}

            {/* FIX #10: Filter empty placeholders but still render correctly keyed lines */}
            {transcript
              .filter((l): l is TranscriptLine => Boolean(l.text))
              .map((line, i) => (
                <div
                  key={i}
                  className={`flex flex-col gap-1 ${line.role === "user" ? "items-end" : "items-start"}`}
                >
                  <span
                    className="text-[10px] px-1 tracking-wide"
                    style={{ color: "rgba(255,255,255,0.28)" }}
                  >
                    {line.role === "user" ? "You" : "Lumière"}
                  </span>
                  <div
                    className="max-w-[83%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed"
                    style={
                      line.role === "user"
                        ? {
                            background: "rgba(196,104,122,0.65)",
                            color: "white",
                            borderBottomRightRadius: "4px",
                          }
                        : {
                            background: "rgba(255,255,255,0.07)",
                            color: "rgba(255,255,255,0.85)",
                            borderBottomLeftRadius: "4px",
                            border: "1px solid rgba(255,255,255,0.06)",
                          }
                    }
                  >
                    {line.text}
                  </div>
                </div>
              ))}

            {liveText && (
              <div className="flex flex-col items-start gap-1">
                <span
                  className="text-[10px] px-1 tracking-wide"
                  style={{ color: "rgba(255,255,255,0.28)" }}
                >
                  Lumière
                </span>
                <div
                  className="max-w-[83%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed italic"
                  style={{
                    background: "rgba(196,104,122,0.1)",
                    color: "rgba(255,255,255,0.55)",
                    borderBottomLeftRadius: "4px",
                    border: "1px solid rgba(196,104,122,0.15)",
                  }}
                >
                  {liveText}
                  <span
                    className="inline-block w-[3px] h-3 ml-0.5 rounded-full align-middle animate-pulse"
                    style={{ background: "rgba(196,104,122,0.7)" }}
                  />
                </div>
              </div>
            )}
            <div ref={transcriptEndRef} />
          </div>
        </>
      )}
    </div>
  );
}
