/**
 * Minimal Twilio SMS sender — plain REST call (no SDK dependency), matching the direct-fetch
 * style already used for WhatsApp (`src/lib/messaging/whatsapp.ts`). Used only to deliver the
 * booking-completion link to callers reached solely by phone number (no email/chat thread).
 */
export interface SendSmsOutcome {
  sent: boolean;
  error?: string;
}

export async function sendSms(opts: { to: string; body: string }): Promise<SendSmsOutcome> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    const reason =
      "not configured (missing TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_FROM_NUMBER)";
    console.warn(`[sms] SKIP — ${reason}`);
    return { sent: false, error: reason };
  }

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: opts.to, From: fromNumber, Body: opts.body }).toString(),
      },
    );

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(`Twilio ${res.status}: ${errBody.slice(0, 200)}`);
    }

    return { sent: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[sms] FAILED via Twilio → ${opts.to}`, error);
    return { sent: false, error };
  }
}
