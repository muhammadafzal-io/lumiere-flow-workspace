"use client";

import { useAccountData } from "@/lib/account/use-account-data";
import {
  PageHeader,
  AccountCard,
  AccountEmpty,
  AccountError,
  AccountLoading,
  SectionLabel,
} from "@/components/account/AccountUI";

interface History {
  treatments: { name: string; visitCount: number; lastDate: string | null }[];
  practitioners: { name: string; visitCount: number; lastDate: string | null }[];
  totalVisits: number;
  firstVisit: string | null;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function AccountHistoryPage() {
  const { data: history, loading, error, reload } = useAccountData<History>("/api/account/history");

  if (loading) return <AccountLoading rows={2} />;
  if (error) return <AccountError message={error} onRetry={reload} />;
  if (!history || history.treatments.length === 0) {
    return (
      <div>
        <PageHeader title="Your history" />
        <AccountEmpty
          title="Nothing here yet"
          body="Once you've visited us, your treatments will be listed here."
          action={{ label: "Book an appointment", href: "/account/book" }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Your history"
        subtitle={`${history.totalVisits} visit${history.totalVisits === 1 ? "" : "s"}${
          history.firstVisit ? ` · with us since ${fmtDate(history.firstVisit)}` : ""
        }`}
      />

      <section>
        <SectionLabel>Treatments</SectionLabel>
        <div className="space-y-2">
          {history.treatments.map((t) => (
            <AccountCard key={t.name} className="px-4 py-3 flex justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-lumiere-navy break-words">{t.name}</div>
                <div className="text-xs text-lumiere-muted mt-0.5">
                  Last on {fmtDate(t.lastDate)}
                </div>
              </div>
              <div className="text-xs text-lumiere-muted whitespace-nowrap">
                {t.visitCount} time{t.visitCount === 1 ? "" : "s"}
              </div>
            </AccountCard>
          ))}
        </div>
      </section>

      {history.practitioners.length > 0 && (
        <section>
          <SectionLabel>Who you&apos;ve seen</SectionLabel>
          <div className="space-y-2">
            {history.practitioners.map((p) => (
              <AccountCard key={p.name} className="px-4 py-3 flex justify-between gap-3">
                <div className="text-sm font-medium text-lumiere-navy">{p.name}</div>
                <div className="text-xs text-lumiere-muted whitespace-nowrap">
                  {p.visitCount} visit{p.visitCount === 1 ? "" : "s"}
                </div>
              </AccountCard>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
