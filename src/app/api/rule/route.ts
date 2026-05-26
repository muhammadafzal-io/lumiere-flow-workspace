import { NextResponse } from "next/server";

const TABLE = "Rules";

function airtableHeaders() {
  const token = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!token || !baseId) throw new Error("Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID");
  return { token, baseId };
}

// GET /api/rule — fetch all rules from Airtable
export async function GET() {
  try {
    const { token, baseId } = airtableHeaders();

    const res = await fetch(
      `https://api.airtable.com/v0/${baseId}/${TABLE}?view=Grid%20view`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      },
    );

    if (!res.ok) {
      const err = await res.json();
      console.error("Airtable GET Rules error:", err);
      return NextResponse.json({ error: "Failed to fetch rules" }, { status: res.status });
    }

    const data = await res.json();
    const rules = (data.records ?? []).map((record: any) => {
      const f = record.fields;
      let trigger_config: Record<string, any> = {};
      try {
        trigger_config = JSON.parse(f["Trigger Config"] ?? "{}");
      } catch {
        // legacy numeric value stored in old "Last Visit" field
        const legacy = Number(f["Last Visit"] ?? 0);
        trigger_config = legacy ? { days: legacy } : {};
      }

      return {
        id: record.id,
        name: f["Rule Name"] ?? "",
        status: (f["Status"] ?? "draft").toLowerCase() as "active" | "draft" | "paused",
        trigger_type: f["Trigger Type"] ?? "Inactivity",
        trigger_config,
        channel: f["Channel"] ?? "WhatsApp",
        message_template: f["Message Template"] ?? "",
        offer_code: f["Incentive Code"] || undefined,
        audience_filter: [],
        created_at: record.createdTime,
        audience_size: 0,
        sent_30d: 0,
        reply_rate: 0,
        revenue: 0,
      };
    });

    return NextResponse.json({ rules });
  } catch (error) {
    console.error("GET /api/rule error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// POST /api/rule — create a new rule in Airtable
export async function POST(req: Request) {
  try {
    const { token, baseId } = airtableHeaders();
    const body = await req.json();
    const { ruleName, status, triggerType, triggerConfig, channel, messageTemplate, incentiveCode, aiPrompt } = body;

    const res = await fetch(`https://api.airtable.com/v0/${baseId}/${TABLE}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        records: [
          {
            fields: {
              "Rule Name": ruleName,
              Status: status,
              "Trigger Type": triggerType,
              "Trigger Config": JSON.stringify(triggerConfig ?? {}),
              Channel: channel,
              "Message Template": messageTemplate,
              "Incentive Code": incentiveCode || "",
              "AI Prompt": aiPrompt || "",
            },
          },
        ],
        typecast: true,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      console.error("Airtable POST Rules error:", err);
      return NextResponse.json({ success: false, error: "Failed to save to Airtable" }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("POST /api/rule error:", error);
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
  }
}

// PATCH /api/rule — update an existing rule by Airtable record ID
export async function PATCH(req: Request) {
  try {
    const { token, baseId } = airtableHeaders();
    const body = await req.json();
    const { recordId, ruleName, status, triggerType, triggerConfig, channel, messageTemplate, incentiveCode, aiPrompt } = body;

    if (!recordId) {
      return NextResponse.json({ error: "recordId is required" }, { status: 400 });
    }

    const res = await fetch(`https://api.airtable.com/v0/${baseId}/${TABLE}/${recordId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fields: {
          "Rule Name": ruleName,
          Status: status,
          "Trigger Type": triggerType,
          "Trigger Config": JSON.stringify(triggerConfig ?? {}),
          Channel: channel,
          "Message Template": messageTemplate,
          "Incentive Code": incentiveCode || "",
          "AI Prompt": aiPrompt || "",
        },
        typecast: true,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      console.error("Airtable PATCH Rules error:", err);
      return NextResponse.json({ success: false, error: "Failed to update rule" }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("PATCH /api/rule error:", error);
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
  }
}

// DELETE /api/rule — delete a rule by Airtable record ID
export async function DELETE(req: Request) {
  try {
    const { token, baseId } = airtableHeaders();
    const { searchParams } = new URL(req.url);
    const recordId = searchParams.get("id");

    if (!recordId) {
      return NextResponse.json({ error: "id query param is required" }, { status: 400 });
    }

    const res = await fetch(`https://api.airtable.com/v0/${baseId}/${TABLE}/${recordId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const err = await res.json();
      console.error("Airtable DELETE Rules error:", err);
      return NextResponse.json({ success: false, error: "Failed to delete rule" }, { status: res.status });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/rule error:", error);
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
  }
}
