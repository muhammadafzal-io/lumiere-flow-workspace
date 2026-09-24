"use client";

import { BotAvatar } from "@/components/BotAvatar";
interface ChatMessageProps {
  role: "user" | "assistant";
  text: string;
}

export default function ChatMessage({ role, text }: ChatMessageProps) {
  const isUser = role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} animate-slide-up`}>
      {!isUser && <BotAvatar className="mr-2 mt-1 h-8 w-8 flex-shrink-0" />}
      <div
        className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
          isUser
            ? "bg-primary text-primary-foreground rounded-tr-sm"
            : "bg-card text-foreground rounded-tl-sm shadow-sm border"
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{text}</p>
        ) : (
          <div
            className="chat-html whitespace-pre-wrap"
            dangerouslySetInnerHTML={{
              __html: text
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                // Bare URLs (e.g. the booking-completion link) — auto-linkify so the model
                // doesn't need to remember to format an <a> tag itself. Skips URLs already
                // inside an href="..." attribute so explicit <a href> tags below aren't
                // double-wrapped.
                .replace(/(?<!href=")(https?:\/\/[^\s<]+)/g, (url) => {
                  const trailing = url.match(/[.,;:!?)]+$/)?.[0] ?? "";
                  const clean = trailing ? url.slice(0, -trailing.length) : url;
                  return `<a href="${clean}" target="_blank" rel="noopener noreferrer">${clean}</a>${trailing}`;
                })
                .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
                .replace(/&lt;b&gt;(.*?)&lt;\/b&gt;/g, "<strong>$1</strong>")
                .replace(/&lt;\/b&gt;/g, "")
                .replace(/&lt;code&gt;(.*?)&lt;\/code&gt;/g, "<code>$1</code>")
                .replace(/&lt;a href="(.*?)"&gt;(.*?)&lt;\/a&gt;/g, (_, href, label) => {
                  // Only allow http / https links — block javascript: and other schemes
                  const safe = /^https?:\/\//i.test(href) ? href : "#";
                  return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${label}</a>`;
                }),
            }}
          />
        )}
      </div>
    </div>
  );
}
