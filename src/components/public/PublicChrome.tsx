"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

/**
 * Shared chrome and motion for the public site.
 *
 * The palette is the Lumière one the chat widget already uses (cream canvas, navy chrome,
 * champagne accent) rather than the admin theme, so a visitor meets one brand from the landing
 * page through the widget and into their account.
 */

const LINKS = [
  { href: "#treatments", label: "Treatments" },
  { href: "#book", label: "Book" },
  { href: "#team", label: "Our team" },
  { href: "#visit", label: "Visit us" },
];

export function PublicHeader({ clinicName }: { clinicName: string }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-40 transition-all duration-300 motion-reduce:transition-none ${
        scrolled
          ? "border-b border-lumiere-navy/10 bg-lumiere-cream/90 backdrop-blur"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <Link
          href="/"
          className="font-serif text-lg tracking-tight text-lumiere-navy transition-opacity hover:opacity-70"
        >
          {clinicName}
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] text-lumiere-navy/60 transition-colors hover:text-lumiere-navy"
            >
              {link.label}
            </a>
          ))}
          <Link
            href="/account"
            className="ml-2 rounded-full bg-lumiere-navy px-4 py-2 text-[11px] uppercase tracking-[0.16em] text-white transition-colors hover:bg-lumiere-navy-light"
          >
            My account login
          </Link>
        </nav>

        <button
          className="-mr-2 p-2 text-lumiere-navy md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-lumiere-navy/10 bg-lumiere-cream px-4 pb-4 pt-2 md:hidden">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="block px-3 py-3 text-sm text-lumiere-navy/80 hover:text-lumiere-navy"
            >
              {link.label}
            </a>
          ))}
          <Link
            href="/account"
            onClick={() => setOpen(false)}
            className="mt-2 block rounded-full bg-lumiere-navy px-4 py-3 text-center text-sm font-medium text-white"
          >
            My account login
          </Link>
          <a
            href="#book"
            onClick={() => setOpen(false)}
            className="mt-2 block rounded-full bg-lumiere-navy-light px-4 py-3 text-center text-sm font-medium text-white"
          >
            Book appointment
          </a>
        </div>
      )}
    </header>
  );
}

/**
 * Fades a section in the first time it comes into view. Purely decorative: the content is in the
 * DOM either way, and anyone who asked for less motion simply sees it already in place.
 */
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-700 ease-out motion-reduce:transition-none ${
        shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function PublicFooter({
  clinicName,
  address,
  businessHours,
}: {
  clinicName: string;
  address: string;
  businessHours: string;
}) {
  return (
    <footer className="bg-lumiere-navy text-white/70">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10 grid gap-8 sm:grid-cols-3 text-sm">
        <div>
          <div className="font-serif text-lg text-white">{clinicName}</div>
          <p className="mt-2">{address}</p>
        </div>
        <div>
          <div className="text-white font-medium mb-2">Opening hours</div>
          <p>{businessHours}</p>
        </div>
        <div>
          <div className="text-white font-medium mb-2">Quick links</div>
          <a href="#book" className="block hover:text-white transition-colors">
            Book an appointment
          </a>
          <Link href="/account" className="block hover:text-white transition-colors">
            My account login
          </Link>
          <Link href="/login" className="block hover:text-white transition-colors">
            Staff sign in
          </Link>
        </div>
      </div>
      <div className="border-t border-white/10 py-4 text-center text-xs">
        © {new Date().getFullYear()} {clinicName}
      </div>
    </footer>
  );
}
