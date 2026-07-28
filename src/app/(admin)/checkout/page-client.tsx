"use client";

import { useState, useRef } from "react";
import {
  CheckCircle,
  XCircle,
  Loader2,
  Tag,
  Clock,
  User,
  DollarSign,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AccessGate } from "@/components/rbac/AccessGate";
import { useCurrentUser } from "@/lib/current-user-context";

interface ValidateResult {
  valid: boolean;
  error?: string;
  code?: string;
  clientId?: string;
  clientName?: string;
  clientPhone?: string;
  clientEmail?: string;
  creditAmount?: number;
  expiresAt?: string;
  daysRemaining?: number;
}

interface RedeemResult {
  success: boolean;
  error?: string;
  clientName?: string;
  creditAmount?: number;
  redeemedAt?: string;
  message?: string;
}

interface RedemptionRecord {
  code: string;
  clientName: string;
  creditAmount: number;
  redeemedAt: string;
}

export default function CheckoutClient() {
  const { loading: userLoading, unauthenticated, can } = useCurrentUser();
  const [code, setCode] = useState("");
  const [phone, setPhone] = useState("");
  const [validating, setValidating] = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  const [validation, setValidation] = useState<ValidateResult | null>(null);
  const [redeemResult, setRedeemResult] = useState<RedeemResult | null>(null);
  const [history, setHistory] = useState<RedemptionRecord[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  if (userLoading) return null;
  if (unauthenticated) return <AccessGate status={401} />;
  if (!can("credits")) return <AccessGate status={403} />;

  async function handleValidate() {
    const trimmed = code.trim().toUpperCase();
    const phoneTrimmed = phone.trim();
    if (!trimmed || !phoneTrimmed) return;
    setValidating(true);
    setValidation(null);
    setRedeemResult(null);
    try {
      const res = await fetch(
        `/api/credits/validate?code=${encodeURIComponent(trimmed)}&phone=${encodeURIComponent(phoneTrimmed)}`,
      );
      const data = (await res.json()) as ValidateResult;
      setValidation(data);
    } catch {
      setValidation({ valid: false, error: "Network error — could not reach server" });
    } finally {
      setValidating(false);
    }
  }

  async function handleRedeem() {
    if (!validation?.valid || !validation.code) return;
    setRedeeming(true);
    try {
      const res = await fetch("/api/credits/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: validation.code }),
      });
      const data = (await res.json()) as RedeemResult;
      setRedeemResult(data);
      if (data.success && validation.clientName && validation.creditAmount) {
        setHistory((prev) => [
          {
            code: validation.code!,
            clientName: validation.clientName!,
            creditAmount: validation.creditAmount!,
            redeemedAt: data.redeemedAt ?? new Date().toISOString(),
          },
          ...prev,
        ]);
      }
    } catch {
      setRedeemResult({ success: false, error: "Network error — could not reach server" });
    } finally {
      setRedeeming(false);
    }
  }

  function handleReset() {
    setCode("");
    setPhone("");
    setValidation(null);
    setRedeemResult(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  const isRedeemed = redeemResult?.success;

  return (
    <div className="max-w-xl mx-auto space-y-6">
      {/* header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Checkout — Credit Codes</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Validate and apply birthday credits at the front desk.
        </p>
      </div>

      {/* lookup card */}
      <div className="rounded-xl border bg-card p-6 space-y-4 shadow-sm">
        <div className="flex gap-2">
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Client phone"
            className="text-base"
            disabled={validating || isRedeemed}
          />
        </div>
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && handleValidate()}
            placeholder="BDAY-MA-IP1L"
            className="font-mono text-base tracking-widest uppercase"
            disabled={validating || isRedeemed}
            autoFocus
          />
          <Button
            onClick={handleValidate}
            disabled={!code.trim() || !phone.trim() || validating || !!validation}
          >
            {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Check"}
          </Button>
          {(validation || redeemResult) && (
            <Button variant="outline" size="icon" onClick={handleReset} title="Start over">
              <RotateCcw className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* validation result */}
        {validation && !isRedeemed && (
          <div
            className={`rounded-lg p-4 space-y-3 ${
              validation.valid
                ? "bg-green-50 border border-green-200 dark:bg-green-950/20 dark:border-green-800"
                : "bg-red-50 border border-red-200 dark:bg-red-950/20 dark:border-red-800"
            }`}
          >
            <div className="flex items-center gap-2">
              {validation.valid ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <XCircle className="h-5 w-5 text-red-600" />
              )}
              <span
                className={`font-semibold ${validation.valid ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}
              >
                {validation.valid ? "Valid Code" : (validation.error ?? "Invalid Code")}
              </span>
            </div>

            {validation.valid && (
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <User className="h-3.5 w-3.5" />
                  <span className="font-medium text-foreground">{validation.clientName}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <DollarSign className="h-3.5 w-3.5" />
                  <span className="font-medium text-foreground">
                    ${validation.creditAmount} credit
                  </span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Tag className="h-3.5 w-3.5" />
                  <span className="font-mono text-foreground">{validation.code}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  <span className="text-foreground">
                    {validation.daysRemaining} days left
                    {validation.expiresAt ? ` (exp. ${validation.expiresAt})` : ""}
                  </span>
                </div>
              </div>
            )}

            {validation.valid && (
              <Button className="w-full" onClick={handleRedeem} disabled={redeeming}>
                {redeeming ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Redeeming…
                  </>
                ) : (
                  `Apply $${validation.creditAmount} Credit for ${validation.clientName}`
                )}
              </Button>
            )}
          </div>
        )}

        {/* redemption success */}
        {isRedeemed && redeemResult && (
          <div className="rounded-lg p-5 bg-green-50 border border-green-200 dark:bg-green-950/20 dark:border-green-800 space-y-2 text-center">
            <CheckCircle className="h-10 w-10 text-green-600 mx-auto" />
            <p className="text-lg font-semibold text-green-700 dark:text-green-400">
              ${redeemResult.creditAmount} Applied!
            </p>
            <p className="text-sm text-muted-foreground">{redeemResult.message}</p>
            <Button className="mt-2 w-full" variant="outline" onClick={handleReset}>
              New Lookup
            </Button>
          </div>
        )}

        {/* redeem error */}
        {redeemResult && !redeemResult.success && (
          <div className="rounded-lg p-4 bg-red-50 border border-red-200 dark:bg-red-950/20 dark:border-red-800 flex items-center gap-2">
            <XCircle className="h-5 w-5 text-red-600 shrink-0" />
            <span className="text-sm text-red-700 dark:text-red-400">{redeemResult.error}</span>
          </div>
        )}
      </div>

      {/* session history */}
      {history.length > 0 && (
        <div className="rounded-xl border bg-card p-5 space-y-3 shadow-sm">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Redeemed This Session
          </h2>
          <ul className="space-y-2">
            {history.map((r, i) => (
              <li key={i} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                  <span className="font-medium">{r.clientName}</span>
                  <span className="font-mono text-muted-foreground">{r.code}</span>
                </div>
                <Badge variant="secondary">${r.creditAmount} off</Badge>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
