"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2 } from "lucide-react";

type Outcome =
  | { kind: "accepted"; message: string }
  | { kind: "declined" }
  | { kind: "error"; message: string };

export function RespondOfferForm({ token }: { token: string }) {
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const act = async (action: "accept" | "decline") => {
    setBusy(action);
    try {
      const res = await fetch(`/api/offers/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) {
        setOutcome({ kind: "error", message: data.error ?? "Something went wrong." });
        return;
      }
      setOutcome(
        action === "accept"
          ? {
              kind: "accepted",
              message: data.message ?? "This has been added to your appointment.",
            }
          : { kind: "declined" },
      );
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
        <h2 className="font-semibold">All set!</h2>
        <p className="text-sm text-muted-foreground">{outcome.message}</p>
      </div>
    );
  }

  if (outcome?.kind === "declined") {
    return (
      <div className="text-center space-y-3 py-4">
        <h2 className="font-semibold">No problem</h2>
        <p className="text-sm text-muted-foreground">
          Your appointment is unchanged. See you at your scheduled time!
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
          Yes, add it
        </Button>
        <Button
          variant="outline"
          onClick={() => act("decline")}
          disabled={busy !== null}
          className="flex-1"
        >
          {busy === "decline" && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
          No thanks
        </Button>
      </div>
    </div>
  );
}
