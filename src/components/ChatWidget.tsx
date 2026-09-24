"use client";

import { BotAvatar } from "@/components/BotAvatar";
import { useState, useRef, useEffect, useCallback } from "react";
import ChatMessage from "./ChatMessage";
import VoiceCall from "./VoiceCall";
import type { ConversationMessages } from "@/types";

interface Message {
  role: "user" | "assistant";
  text: string;
}

const SESSION_STORAGE_KEY = "lumiere_session_id";

function getSessionId(): string {
  const existing = sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (existing) return existing;
  const sessionId = `widget-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  sessionStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  return sessionId;
}

function welcomeMessage(clinicName: string): Message {
  return {
    role: "assistant",
    // Says only what the assistant genuinely does: availability comes from the live calendar,
    // bookings go through the same engine staff use, and prep/aftercare come from the clinic's own
    // guidance. Plain text with "•" bullets, because the message renders as text, not markdown.
    text: `Hi, I'm the virtual assistant for ${clinicName}. I can:\n\n• Show real availability and book your appointment\n• Explain our treatments, prices and how long each takes\n• Share preparation and aftercare guidance\n\nWhat would you like to do today?`,
  };
}

interface ChatWidgetProps {
  clinicName?: string;
  location?: string;
  businessHours?: string;
  address?: string;
}

export default function ChatWidget({
  clinicName = "Lumière Med Spa",
  location = "Austin, TX",
  businessHours,
  address,
}: ChatWidgetProps) {
  const [messages, setMessages] = useState<Message[]>([welcomeMessage(clinicName)]);
  const [agentHistory, setAgentHistory] = useState<ConversationMessages>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [composerReady, setComposerReady] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setSessionId(getSessionId());
    setComposerReady(true);
  }, []);

  useEffect(() => {
    // Scroll the message list itself — scrollIntoView would also scroll the *page* to bring the
    // widget into view, yanking a visitor down the homepage a few seconds after it loads.
    // Nothing to follow until the visitor has actually said something — otherwise the long
    // greeting opens scrolled past its own first line on a short screen.
    if (messages.length <= 1 && !loading) return;
    const list = bottomRef.current?.parentElement;
    list?.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading || !sessionId) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", text }]);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message: text, history: agentHistory }),
      });

      // A non-2xx here (most often a gateway timeout on a slow turn — several tool calls in a
      // row can add up) means the server never got as far as returning a real reply, distinct
      // from a genuine network failure below. Both land in the catch block, but distinguishing
      // them lets the message actually say what happened instead of a generic "connection" guess.
      // A message the server refused for being too long is a normal, explainable outcome, not a
      // failure: show the server's own wording and — unlike every other path here — keep it OUT of
      // agentHistory, since it was never processed and would otherwise bloat every later request.
      if (res.status === 400) {
        const rejected = await res.json().catch(() => null);
        if (rejected?.error === "MESSAGE_TOO_LONG" && typeof rejected.message === "string") {
          setMessages((prev) => [...prev, { role: "assistant", text: rejected.message }]);
          return;
        }
        throw new Error(`http_${res.status}`);
      }

      if (!res.ok) throw new Error(`http_${res.status}`);

      const data: {
        reply?: string;
        error?: string;
        escalated?: boolean;
        booked?: boolean;
        history?: ConversationMessages;
      } = await res.json();

      const reply = data.reply ?? "Sorry, I couldn't process that. Please try again.";
      setMessages((prev) => [...prev, { role: "assistant", text: reply }]);
      if (data.history) {
        setAgentHistory(data.history);
      } else {
        // No updated history back — at minimum keep this message in the AI's context so a retry
        // doesn't silently lose track of what the client just said.
        setAgentHistory((prev) => [...prev, { role: "user", content: text }]);
      }
    } catch (err) {
      const isServerTimeout = err instanceof Error && /^http_(5\d\d|408)$/.test(err.message);
      // Preserve the message in context here too — same reasoning as the no-history branch
      // above — so a retry after a timeout isn't starting the AI over from scratch.
      setAgentHistory((prev) => [...prev, { role: "user", content: text }]);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: isServerTimeout
            ? "That took longer than expected on our end — nothing was lost, please try sending that again. 💛"
            : "I'm having trouble connecting. Please check your connection and try again in a moment 💛",
        },
      ]);
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  }, [input, loading, sessionId, agentHistory]);

  const handleKeyDown = (e: { key: string; shiftKey: boolean; preventDefault(): void }) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="relative flex flex-col h-full bg-background">
      {voiceActive && (
        <VoiceCall
          sessionId={sessionId}
          clinicName={clinicName}
          onClose={(completionLinks) => {
            setVoiceActive(false);
            if (completionLinks && completionLinks.length > 0) {
              setMessages((prev) => [
                ...prev,
                ...completionLinks.map((url) => ({
                  role: "assistant" as const,
                  text: `Here's your booking link to finish adding your name, email, and date of birth: ${url}`,
                })),
              ]);
            }
          }}
        />
      )}
      <div className="bg-panel px-5 py-4 flex items-center gap-3 flex-shrink-0">
        <BotAvatar className="h-10 w-10 flex-shrink-0 ring-2 ring-white/30" />
        <div className="min-w-0">
          <p className="truncate text-panel-foreground font-semibold text-sm leading-tight">
            {clinicName}
          </p>
          <p className="truncate text-primary text-xs">AI Front Desk • {location}</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="w-2 h-2 bg-success rounded-full animate-pulse" />
          <span className="text-success text-xs">Online</span>
        </div>
      </div>

      <div
        className="flex-1 overflow-y-auto p-4 space-y-3 chat-scroll"
        role="log"
        aria-live="polite"
        aria-label={`Conversation with ${clinicName}`}
      >
        {messages.map((m, i) => (
          <ChatMessage key={i} role={m.role} text={m.text} />
        ))}

        {loading && (
          <div className="flex justify-start animate-fade-in">
            <BotAvatar className="mr-2 mt-1 h-8 w-8 flex-shrink-0" />
            <div className="bg-card rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm border flex items-center gap-1">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-1.5 h-1.5 bg-primary rounded-full inline-block animate-pulse-dot"
                  style={{ animationDelay: `${i * 0.2}s` }}
                />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t bg-card px-4 py-3 flex-shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {composerReady ? (
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message…"
              className="flex-1 resize-none bg-muted rounded-xl px-4 py-2.5 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all max-h-32 overflow-y-auto"
              style={{ minHeight: "40px" }}
            />
            <button
              onClick={() => setVoiceActive(true)}
              disabled={loading || voiceActive}
              className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center flex-shrink-0 transition-all hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Start voice call"
              title={`Talk to ${clinicName}`}
            >
              <svg
                className="w-4 h-4 text-primary-foreground"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                />
              </svg>
            </button>
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center flex-shrink-0 transition-all hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Send message"
            >
              <svg
                className="w-4 h-4 text-primary-foreground rotate-90"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 19l9 2-9-18-9 18 9-2v-9z"
                />
              </svg>
            </button>
          </div>
        ) : (
          <div className="flex items-end gap-2" aria-hidden>
            <div className="flex-1 h-10 rounded-xl bg-muted" />
            <div className="w-10 h-10 rounded-xl bg-primary/30" />
            <div className="w-10 h-10 rounded-xl bg-primary/30" />
          </div>
        )}
        {(businessHours || address) && (
          <p className="text-muted-foreground text-[10px] text-center mt-2">
            {[businessHours, address].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>
    </div>
  );
}
