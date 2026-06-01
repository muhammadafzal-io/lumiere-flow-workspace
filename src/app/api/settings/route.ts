import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SETTINGS_TABLE = "Settings";
const PRACTITIONERS_TABLE = "Practitioners";

function airtableBase() {
  const token = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!token || !baseId) throw new Error("Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID");
  return { token, baseId };
}

// ── Clinic settings (single record) ──────────────────────────────────────────
async function fetchClinicSettings() {
  const { token, baseId } = airtableBase();
  const res = await fetch(`https://api.airtable.com/v0/${baseId}/${SETTINGS_TABLE}?maxRecords=1`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = await res.json();
  const record = data.records?.[0];
  if (!record) return null;
  return {
    recordId: record.id,
    clinicName: record.fields["Clinic Name"] ?? "",
    timezone: record.fields["Timezone"] ?? "",
    address: record.fields["Address"] ?? "",
    businessHours: record.fields["Business Hours"] ?? "",
  };
}

// ── Team / Practitioners ──────────────────────────────────────────────────────
async function fetchTeam() {
  const { token, baseId } = airtableBase();
  const res = await fetch(`https://api.airtable.com/v0/${baseId}/${PRACTITIONERS_TABLE}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.records ?? []).map((r: any) => ({
    id: r.id,
    name: r.fields["Name"] ?? "",
    email: r.fields["Email"] ?? "",
    role: r.fields["Role"] ?? "",
    color: r.fields["Color"] ?? "#6366f1",
  }));
}

// ── Channel connection status (derived from env vars) ─────────────────────────
function getChannelStatus() {
  return {
    whatsapp: {
      connected: !!(process.env.MESSAGING_PROVIDER === "whatsapp"),
      label: "WhatsApp Business",
    },
    telegram: {
      connected: !!process.env.TELEGRAM_BOT_TOKEN,
      label: "Telegram Bot",
    },
    discord: {
      connected: !!process.env.DISCORD_BOT_TOKEN,
      label: "Discord",
    },
    email: {
      connected: !!process.env.SENDGRID_API_KEY || !!process.env.SMTP_HOST,
      label: "Email sender",
    },
  };
}

// GET /api/settings
export async function GET() {
  try {
    const [clinic, team] = await Promise.allSettled([fetchClinicSettings(), fetchTeam()]);

    return NextResponse.json({
      clinic: clinic.status === "fulfilled" ? clinic.value : null,
      team: team.status === "fulfilled" ? team.value : [],
      channels: getChannelStatus(),
    });
  } catch (error) {
    console.error("GET /api/settings error:", error);
    return NextResponse.json({ error: "Failed to load settings" }, { status: 500 });
  }
}

// PATCH /api/settings — update clinic info
export async function PATCH(req: Request) {
  try {
    const { token, baseId } = airtableBase();
    const body = await req.json();
    const { recordId, clinicName, timezone, address, businessHours } = body;

    const fields: Record<string, string> = {};
    if (clinicName !== undefined) fields["Clinic Name"] = clinicName;
    if (timezone !== undefined) fields["Timezone"] = timezone;
    if (address !== undefined) fields["Address"] = address;
    if (businessHours !== undefined) fields["Business Hours"] = businessHours;

    if (recordId) {
      // Update existing record
      const res = await fetch(
        `https://api.airtable.com/v0/${baseId}/${SETTINGS_TABLE}/${recordId}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ fields }),
        },
      );
      if (!res.ok) {
        const err = await res.json();
        console.error("Airtable PATCH Settings error:", err);
        return NextResponse.json({ error: "Failed to save settings" }, { status: res.status });
      }
      const data = await res.json();
      return NextResponse.json({ success: true, recordId: data.id });
    } else {
      // Create first-ever settings record
      const res = await fetch(`https://api.airtable.com/v0/${baseId}/${SETTINGS_TABLE}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ records: [{ fields }] }),
      });
      if (!res.ok) {
        const err = await res.json();
        console.error("Airtable POST Settings error:", err);
        return NextResponse.json({ error: "Failed to create settings" }, { status: res.status });
      }
      const data = await res.json();
      return NextResponse.json({ success: true, recordId: data.records[0].id });
    }
  } catch (error) {
    console.error("PATCH /api/settings error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
