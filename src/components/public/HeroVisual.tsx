"use client";

import { useEffect, useRef } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import type { PortraitPerson } from "@/components/public/PractitionerPortraitMark";

/**
 * The hero's device: a dark tablet whose screen tells the booking story — a headline, a one-card
 * explanation, and a V-shaped flow diagram running from "message us" down to "confirmed" and back
 * up through what happens after. It is drawn, never a screenshot of the real calendar or account
 * pages, which show actual clients.
 *
 * Wrapped in the motion that makes it feel like a modern product shot: scroll parallax, a cursor
 * tilt with a light glare (only where there is a precise pointer), and an honest floating badge
 * stating the real practitioner count. All three are skipped under prefers-reduced-motion.
 */

const MINT = "oklch(0.86 0.13 178)";
const SKEW = 22;
const ROW = 50;

type StepKind = "active" | "outline" | "solid" | "dashed";
interface Step {
  x: number;
  row: number;
  w: number;
  label: string;
  kind: StepKind;
}

/** Left side descends to the bottom bar, right side climbs back up — the shape of one booking. */
const STEPS: Step[] = [
  { x: 0, row: 0, w: 172, label: "Message us", kind: "outline" },
  { x: 172, row: 0, w: 176, label: "Treatment & time", kind: "active" },
  { x: 196, row: 1, w: 170, label: "Availability check", kind: "solid" },
  { x: 218, row: 2, w: 170, label: "Practitioner match", kind: "solid" },
  { x: 240, row: 3, w: 380, label: "Confirmed", kind: "solid" },
  { x: 472, row: 2, w: 160, label: "Confirmation email", kind: "dashed" },
  { x: 494, row: 1, w: 160, label: "Reminder", kind: "dashed" },
  { x: 516, row: 0, w: 150, label: "Your visit", kind: "dashed" },
  { x: 666, row: 0, w: 164, label: "Aftercare info", kind: "dashed" },
];

function FlowDiagram() {
  return (
    <svg
      viewBox="0 -56 840 262"
      role="img"
      aria-label="Booking flow: message us, treatment and time, availability check, practitioner match, confirmed, then confirmation email, reminder, your visit and aftercare info"
      className="mx-auto mt-8 hidden w-full max-w-3xl sm:block"
    >
      {/* The thread from the explanation card down to the active step. */}
      <path
        d={`M 96 -56 H 128 L ${172 + 0} 0`}
        fill="none"
        stroke={MINT}
        strokeWidth="1"
        opacity="0.7"
        className="animate-draw-line"
        style={{ animationDelay: "600ms" }}
      />
      <circle cx="172" cy="0" r="3.5" fill={MINT} />
      <circle
        cx="172"
        cy="0"
        r="3.5"
        fill={MINT}
        className="animate-ping"
        opacity="0.5"
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
      />

      {STEPS.map((step, i) => {
        const y = step.row * ROW;
        const d = `M ${step.x + SKEW} ${y} L ${step.x + step.w} ${y} L ${step.x + step.w - SKEW} ${y + ROW} L ${step.x} ${y + ROW} Z`;
        const style =
          step.kind === "active"
            ? { fill: "rgb(94 234 212 / 0.14)", stroke: MINT, strokeWidth: 1 }
            : step.kind === "outline"
              ? { fill: "rgb(94 234 212 / 0.05)", stroke: MINT, strokeWidth: 1, opacity: 0.75 }
              : step.kind === "dashed"
                ? {
                    fill: "none",
                    stroke: "rgb(255 255 255 / 0.28)",
                    strokeWidth: 1,
                    strokeDasharray: "5 4",
                  }
                : {
                    fill: "rgb(255 255 255 / 0.04)",
                    stroke: "rgb(255 255 255 / 0.1)",
                    strokeWidth: 1,
                  };
        return (
          <g
            key={step.label}
            className="animate-block-in"
            style={{ animationDelay: `${400 + i * 110}ms` }}
          >
            <path d={d} {...style} />
            <text
              x={step.x + step.w / 2}
              y={y + ROW / 2 + 4}
              textAnchor="middle"
              fontSize="12"
              fill={step.kind === "active" ? "#fff" : "rgb(255 255 255 / 0.62)"}
              style={{ fontFamily: "var(--font-sans)" }}
            >
              {step.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function Mint({ children }: { children: React.ReactNode }) {
  return <span style={{ color: MINT }}>{children}</span>;
}

export function HeroVisual({
  clinicName,
}: {
  clinicName: string;
  practitioners?: PortraitPerson[];
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const glareRef = useRef<HTMLDivElement | null>(null);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const card = cardRef.current;
    const glare = glareRef.current;
    if (!wrap || !card || !glare) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Scroll parallax — the card rides a few pixels behind the page's own scroll, recomputed once
    // per frame rather than on every scroll event.
    const onScroll = () => {
      if (frame.current) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        const rect = wrap.getBoundingClientRect();
        const center = rect.top + rect.height / 2 - window.innerHeight / 2;
        const shift = Math.max(-18, Math.min(18, center * -0.06));
        card.style.setProperty("--hero-parallax", `${shift}px`);
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    // Cursor tilt + glare — desktop-with-a-mouse only. A touch device firing this on scroll would
    // just make the card judder, so it's gated on the same media feature devtools uses for "can
    // this pointer hover precisely."
    const canTilt = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const onMove = (e: PointerEvent) => {
      const rect = card.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;
      const rotateY = (px - 0.5) * 8;
      const rotateX = (0.5 - py) * 8;
      card.style.setProperty("--hero-tilt-x", `${rotateX}deg`);
      card.style.setProperty("--hero-tilt-y", `${rotateY}deg`);
      glare.style.setProperty("--hero-glare-x", `${px * 100}%`);
      glare.style.setProperty("--hero-glare-y", `${py * 100}%`);
      glare.style.opacity = "1";
    };
    const onLeave = () => {
      card.style.setProperty("--hero-tilt-x", "0deg");
      card.style.setProperty("--hero-tilt-y", "0deg");
      glare.style.opacity = "0";
    };
    if (canTilt) {
      card.addEventListener("pointermove", onMove);
      card.addEventListener("pointerleave", onLeave);
    }

    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame.current) cancelAnimationFrame(frame.current);
      if (canTilt) {
        card.removeEventListener("pointermove", onMove);
        card.removeEventListener("pointerleave", onLeave);
      }
    };
  }, []);

  return (
    <div ref={wrapRef} className="relative">
      {/* The device: a dark bezel around a light "screen", tilting toward the cursor. */}
      <div
        ref={cardRef}
        className="hero-card group relative rounded-[2rem] bg-[#0a1411] p-2.5 shadow-[0_50px_120px_-30px_color-mix(in_oklch,var(--color-primary)_80%,transparent)] ring-1 ring-white/15 sm:rounded-[2.5rem] sm:p-4"
      >
        {/* Front camera — the small detail that makes it read as a tablet, not a framed picture. */}
        <span
          aria-hidden
          className="absolute left-1/2 top-1 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-white/25 sm:top-1.5"
        />
        <div className="relative overflow-hidden rounded-[1.4rem] bg-[#0e1614] text-white sm:rounded-[1.9rem]">
          {/* A slice of the site's own chrome, drawn — decorative only. */}
          <div
            aria-hidden
            className="flex h-10 items-center gap-2.5 border-b border-white/10 px-4 text-[10px] sm:h-12 sm:text-xs"
          >
            <span className="h-4 w-4 rounded-md bg-primary sm:h-5 sm:w-5" />
            <span className="font-medium text-white/90">{clinicName}</span>
            <span className="mx-auto hidden overflow-hidden rounded-md border border-white/15 text-white/60 sm:flex">
              <span className="border-r border-white/15 px-3 py-1">Treatments</span>
              <span className="border-r border-white/15 px-3 py-1">Team</span>
              <span className="px-3 py-1">Book</span>
            </span>
            <span className="ml-auto rounded-md bg-primary px-3 py-1 text-primary-foreground sm:ml-0">
              Book
            </span>
          </div>

          <div className="px-5 pb-10 pt-8 text-center sm:px-10 sm:pb-16 sm:pt-10">
            <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-white/55 sm:text-xs">
              <RefreshCw className="h-3 w-3" />
              How booking works
            </div>
            <h2 className="mx-auto mt-3 max-w-[26ch] font-serif text-xl font-normal leading-snug tracking-[-0.02em] sm:mt-4 sm:text-[2rem]">
              Book in <Mint>under a minute</Mint> — from first message to{" "}
              <Mint>confirmed visit</Mint>
            </h2>

            <div className="mx-auto mt-6 max-w-md rounded-xl border border-white/10 bg-white/[0.04] p-4 text-left sm:mt-8 sm:p-5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 text-[#5eead4]">
                <Sparkles className="h-4 w-4" />
              </span>
              <p className="mt-3 text-[13px] leading-relaxed text-white/75 sm:text-sm">
                Tell us the treatment and roughly when suits you. We check the real calendar against
                each practitioner, hold the time, and confirm by email straight away.
              </p>
            </div>

            <FlowDiagram />
          </div>

          {/* The cursor-tracked glare — a soft radial highlight, opacity driven entirely by
              pointer state above so it's invisible until a mouse is actually over the screen. */}
          <div
            ref={glareRef}
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300"
            style={{
              background:
                "radial-gradient(360px circle at var(--hero-glare-x, 50%) var(--hero-glare-y, 50%), rgba(255,255,255,0.18), transparent 60%)",
            }}
          />
        </div>
      </div>
    </div>
  );
}
