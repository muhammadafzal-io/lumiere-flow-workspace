"use client";

import { useEffect, useState } from "react";
import { BotAvatar } from "@/components/BotAvatar";

/**
 * A short conversation that plays itself on a loop, floating beside the booking widget — a
 * picture of what booking here is actually like (ask, get real times, confirm), so a visitor sees
 * the whole flow before typing a word. It is an illustration, not a live chat and not a real
 * booking: no real client, time or confirmation is implied, and the only real detail is the name
 * of a treatment the clinic offers.
 *
 * Messages arrive one at a time, each bot reply preceded by a typing indicator. Under
 * prefers-reduced-motion the finished conversation is shown still instead.
 */

interface Line {
  from: "you" | "bot";
  text: string;
}

function script(treatment: string): Line[] {
  return [
    { from: "you", text: `Hi! Can I book ${treatment} this week?` },
    { from: "bot", text: "Of course — I'm checking the live calendar now." },
    { from: "bot", text: "Thursday has 10:00 and 2:30 free. Which suits you?" },
    { from: "you", text: "10:00 please" },
    { from: "bot", text: "Done — your confirmation is on its way to your email ✓" },
  ];
}

const TYPING_MS = 1100;
const GAP_MS = 1300;
const HOLD_MS = 4200;

export function FloatingChatDemo({ treatment }: { treatment: string }) {
  const lines = script(treatment);
  const [shown, setShown] = useState(0);
  const [typing, setTyping] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setReduced(prefersReduced);
    if (prefersReduced) {
      setShown(lines.length);
      return;
    }

    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const after = (ms: number, fn: () => void) => {
      timers.push(
        setTimeout(() => {
          if (!cancelled && !document.hidden) fn();
          else if (!cancelled) after(500, fn); // tab hidden: wait rather than run ahead
        }, ms),
      );
    };

    const play = (i: number) => {
      if (i >= lines.length) {
        after(HOLD_MS, () => {
          setShown(0);
          play(0);
        });
        return;
      }
      const next = () => {
        setTyping(false);
        setShown(i + 1);
        after(GAP_MS, () => play(i + 1));
      };
      if (lines[i].from === "bot") {
        setTyping(true);
        after(TYPING_MS, next);
      } else {
        next();
      }
    };
    after(600, () => play(0));

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
    // The script depends only on the treatment name; restarting on it is correct.
  }, [treatment]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the last four bubbles so the card never grows; older ones slide away.
  const visible = lines.slice(0, shown).slice(-4);

  return (
    <div
      aria-hidden
      className="animate-float pointer-events-none w-64 rotate-[9deg] rounded-3xl border border-white/20 bg-white/[0.94] p-4 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.55)] backdrop-blur-md"
    >
      <div className="mb-3 flex items-center gap-2 border-b border-black/5 pb-3">
        <BotAvatar className="h-7 w-7" />
        <span className="text-xs font-medium text-foreground">Front desk</span>
        <span className="ml-auto flex items-center gap-1 text-[10px] text-success">
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
          Online
        </span>
      </div>

      <div className="flex h-[14rem] flex-col justify-end gap-2 overflow-hidden">
        {visible.map((line, i) => (
          <div
            key={`${shown}-${i}-${line.text}`}
            className={`max-w-[85%] rounded-2xl px-3 py-2 text-[12px] leading-snug ${
              line.from === "you"
                ? "self-end rounded-br-md bg-primary text-primary-foreground"
                : "self-start rounded-bl-md bg-muted text-foreground"
            } ${i === visible.length - 1 && !reduced ? "animate-slide-up" : ""}`}
          >
            {line.text}
          </div>
        ))}
        {typing && (
          <div className="flex items-center gap-1 self-start rounded-2xl rounded-bl-md bg-muted px-3 py-2.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="animate-pulse-dot h-1.5 w-1.5 rounded-full bg-primary"
                style={{ animationDelay: `${i * 0.2}s` }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
