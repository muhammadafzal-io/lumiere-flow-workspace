import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

const TABLE = "Rules";

function mapRow(r: any) {
  let trigger_config: Record<string, any> = {};
  try {
    trigger_config = JSON.parse(r["Trigger Config"] ?? "{}");
  } catch (_) {
    // ignore JSON parse errors; trigger_config stays {}
  }
  return {
    id: r.id,
    name: r["Rule Name"] ?? "",
    status: (r["Status"] ?? "draft").toLowerCase() as "active" | "draft" | "paused",
    trigger_type: r["Trigger Type"] ?? "Inactivity",
    trigger_config,
    channel: r["Channel"] ?? "WhatsApp",
    message_template: r["Message Template"] ?? "",
    offer_code: r["Incentive Code"] || undefined,
    audience_filter: [],
    created_at: r.created_at ?? new Date().toISOString(),
    audience_size: 0,
    sent_30d: 0,
    reply_rate: 0,
    revenue: 0,
  };
}

export async function GET() {
  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from(TABLE)
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return NextResponse.json({ rules: (data ?? []).map(mapRow) });
  } catch (error) {
    console.error("GET /api/rule error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const sb = getSupabase();
    const body = await req.json();
    const {
      ruleName,
      status,
      triggerType,
      triggerConfig,
      channel,
      messageTemplate,
      incentiveCode,
    } = body;

    const { data, error } = await sb
      .from(TABLE)
      .insert({
        "Rule Name": ruleName,
        Status: status,
        "Trigger Type": triggerType,
        "Trigger Config": JSON.stringify(triggerConfig ?? {}),
        Channel: channel,
        "Message Template": messageTemplate,
        "Incentive Code": incentiveCode || "",
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, data: mapRow(data) });
  } catch (error) {
    console.error("POST /api/rule error:", error);
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const sb = getSupabase();
    const body = await req.json();
    const {
      recordId,
      ruleName,
      status,
      triggerType,
      triggerConfig,
      channel,
      messageTemplate,
      incentiveCode,
    } = body;
    if (!recordId) return NextResponse.json({ error: "recordId is required" }, { status: 400 });

    const { data, error } = await sb
      .from(TABLE)
      .update({
        "Rule Name": ruleName,
        Status: status,
        "Trigger Type": triggerType,
        "Trigger Config": JSON.stringify(triggerConfig ?? {}),
        Channel: channel,
        "Message Template": messageTemplate,
        "Incentive Code": incentiveCode || "",
      })
      .eq("id", recordId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, data: mapRow(data) });
  } catch (error) {
    console.error("PATCH /api/rule error:", error);
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const sb = getSupabase();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const { error } = await sb.from(TABLE).delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/rule error:", error);
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
  }
}
