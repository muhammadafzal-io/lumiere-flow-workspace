import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function getChannelStatus() {
  return {
    whatsapp: {
      connected: process.env.MESSAGING_PROVIDER === "whatsapp",
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
      connected: !!(process.env.SENDGRID_API_KEY || process.env.SMTP_HOST),
      label: "Email sender",
    },
  };
}

export async function GET() {
  try {
    const sb = getSupabase();

    const [settingsRes, teamRes] = await Promise.allSettled([
      sb.from("Settings").select("*").limit(1).maybeSingle(),
      sb.from("Practitioners").select("*").order("Name"),
    ]);

    const settingsRow = settingsRes.status === "fulfilled" ? settingsRes.value.data : null;
    const teamRows = teamRes.status === "fulfilled" ? (teamRes.value.data ?? []) : [];

    const clinic = settingsRow
      ? {
          recordId: settingsRow.id,
          clinicName: settingsRow["Clinic Name"] ?? "",
          timezone: settingsRow["Timezone"] ?? "",
          address: settingsRow["Address"] ?? "",
          businessHours: settingsRow["Business Hours"] ?? "",
        }
      : null;

    const team = teamRows.map((r: any) => ({
      id: r.id,
      name: r["Name"] ?? "",
      email: r["Email"] ?? "",
      role: r["Role"] ?? "",
      color: r["Color"] ?? "#6366f1",
    }));

    return NextResponse.json({ clinic, team, channels: getChannelStatus() });
  } catch (error) {
    console.error("GET /api/settings error:", error);
    return NextResponse.json({ error: "Failed to load settings" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const sb = getSupabase();
    const body = await req.json();
    const { recordId, clinicName, timezone, address, businessHours } = body;

    const fields: Record<string, string> = {};
    if (clinicName !== undefined) fields["Clinic Name"] = clinicName;
    if (timezone !== undefined) fields["Timezone"] = timezone;
    if (address !== undefined) fields["Address"] = address;
    if (businessHours !== undefined) fields["Business Hours"] = businessHours;

    if (recordId) {
      const { data, error } = await sb
        .from("Settings")
        .update(fields)
        .eq("id", recordId)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ success: true, recordId: data.id });
    } else {
      const { data, error } = await sb.from("Settings").insert(fields).select().single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ success: true, recordId: data.id });
    }
  } catch (error) {
    console.error("PATCH /api/settings error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
