import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { WIDGET_URL } from "@/lib/client-channels";
import { invalidateClinicTimezoneCache } from "@/lib/clinic-timezone";
import {
  DEFAULT_CLINIC_HOURS,
  invalidateClinicBusinessHoursCache,
  type ClinicHoursSchedule,
} from "@/lib/booking/clinic-hours";

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

    const [settingsRes, teamRes, roomsRes] = await Promise.allSettled([
      sb.from("Settings").select("*").limit(1).maybeSingle(),
      sb.from("Practitioners").select("*").order("Name"),
      sb.from("Rooms").select("Name").order("Name"),
    ]);

    let settingsRow = settingsRes.status === "fulfilled" ? settingsRes.value.data : null;
    const teamRows = teamRes.status === "fulfilled" ? (teamRes.value.data ?? []) : [];
    const roomRows = roomsRes.status === "fulfilled" ? (roomsRes.value.data ?? []) : [];

    const DEFAULTS = {
      "Clinic Name": "Lumière Med Spa",
      Timezone: "America/Chicago",
      Address: "Austin, TX",
      "Business Hours": "Mon–Sat 9:00 AM – 7:00 PM",
    };

    if (!settingsRow) {
      // No row at all — insert defaults
      const { data: seeded } = await sb.from("Settings").insert(DEFAULTS).select().single();
      settingsRow = seeded;
    } else if (!settingsRow["Clinic Name"]) {
      // Row exists but empty — fill in the missing defaults
      const patch: Record<string, string> = {};
      if (!settingsRow["Clinic Name"]) patch["Clinic Name"] = DEFAULTS["Clinic Name"];
      if (!settingsRow["Timezone"]) patch["Timezone"] = DEFAULTS["Timezone"];
      if (!settingsRow["Address"]) patch["Address"] = DEFAULTS["Address"];
      if (!settingsRow["Business Hours"]) patch["Business Hours"] = DEFAULTS["Business Hours"];
      const { data: patched } = await sb
        .from("Settings")
        .update(patch)
        .eq("id", settingsRow.id)
        .select()
        .single();
      if (patched) settingsRow = patched;
    }

    const clinic = settingsRow
      ? {
          recordId: settingsRow.id,
          clinicName: settingsRow["Clinic Name"] || "Lumière Med Spa",
          timezone: settingsRow["Timezone"] || "America/Chicago",
          address: settingsRow["Address"] || "Austin, TX",
          businessHours: settingsRow["Business Hours"] || "Mon–Sat 9:00 AM – 7:00 PM",
          businessHoursSchedule:
            (settingsRow["BusinessHoursSchedule"] as ClinicHoursSchedule | null) ||
            DEFAULT_CLINIC_HOURS,
        }
      : null;

    const team = teamRows.map((r: any) => ({
      id: r.id,
      name: r["Name"] ?? "",
      email: r["Email"] ?? "",
      role: r["Role"] ?? "",
      color: r["Color"] ?? "#6366f1",
      specialty: r["Specialty"] ?? "",
      bio: r["Bio"] ?? "",
      status: r["Status"] ?? "Active",
      qualifications: r["Qualifications"] ?? [],
      workingHours: r["WorkingHours"] ?? null,
      breaks: r["Breaks"] ?? null,
      timeOff: r["TimeOff"] ?? null,
    }));

    const rooms = roomRows.length > 0 ? roomRows.map((r: any) => r.Name) : ["Room 1", "Room 2"];

    return NextResponse.json({
      clinic,
      team,
      channels: getChannelStatus(),
      rooms,
      clientLinks: {
        widgetUrl: WIDGET_URL,
        discordInviteUrl: process.env.NEXT_PUBLIC_DISCORD_INVITE_URL?.trim() || null,
      },
    });
  } catch (error) {
    console.error("GET /api/settings error:", error);
    return NextResponse.json({ error: "Failed to load settings" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const sb = getSupabase();
    const body = await req.json();
    const { recordId, clinicName, timezone, address, businessHours, businessHoursSchedule } = body;

    const fields: Record<string, unknown> = {};
    if (clinicName !== undefined) fields["Clinic Name"] = clinicName;
    if (timezone !== undefined) fields["Timezone"] = timezone;
    if (address !== undefined) fields["Address"] = address;
    if (businessHours !== undefined) fields["Business Hours"] = businessHours;
    if (businessHoursSchedule !== undefined) fields["BusinessHoursSchedule"] = businessHoursSchedule;

    if (recordId) {
      const { data, error } = await sb
        .from("Settings")
        .update(fields)
        .eq("id", recordId)
        .select()
        .single();
      if (error) throw new Error(error.message);
      if (timezone !== undefined) invalidateClinicTimezoneCache();
      if (businessHoursSchedule !== undefined) invalidateClinicBusinessHoursCache();
      return NextResponse.json({ success: true, recordId: data.id });
    } else {
      const { data, error } = await sb.from("Settings").insert(fields).select().single();
      if (error) throw new Error(error.message);
      if (timezone !== undefined) invalidateClinicTimezoneCache();
      if (businessHoursSchedule !== undefined) invalidateClinicBusinessHoursCache();
      return NextResponse.json({ success: true, recordId: data.id });
    }
  } catch (error) {
    console.error("PATCH /api/settings error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
