"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Facebook, Instagram, Linkedin, Menu, Twitter, X } from "lucide-react";

/**
 * Shared chrome and motion for the public site.
 *
 * Built on the same tokens as the admin portal and the customer account view (bg-background,
 * text-foreground, bg-primary) rather than a separate palette, so a visitor meets one consistent
 * brand from the landing page through the widget and into their account.
 */

const LINKS = [
  { href: "#treatments", label: "Treatments" },
  { href: "#book", label: "Book" },
  { href: "#team", label: "Our team" },
  { href: "#visit", label: "Visit us" },
];

export function PublicHeader({
  clinicName,
  homeHref = "",
  overlay = false,
}: {
  clinicName: string;
  /** Float over a dark hero: fixed to the top, light text until the page scrolls (or the mobile
   * menu opens), then the usual solid bar. Off, it sits in flow and is sticky as before. */
  overlay?: boolean;
  /** Set to "/" on pages other than the homepage so the section anchors lead back to it. */
  homeHref?: string;
}) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const firstLinkRef = useRef<HTMLAnchorElement | null>(null);
  const onScreen = useRef<Set<string>>(new Set());
  const dark = overlay && !scrolled && !open;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /**
   * Which section is actually being read, so the nav says where you are rather than only where you
   * could go. Watches a narrow band under the header: a section is "current" only while it owns
   * that strip, and nothing is current up in the hero.
   */
  useEffect(() => {
    const ids = LINKS.map((link) => link.href.slice(1));
    const sections = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) onScreen.current.add(entry.target.id);
          else onScreen.current.delete(entry.target.id);
        }
        // ids run in document order, so the first one still on screen is the topmost.
        setActiveId(ids.find((id) => onScreen.current.has(id)) ?? null);
      },
      { rootMargin: "-20% 0px -70% 0px" },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  /**
   * Escape closes the panel — and so does growing past the breakpoint where it exists at all,
   * since CSS would hide it while the scroll lock below stayed behind on <body>.
   */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const desktop = window.matchMedia("(min-width: 768px)");
    const onBreakpoint = () => desktop.matches && setOpen(false);
    window.addEventListener("keydown", onKey);
    desktop.addEventListener("change", onBreakpoint);
    return () => {
      window.removeEventListener("keydown", onKey);
      desktop.removeEventListener("change", onBreakpoint);
    };
  }, [open]);

  // Stop the page scrolling behind the panel, the same way the booking panel does.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Move focus into the panel on open and hand it back to the toggle on close — but never on the
  // first render, or simply loading the page would yank focus to the menu button.
  const settled = useRef(false);
  useEffect(() => {
    if (!settled.current) {
      settled.current = true;
      return;
    }
    if (open) firstLinkRef.current?.focus();
    else toggleRef.current?.focus();
  }, [open]);

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
      >
        Skip to content
      </a>

      <header
        className={`${overlay ? "fixed inset-x-0" : "sticky"} top-0 z-40 transition-all duration-300 motion-reduce:transition-none ${
          scrolled || open
            ? "border-b bg-background/90 backdrop-blur"
            : "border-b border-transparent bg-transparent"
        }`}
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* The same mark the admin sidebar and the account portal carry, so one brand follows a
              visitor from here into their account. */}
          <Link
            href="/"
            className="flex items-center gap-2 rounded-md transition-opacity hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <span
              className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-sm font-semibold transition-colors ${
                dark ? "bg-white text-primary" : "bg-primary text-primary-foreground"
              }`}
            >
              {clinicName.trim().charAt(0).toUpperCase() || "L"}
            </span>
            <span
              className={`truncate font-serif text-lg tracking-tight transition-colors ${dark ? "text-white" : "text-foreground"}`}
            >
              {clinicName}
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {LINKS.map((link) => {
              const active = activeId === link.href.slice(1);
              return (
                <a
                  key={link.href}
                  href={`${homeHref}${link.href}`}
                  aria-current={active ? "true" : undefined}
                  className={`relative ${link.href === "#book" || link.href === "#visit" ? "hidden lg:inline-block" : ""} whitespace-nowrap rounded-full px-2 py-1.5 text-[11px] uppercase tracking-[0.16em] transition-colors lg:px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                    dark
                      ? active
                        ? "text-white"
                        : "text-white/70 hover:text-white"
                      : active
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {link.label}
                  {active && (
                    <span className="absolute inset-x-3 bottom-0 h-px bg-primary" aria-hidden />
                  )}
                </a>
              );
            })}

            <Link
              href="/login"
              target="_blank"
              rel="noopener noreferrer"
              className={`ml-1 hidden rounded-full lg:inline-block px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                dark
                  ? "text-white/50 hover:text-white"
                  : "text-muted-foreground/70 hover:text-foreground"
              }`}
            >
              Admin
            </Link>

            {/* Booking is the page's whole purpose, so it keeps the filled button; the account
                link is for people who already booked, and sits back accordingly. */}
            <Link
              href="/account"
              target="_blank"
              rel="noopener noreferrer"
              className={`ml-1 whitespace-nowrap rounded-full border px-3 py-2 text-[11px] lg:ml-2 lg:px-4 uppercase tracking-[0.16em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                dark
                  ? "border-white/30 text-white hover:border-white/60 hover:bg-white/10"
                  : "text-foreground hover:border-foreground/30"
              }`}
            >
              My account
            </Link>
            <a
              href={`${homeHref}#book`}
              className={`whitespace-nowrap rounded-full px-3 py-2 text-[11px] uppercase tracking-[0.16em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 lg:px-4 ${
                dark
                  ? "bg-white text-primary hover:bg-white/90"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              }`}
            >
              Book appointment
            </a>
          </nav>

          <button
            ref={toggleRef}
            className={`-mr-2 rounded-md p-2 md:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${dark ? "text-white" : "text-foreground"}`}
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="public-menu"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {open && (
          <>
            <button
              aria-label="Close menu"
              onClick={() => setOpen(false)}
              className="fixed inset-x-0 bottom-0 top-16 bg-foreground/20 backdrop-blur-sm md:hidden"
            />
            <div
              id="public-menu"
              className="relative border-t bg-background px-4 pb-4 pt-2 md:hidden animate-in fade-in-0 slide-in-from-top-2 duration-200"
            >
              {LINKS.map((link, i) => {
                const active = activeId === link.href.slice(1);
                return (
                  <a
                    key={link.href}
                    href={`${homeHref}${link.href}`}
                    ref={i === 0 ? firstLinkRef : undefined}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "true" : undefined}
                    className={`block rounded-md px-3 py-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      active
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {link.label}
                  </a>
                );
              })}
              <a
                href={`${homeHref}#book`}
                onClick={() => setOpen(false)}
                className="mt-2 block rounded-full bg-primary px-4 py-3 text-center text-sm font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                Book appointment
              </a>
              <Link
                href="/account"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
                className="mt-2 block rounded-full border px-4 py-3 text-center text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                My account
              </Link>
              <Link
                href="/login"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
                className="mt-1 block rounded-md px-3 py-3 text-center text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Admin login
              </Link>
            </div>
          </>
        )}
      </header>
    </>
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

/** Social profiles. Left blank on purpose — paste each profile URL into `href` and the icon goes
 * live (opens in a new tab); until then the icon is just a placeholder that goes nowhere. */
const SOCIALS = [
  { label: "Instagram", href: "", icon: Instagram },
  { label: "Facebook", href: "", icon: Facebook },
  { label: "X (Twitter)", href: "", icon: Twitter },
  { label: "LinkedIn", href: "", icon: Linkedin },
];

export function PublicFooter({
  clinicName,
  address,
  businessHours,
  homeHref = "",
}: {
  clinicName: string;
  address: string;
  businessHours: string;
  homeHref?: string;
}) {
  return (
    <footer className="bg-panel text-panel-foreground/70">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10 grid gap-8 sm:grid-cols-3 text-sm">
        <div>
          <div className="font-serif text-lg text-panel-foreground">{clinicName}</div>
          <p className="mt-2">{address}</p>
        </div>
        <div>
          <div className="text-panel-foreground font-medium mb-2">Opening hours</div>
          <p>{businessHours}</p>
        </div>
        <div>
          <div className="text-panel-foreground font-medium mb-2">Quick links</div>
          <a
            href={`${homeHref}#book`}
            className="block rounded-sm hover:text-panel-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Book an appointment
          </a>
          <Link
            href="/account"
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-sm hover:text-panel-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            My account login
          </Link>
          <Link
            href="/login"
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-sm hover:text-panel-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Admin login
          </Link>
        </div>
      </div>
      <div className="border-t border-panel-foreground/10">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 pb-24 pt-4 text-xs sm:flex-row sm:gap-6 sm:px-6 sm:py-4">
          <ul className="flex items-center gap-2" aria-label="Social media">
            {SOCIALS.map(({ label, href, icon: Icon }) => (
              <li key={label}>
                <a
                  href={href || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  // Blank until a real profile URL is filled into SOCIALS — an empty link must not
                  // jump the page to the top or open an empty tab.
                  onClick={href ? undefined : (e) => e.preventDefault()}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-panel-foreground/15 transition-colors hover:border-panel-foreground/40 hover:bg-panel-foreground/10 hover:text-panel-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Icon className="h-4 w-4" />
                </a>
              </li>
            ))}
          </ul>
          <span>
            © {new Date().getFullYear()} {clinicName}
          </span>
        </div>
      </div>
    </footer>
  );
}
