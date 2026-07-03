export interface EscalationPayload {
  reason: string;
  clientInfo?: string;
  clientName?: string;
  phone?: string;
  email?: string;
  conversationSummary: string;
  platform?: string;
}

export async function postEscalation(payload: EscalationPayload): Promise<void> {
  const webhookUrl = process.env.SLACK_ESCALATION_WEBHOOK_URL;
  if (!webhookUrl) {
    return;
  }

  const body = {
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "🚨 Lumière Escalation Required", emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Reason:*\n${payload.reason}` },
          { type: "mrkdwn", text: `*Platform:*\n${payload.platform ?? "Unknown"}` },
        ],
      },
      ...(payload.clientName || payload.phone || payload.email || payload.clientInfo
        ? [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: payload.clientName
                  ? `*Client:*\n${payload.clientName}\n*Phone:*\n${payload.phone ?? "—"}\n*Email:*\n${payload.email ?? "—"}`
                  : `*Client:*\n${payload.clientInfo}`,
              },
            },
          ]
        : []),
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Conversation summary:*\n${payload.conversationSummary}`,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `Posted at <!date^${Math.floor(Date.now() / 1000)}^{date_short_pretty} {time}|${new Date().toISOString()}>`,
          },
        ],
      },
    ],
  };

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    console.error(`Slack webhook failed (${res.status}): ${await res.text()}`);
  }
}
