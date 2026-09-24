"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import ChatWidget from "@/components/ChatWidget";
import { FloatingChatDemo } from "@/components/public/FloatingChatDemo";
import { Reveal } from "@/components/public/PublicChrome";

/**
 * How a visitor books.
 *
 * The same ChatWidget appears twice — framed in the page for anyone who scrolls to it, and behind
 * a floating button for anyone who doesn't. Only one is mounted at a time, so there is never a
 * second conversation running in the background, and nothing about the booking flow changes.
 */

interface ClinicProps {
  clinicName: string;
  location: string;
  businessHours: string;
  address: string;
  treatmentNames?: string[];
}

const STEPS = [
  { title: "Tell us what you'd like", body: "Treatment, and roughly when suits you." },
  { title: "We check real availability", body: "Against the actual calendar, not a guess." },
  { title: "Get confirmed", body: "By email, straight away — no waiting on a callback." },
];

/**
 * The booking band — the page's anchor, and the one place the palette inverts.
 *
 * The widget sits raised against the dark ground with the invitation set beside it, so booking
 * reads as part of the page rather than a chat bubble bolted to the corner. Nothing about the
 * conversation or the booking rules changes; this is chrome around the same component. The
 * calendar mark layered behind it is decoration with a point — it's the one visual proof, on a
 * page that keeps promising "we check the real calendar," rather than just another claim in copy.
 */
export function BookingBand({ treatmentNames = [], ...props }: ClinicProps) {
  return (
    <section id="book" className="relative scroll-mt-16 overflow-clip bg-panel">
      {/* Ambient glow — the same "soft depth behind the object" language the hero's blobs use,
          just in the panel's own darker register so the section still reads as one dark ground. */}
      <div
        aria-hidden
        className="animate-blob-drift-slow pointer-events-none absolute -left-24 top-0 h-96 w-96 rounded-full bg-primary/20 blur-3xl"
      />
      <div
        aria-hidden
        className="animate-blob-drift pointer-events-none absolute -bottom-24 right-0 h-80 w-80 rounded-full bg-primary/10 blur-3xl"
      />

      <div className="relative mx-auto max-w-6xl px-4 pb-12 pt-8 sm:px-6 sm:pb-16 sm:pt-10">
        <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-14">
          <div className="min-w-0 lg:col-span-5">
            <Reveal>
              <div className="text-[11px] uppercase tracking-[0.2em] text-primary">Booking</div>
              <h2 className="mt-4 font-serif text-4xl font-medium leading-[1.08] tracking-[-0.03em] text-panel-foreground sm:text-5xl">
                Book in under a minute.
              </h2>
              <p className="mt-5 max-w-[42ch] leading-relaxed text-panel-foreground/70">
                Tell us the treatment and roughly when suits you. We&apos;ll check the calendar,
                hold the time, and send your confirmation — or answer anything you want to ask
                first.
              </p>
            </Reveal>
            {/* Numbered rather than bulleted: the same treatment as the treatment index, so a
                visitor reads this as "the three steps" rather than a scattered feature list. */}
            <ol className="mt-9 space-y-5 border-t border-panel-foreground/15">
              {STEPS.map((step, i) => (
                <Reveal key={step.title} delay={120 + i * 100}>
                  <li className="flex gap-4 pt-5">
                    <span className="w-7 flex-shrink-0 font-serif text-lg font-medium text-primary">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <div className="text-sm font-medium text-panel-foreground">{step.title}</div>
                      <div className="mt-0.5 text-sm text-panel-foreground/60">{step.body}</div>
                    </div>
                  </li>
                </Reveal>
              ))}
            </ol>
          </div>

          <Reveal delay={160} className="relative min-w-0 lg:col-span-7">
            {/* The calendar mark, peeking out top-right at a slight tilt — a second card in the
                stack, not the main event. Hidden below lg: there isn't room for two cards to read
                as layered rather than just cramped once the column narrows. */}
            <div className="absolute -right-16 top-20 z-0 hidden lg:block xl:-right-20">
              <FloatingChatDemo treatment={treatmentNames[0] ?? "a treatment"} />
            </div>

            {/* The widget sits in a padded frame — a lighter glass border around the white card —
                so it reads as a mounted object rather than a panel filling its column. */}
            <div className="relative z-10 mt-8 rounded-[1.75rem] bg-white/[0.14] p-3 shadow-[0_40px_80px_-30px_rgba(0,0,0,0.7)] ring-1 ring-white/30 sm:p-5 lg:mr-24 xl:mr-32">
              <div className="overflow-hidden rounded-2xl bg-white shadow-[0_30px_60px_-20px_rgba(0,0,0,0.45)]">
                <div className="h-[540px] sm:h-[600px]">
                  <ChatWidget {...props} />
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/**
 * The floating alternative. Hidden while the embedded booking section is on screen, so the two
 * never compete for the same tap.
 */
export function FloatingBooking({ treatmentNames, ...props }: ClinicProps) {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const section = document.getElementById("book");
    if (!section) return;
    const observer = new IntersectionObserver(([entry]) => setHidden(entry.isIntersecting), {
      rootMargin: "-10% 0px",
    });
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  // Stop the page scrolling behind the panel on a phone, where it covers the screen.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // A keyboard or screen-reader visitor gets no other cue that a panel just covered the screen —
  // move focus into it on open, and hand focus back to the button that opened it on close. Skips
  // the first render, or merely loading the page would pull focus onto the floating button.
  const settled = useRef(false);
  useEffect(() => {
    if (!settled.current) {
      settled.current = true;
      return;
    }
    if (open) closeRef.current?.focus();
    else triggerRef.current?.focus();
  }, [open]);

  if (open) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Book an appointment"
        className="fixed inset-0 z-50 flex items-end justify-end sm:p-6"
      >
        <button
          aria-label="Close booking"
          onClick={() => setOpen(false)}
          className="absolute inset-0 bg-panel/40 backdrop-blur-sm"
        />
        <div className="relative z-10 flex h-[85vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:h-[620px] sm:max-w-md sm:rounded-2xl motion-safe:animate-slide-up">
          <div className="flex items-center justify-end border-b border-panel-foreground/10 bg-panel px-2 py-2">
            <button
              ref={closeRef}
              onClick={() => setOpen(false)}
              className="rounded-lg p-1.5 text-panel-foreground/80 hover:bg-panel-foreground/10 hover:text-panel-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-panel-foreground/60"
              aria-label="Close booking"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <ChatWidget {...props} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <button
      ref={triggerRef}
      onClick={() => setOpen(true)}
      className={`fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3.5 text-sm font-medium text-primary-foreground shadow-lg transition-all hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none ${
        hidden ? "pointer-events-none translate-y-4 opacity-0" : "opacity-100"
      }`}
      aria-hidden={hidden}
      tabIndex={hidden ? -1 : 0}
    >
      <MessageCircle className="h-4 w-4" />
      Book appointment
    </button>
  );
}
