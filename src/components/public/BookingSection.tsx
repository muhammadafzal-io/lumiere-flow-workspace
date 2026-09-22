"use client";

import { useEffect, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import ChatWidget from "@/components/ChatWidget";

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
}

/**
 * The booking band — the page's anchor, and the one place the palette inverts.
 *
 * The widget sits raised against the dark ground with the invitation set beside it, so booking
 * reads as part of the page rather than a chat bubble bolted to the corner. Nothing about the
 * conversation or the booking rules changes; this is chrome around the same component.
 */
export function BookingBand(props: ClinicProps) {
  return (
    <section id="book" className="scroll-mt-16 bg-lumiere-navy">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-5">
            <div className="text-[11px] uppercase tracking-[0.2em] text-lumiere-rose">Booking</div>
            <h2 className="mt-4 font-serif text-4xl font-medium leading-[1.08] tracking-[-0.03em] text-white sm:text-5xl">
              Book in under a minute.
            </h2>
            <p className="mt-5 max-w-[42ch] leading-relaxed text-white/70">
              Tell us the treatment and roughly when suits you. We&apos;ll check the calendar, hold
              the time, and send your confirmation — or answer anything you want to ask first.
            </p>
            {/* Numbered rather than bulleted: the same treatment as the treatment index, so a
                visitor reads this as "the three steps" rather than a scattered feature list. */}
            <ol className="mt-9 space-y-5 border-t border-white/15">
              {[
                {
                  title: "Tell us what you'd like",
                  body: "Treatment, and roughly when suits you.",
                },
                {
                  title: "We check real availability",
                  body: "Against the actual calendar, not a guess.",
                },
                {
                  title: "Get confirmed",
                  body: "By email, straight away — no waiting on a callback.",
                },
              ].map((step, i) => (
                <li key={step.title} className="flex gap-4 pt-5">
                  <span className="font-serif text-lg font-medium text-lumiere-rose">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <div className="text-sm font-medium text-white">{step.title}</div>
                    <div className="mt-0.5 text-sm text-white/60">{step.body}</div>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="lg:col-span-7">
            {/* Raised and slightly overlapping the band's rhythm, so it reads as an object on the
                page rather than a panel dropped into a column. */}
            <div className="overflow-hidden rounded-2xl bg-white shadow-[0_30px_60px_-20px_rgba(0,0,0,0.45)] ring-1 ring-white/10">
              <div className="h-[540px] sm:h-[600px]">
                <ChatWidget {...props} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * The floating alternative. Hidden while the embedded booking section is on screen, so the two
 * never compete for the same tap.
 */
export function FloatingBooking(props: ClinicProps) {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);

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

  if (open) {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-end sm:p-6">
        <button
          aria-label="Close booking"
          onClick={() => setOpen(false)}
          className="absolute inset-0 bg-lumiere-navy/40 backdrop-blur-sm"
        />
        <div className="relative z-10 flex h-[85vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:h-[620px] sm:max-w-md sm:rounded-2xl motion-safe:animate-slide-up">
          <div className="flex items-center justify-end border-b border-lumiere-ivory bg-lumiere-navy px-2 py-2">
            <button
              onClick={() => setOpen(false)}
              className="rounded-lg p-1.5 text-white/80 hover:bg-white/10 hover:text-white"
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
      onClick={() => setOpen(true)}
      className={`fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-lumiere-navy px-5 py-3.5 text-sm font-medium text-white shadow-lg transition-all hover:bg-lumiere-navy-light motion-reduce:transition-none ${
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
