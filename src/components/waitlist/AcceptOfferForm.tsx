"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2 } from "lucide-react";

type Outcome = { kind: "accepted" } | { kind: "declined" } | { kind: "error"; message: string };

export function AcceptOfferForm({ token }: { token: string }) {
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const act = async (action: "accept" | "decline") => {
    setBusy(action);
    try {
      const res = await fetch(`/api/waitlist/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) {
        setOutcome({ kind: "error", message: data.error ?? "Something went wrong." });
        return;
      }
      setOutcome({ kind: action === "accept" ? "accepted" : "declined" });
    } catch {
      setOutcome({ kind: "error", message: "Network error — please check your connection." });
    } finally {
      setBusy(null);
    }
  };

  if (outcome?.kind === "accepted") {
    return (
      <div className="text-center space-y-3 py-4">
        <CheckCircle2 className="h-10 w-10 text-success mx-auto" />
        <h2 className="font-semibold">You're booked!</h2>
        <p className="text-sm text-muted-foreground">
          This slot is now yours. We've sent a confirmation to your email — see you then.
        </p>
      </div>
    );
  }

  if (outcome?.kind === "declined") {
    return (
      <div className="text-center space-y-3 py-4">
        <h2 className="font-semibold">No problem</h2>
        <p className="text-sm text-muted-foreground">
          We've let this slot go to the next person on the list. You're still on the waitlist for
          anything else that matches.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {outcome?.kind === "error" && (
        <p className="text-sm text-destructive text-center">{outcome.message}</p>
      )}
      <div className="flex flex-col sm:flex-row gap-2">
        <Button onClick={() => act("accept")} disabled={busy !== null} className="flex-1">
          {busy === "accept" && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
          Accept &amp; Book
        </Button>
        <Button
          variant="outline"
          onClick={() => act("decline")}
          disabled={busy !== null}
          className="flex-1"
        >
          {busy === "decline" && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
          Not for me
        </Button>
      </div>
    </div>
  );
}
