import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Destructure the payload sent from the RuleModal frontend
    const {
      ruleName,
      status,
      triggerType,
      triggerCondition,
      channel,
      messageTemplate,
      incentiveCode,
      aiPrompt,
    } = body;

    const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
    const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;

    const airtablePayload = {
      records: [
        {
          fields: {
            "Rule Name": ruleName,
            Status: status,
            "Trigger Type": triggerType,
            "Last Visit": String(triggerCondition),
            Channel: channel,
            "Message Template": messageTemplate,
            "Incentive Code": incentiveCode || "",
            "AI Prompt": aiPrompt || "",
          },
        },
      ],
      typecast: true,
    };

    // Make the POST request to Airtable
    const response = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Rules`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AIRTABLE_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(airtablePayload),
    });

    // Handle Airtable API errors
    if (!response.ok) {
      const errorData = await response.json();
      console.error("Airtable API Error:", errorData);
      return NextResponse.json(
        { success: false, error: "Failed to save to Airtable" },
        { status: response.status },
      );
    }

    const data = await response.json();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Server Error:", error);
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
  }
}
