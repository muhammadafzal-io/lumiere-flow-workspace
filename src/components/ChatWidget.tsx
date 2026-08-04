"use client";

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
    text: `Hi! I'm ${clinicName}'s virtual assistant. 💛\n\nI can help you with:\n• Services & pricing\n• Booking an appointment\n• Prep & aftercare info\n• Anything else about the spa\n\nWhat can I help you with today?`,
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
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
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

      const data: {
        reply?: string;
        error?: string;
        escalated?: boolean;
        booked?: boolean;
        history?: ConversationMessages;
      } = await res.json();

      const reply = data.reply ?? "Sorry, I couldn't process that. Please try again.";
      setMessages((prev) => [...prev, { role: "assistant", text: reply }]);
      if (data.history) setAgentHistory(data.history);
    } catch (err) {
      void err;
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: "I'm having trouble connecting. Please try again in a moment 💛",
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
    <div className="relative flex flex-col h-full bg-lumiere-cream">
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
      <div className="bg-lumiere-navy px-5 py-4 flex items-center gap-3 flex-shrink-0">
        <div className="w-9 h-9 rounded-full bg-lumiere-rose flex items-center justify-center">
          <span className="font-serif font-bold text-white text-sm">L</span>
        </div>
        <div>
          <p className="text-white font-semibold text-sm leading-tight">{clinicName}</p>
          <p className="text-lumiere-rose text-xs">AI Front Desk • {location}</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          <span className="text-green-400 text-xs">Online</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 chat-scroll">
        {messages.map((m, i) => (
          <ChatMessage key={i} role={m.role} text={m.text} />
        ))}

        {loading && (
          <div className="flex justify-start animate-fade-in">
            <div className="w-7 h-7 rounded-full bg-lumiere-navy flex items-center justify-center text-xs text-lumiere-cream font-serif font-bold mr-2 mt-1 flex-shrink-0">
              L
            </div>
            <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm border border-lumiere-ivory flex items-center gap-1">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-1.5 h-1.5 bg-lumiere-rose rounded-full inline-block animate-pulse-dot"
                  style={{ animationDelay: `${i * 0.2}s` }}
                />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-lumiere-ivory bg-white px-4 py-3 flex-shrink-0">
        {composerReady ? (
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Message ${clinicName}...`}
              className="flex-1 resize-none bg-lumiere-cream rounded-xl px-4 py-2.5 text-sm text-lumiere-navy placeholder-lumiere-muted focus:outline-none focus:ring-2 focus:ring-lumiere-rose transition-all max-h-32 overflow-y-auto"
              style={{ minHeight: "40px" }}
            />
            <button
              onClick={() => setVoiceActive(true)}
              disabled={loading || voiceActive}
              className="w-10 h-10 rounded-xl bg-lumiere-rose flex items-center justify-center flex-shrink-0 transition-all hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Start voice call"
              title={`Talk to ${clinicName}`}
            >
              <svg
                className="w-4 h-4 text-white"
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
              className="w-10 h-10 rounded-xl bg-lumiere-navy flex items-center justify-center flex-shrink-0 transition-all hover:bg-lumiere-navy-light disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Send message"
            >
              <svg
                className="w-4 h-4 text-white rotate-90"
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
            <div className="flex-1 h-10 rounded-xl bg-lumiere-cream" />
            <div className="w-10 h-10 rounded-xl bg-lumiere-rose/30" />
            <div className="w-10 h-10 rounded-xl bg-lumiere-navy/30" />
          </div>
        )}
        {(businessHours || address) && (
          <p className="text-lumiere-muted text-[10px] text-center mt-2">
            {[businessHours, address].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>
    </div>
  );
}
