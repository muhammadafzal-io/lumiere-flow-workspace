"use client";

import { useMemo, useState } from "react";
import {
  CalendarCheck,
  CalendarClock,
  FileText,
  Mail,
  StickyNote,
  type LucideIcon,
} from "lucide-react";
import type { TimelineItem, TimelineKind } from "@/lib/account/timeline";
import { AccountCard, AccountEmpty } from "@/components/account/AccountUI";
import { SecondaryButton } from "@/components/account/AccountUI";
import { cn } from "@/lib/utils";

/**
 * The client's whole history with the clinic as one vertical timeline, newest first and grouped by
 * month — visits, forms, emails they were sent, changes to bookings and practitioner notes shared
 * with them. Filter chips narrow it to one kind of thing.
 */

const KINDS: Record<TimelineKind, { label: string; icon: LucideIcon }> = {
  visit: { label: "Visits", icon: CalendarCheck },
  form: { label: "Forms", icon: FileText },
  email: { label: "Emails", icon: Mail },
  change: { label: "Changes", icon: CalendarClock },
  note: { label: "Notes", icon: StickyNote },
};

const PAGE = 15;

const monthOf = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "long", year: "numeric" });
const dayOf = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

export function Timeline({ items }: { items: TimelineItem[] }) {
  const [filter, setFilter] = useState<TimelineKind | "all">("all");
  const [visible, setVisible] = useState(PAGE);

  const present = useMemo(() => {
    const kinds = new Set(items.map((i) => i.kind));
    return (Object.keys(KINDS) as TimelineKind[]).filter((k) => kinds.has(k));
  }, [items]);

  const filtered = filter === "all" ? items : items.filter((i) => i.kind === filter);
  const shown = filtered.slice(0, visible);

  if (items.length === 0) {
    return (
      <AccountEmpty
        icon={CalendarCheck}
        title="Nothing on your timeline yet"
        body="Visits, forms, emails and notes from the clinic will collect here."
      />
    );
  }

  // Group the visible slice by month, keeping order.
  const groups: { month: string; rows: TimelineItem[] }[] = [];
  for (const item of shown) {
    const month = monthOf(item.at);
    const last = groups[groups.length - 1];
    if (last && last.month === month) last.rows.push(item);
    else groups.push({ month, rows: [item] });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter timeline">
        {(["all", ...present] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={filter === k}
            onClick={() => {
              setFilter(k);
              setVisible(PAGE);
            }}
            className={cn(
              "rounded-full border px-4 py-1.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              filter === k
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card text-foreground hover:border-primary/40",
            )}
          >
            {k === "all" ? "All" : KINDS[k].label}
          </button>
        ))}
      </div>

      {groups.map((group, i) => (
        <div key={`${group.month}-${i}`}>
          <div className="mb-3 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            {group.month}
          </div>
          <ol className="relative space-y-3 border-l border-primary/20 pl-6">
            {group.rows.map((item) => {
              const Icon = KINDS[item.kind].icon;
              return (
                <li key={item.id} className="relative">
                  <span
                    aria-hidden
                    className="absolute -left-[2.125rem] top-3 flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary ring-4 ring-background"
                  >
                    <Icon className="h-3 w-3" />
                  </span>
                  <AccountCard className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="break-words text-sm font-medium text-foreground">
                          {item.title}
                        </div>
                        {item.meta && (
                          <div className="mt-0.5 text-xs text-muted-foreground">{item.meta}</div>
                        )}
                      </div>
                      <div className="flex flex-shrink-0 flex-col items-end gap-1">
                        <span className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                          {dayOf(item.at)}
                        </span>
                        {item.when === "upcoming" && (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                            Upcoming
                          </span>
                        )}
                      </div>
                    </div>
                    {item.detail && (
                      <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground">
                        {item.detail}
                      </p>
                    )}
                  </AccountCard>
                </li>
              );
            })}
          </ol>
        </div>
      ))}

      {filtered.length > visible && (
        <div className="flex justify-center">
          <SecondaryButton onClick={() => setVisible((v) => v + PAGE)}>Show more</SecondaryButton>
        </div>
      )}
    </div>
  );
}
