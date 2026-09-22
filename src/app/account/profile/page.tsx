"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useAccountData } from "@/lib/account/use-account-data";
import {
  PageHeader,
  AccountCard,
  AccountError,
  AccountLoading,
  PrimaryButton,
  SecondaryButton,
} from "@/components/account/AccountUI";

interface Profile {
  name: string;
  phone: string;
  email: string;
  birthday: string;
  treatmentInterest: string;
  clientSince: string | null;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function AccountProfilePage() {
  const {
    data,
    loading,
    error: loadError,
    reload,
  } = useAccountData<{ profile: Profile }>("/api/account/profile");
  const profile = data?.profile ?? null;

  const [form, setForm] = useState<Profile | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // A background refresh (the hook's own focus/visibility revalidation) must never clobber what
  // the client is mid-way through typing — only ever seed the draft the moment editing starts.
  useEffect(() => {
    if (!editing) setSaved(false);
  }, [profile, editing]);

  const save = async () => {
    if (!form) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          phone: form.phone,
          birthday: form.birthday,
          treatmentInterest: form.treatmentInterest,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "We couldn't save that.");
      setEditing(false);
      setSaved(true);
      // Re-fetch from the database rather than trusting the local draft, so what's shown after
      // saving is what actually persisted, not just an optimistic echo of the form.
      reload();
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "We couldn't save that.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <AccountLoading rows={1} />;
  if (!profile) {
    return (
      <AccountError message={loadError ?? "We couldn't load your details."} onRetry={reload} />
    );
  }

  return (
    <div>
      <PageHeader title="Your details" subtitle="Keep these up to date so we can reach you." />

      <AccountCard className="p-5 space-y-4 max-w-lg">
        {editing && form ? (
          <>
            <Field
              label="Full name"
              value={form.name}
              onChange={(v) => setForm({ ...form, name: v })}
            />
            <Field
              label="Phone"
              value={form.phone}
              onChange={(v) => setForm({ ...form, phone: v })}
              inputMode="tel"
            />
            <Field
              label="Birthday"
              type="date"
              value={form.birthday?.slice(0, 10) ?? ""}
              onChange={(v) => setForm({ ...form, birthday: v })}
            />
            <Field
              label="Treatments you're interested in"
              value={form.treatmentInterest}
              onChange={(v) => setForm({ ...form, treatmentInterest: v })}
              placeholder="e.g. Botox, HydraFacial"
            />
            <div>
              <div className="text-xs text-lumiere-muted">Email</div>
              <div className="text-sm text-lumiere-navy mt-0.5">{profile.email || "—"}</div>
              <p className="text-[11px] text-lumiere-muted mt-1">
                This is how we recognise your account — contact the clinic to change it.
              </p>
            </div>

            {saveError && <p className="text-sm text-destructive">{saveError}</p>}

            <div className="flex gap-2">
              <PrimaryButton onClick={save} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                Save
              </PrimaryButton>
              <SecondaryButton
                onClick={() => {
                  setEditing(false);
                  setSaveError(null);
                }}
                disabled={saving}
              >
                Cancel
              </SecondaryButton>
            </div>
          </>
        ) : (
          <>
            <Row label="Full name" value={profile.name} />
            <Row label="Phone" value={profile.phone} />
            <Row label="Email" value={profile.email} />
            <Row label="Birthday" value={profile.birthday?.slice(0, 10) ?? ""} />
            <Row label="Treatments you're interested in" value={profile.treatmentInterest} />
            <Row label="Client since" value={fmtDate(profile.clientSince)} />
            {saved && <p className="text-sm text-success">Saved.</p>}
            <SecondaryButton
              onClick={() => {
                setForm(profile);
                setEditing(true);
                setSaveError(null);
              }}
            >
              Edit details
            </SecondaryButton>
          </>
        )}
      </AccountCard>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-lumiere-muted">{label}</div>
      <div className="text-sm text-lumiere-navy mt-0.5 break-words">{value || "—"}</div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  inputMode,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  inputMode?: "tel" | "text";
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs text-lumiere-muted">{label}</span>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-lumiere-ivory bg-lumiere-cream px-3 py-2.5 text-sm text-lumiere-navy focus:outline-none focus:ring-2 focus:ring-lumiere-rose"
      />
    </label>
  );
}
