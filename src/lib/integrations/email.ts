import { Resend } from "resend";
import nodemailer from "nodemailer";
import sgMail from "@sendgrid/mail";
import {
  logEmailSend,
  type EmailSendCategory,
  type EmailSendTrigger,
} from "@/lib/integrations/email-send-log";
import { getClinicConfig } from "@/lib/clinic-config";

export type EmailFlowType =
  | "reminder"
  | "noshow"
  | "reactivation"
  | "birthday"
  | "booking"
  | "cancellation"
  | "reschedule"
  | "campaign"
  | "general"
  | "followup";

export interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  flowType?: EmailFlowType;
  cta?: { label: string; url: string };
  logMeta?: EmailSendLogMeta;
}

export interface EmailSendLogMeta {
  category: EmailSendCategory;
  triggerType: EmailSendTrigger;
  sourceId?: string;
  sourceName?: string;
  clientId?: string;
  clientName?: string;
}

export interface SendEmailOutcome {
  sent: boolean;
  provider?: string;
  error?: string;
}

function getResend(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set");
  return new Resend(key);
}

function getFromAddress(): string {
  return process.env.RESEND_FROM_EMAIL ?? "Lumière Med Spa <hello@lumiereflow.com>";
}

const BRAND = {
  gold: "#C9A96E",
  dark: "#1a1a2e",
  surface: "#f9f6f1",
  text: "#3d3d3d",
  subtle: "#7a7a7a",
  white: "#ffffff",
};

const FLOW_ACCENT: Record<EmailFlowType, string> = {
  reminder: "#4A90A4",
  noshow: "#E8956D",
  reactivation: "#7B68B5",
  birthday: "#D4A0B0",
  booking: "#4CAF82",
  cancellation: "#C0392B",
  reschedule: "#E67E22",
  campaign: "#C9A96E",
  followup: "#2A9D8F",
  general: BRAND.gold,
};

const FLOW_ICON: Record<EmailFlowType, string> = {
  reminder: "📅",
  noshow: "💛",
  reactivation: "✨",
  birthday: "🎂",
  booking: "✅",
  cancellation: "❌",
  reschedule: "🔄",
  campaign: "🎁",
  followup: "💬",
  general: "💌",
};

function textToHtmlParagraphs(text: string): string {
  return text
    .split("\n\n")
    .map((block) => {
      const lines = block
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .join("<br/>");
      return lines ? `<p style="margin:0 0 16px 0;line-height:1.7;">${lines}</p>` : "";
    })
    .filter(Boolean)
    .join("");
}

/** Gmail/inbox preview text — keeps snippet off the branded header block. */
function buildPreheader(text: string): string {
  const line =
    text
      .split("\n")
      .map((l) => l.trim())
      .find(Boolean) ?? text.trim();
  return line.replace(/\s+/g, " ").slice(0, 120);
}

/** Strip newlines and control chars so Subject headers stay valid. */
export function sanitizeEmailSubject(subject: string): string {
  return subject
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function buildEmailHtml(opts: SendEmailOptions): Promise<string> {
  const clinic = await getClinicConfig();
  const flowType = opts.flowType ?? "general";
  const accent = FLOW_ACCENT[flowType];
  const icon = FLOW_ICON[flowType];
  const body = textToHtmlParagraphs(opts.text);
  const preheader = escapeHtml(buildPreheader(opts.text));
  const subject = escapeHtml(sanitizeEmailSubject(opts.subject));

  const ctaBlock = opts.cta
    ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0 0 0;">
      <tr>
        <td align="center">
          <a href="${opts.cta.url}"
             style="display:inline-block;padding:14px 36px;background:${accent};
                    color:${BRAND.white};font-size:15px;font-weight:600;
                    text-decoration:none;border-radius:6px;letter-spacing:0.3px;">
            ${opts.cta.label}
          </a>
        </td>
      </tr>
    </table>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.surface};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;opacity:0;color:transparent;font-size:1px;line-height:1px;">
    ${preheader}
  </div>

  <!-- wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.surface};padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:580px;" cellpadding="0" cellspacing="0">

          <!-- header bar -->
          <tr>
            <td style="background:${BRAND.dark};border-radius:10px 10px 0 0;padding:28px 40px;text-align:center;">
              <p style="margin:0;font-size:11px;letter-spacing:3px;color:${BRAND.gold};text-transform:uppercase;font-weight:600;">
                Lumière Med Spa &amp; Wellness
              </p>
              <p style="margin:6px 0 0 0;font-size:22px;color:${BRAND.white};font-weight:300;letter-spacing:1px;">
                ${icon}&nbsp;&nbsp;${escapeHtml(clinic.location)}
              </p>
            </td>
          </tr>

          <!-- accent stripe -->
          <tr>
            <td style="background:${accent};height:4px;"></td>
          </tr>

          <!-- body -->
          <tr>
            <td style="background:${BRAND.white};padding:40px 40px 32px 40px;border-radius:0;color:${BRAND.text};font-size:15px;">
              ${body}
              ${ctaBlock}
            </td>
          </tr>

          <!-- footer -->
          <tr>
            <td style="background:${BRAND.dark};border-radius:0 0 10px 10px;padding:24px 40px;text-align:center;">
              <p style="margin:0;font-size:12px;color:${BRAND.gold};letter-spacing:2px;text-transform:uppercase;font-weight:600;">
                Lumière Med Spa &amp; Wellness
              </p>
              <p style="margin:8px 0 0 0;font-size:12px;color:#8a8aaa;line-height:1.6;">
                ${escapeHtml(clinic.address)}<br/>
                ${escapeHtml(clinic.businessHours)}
              </p>
              <p style="margin:12px 0 0 0;font-size:11px;color:#5a5a7a;">
                You're receiving this because you're a valued Lumière client.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`;
}

function getGmailTransport() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
}

export async function sendRetentionEmail(opts: SendEmailOptions): Promise<SendEmailOutcome> {
  const subject = sanitizeEmailSubject(opts.subject);
  const preview = opts.text.slice(0, 120);

  async function persist(
    status: "sent" | "failed" | "skipped",
    extra: { provider?: string; failReason?: string; simulated?: boolean } = {},
  ) {
    if (!opts.logMeta) return;
    await logEmailSend({
      ...opts.logMeta,
      toEmail: opts.to,
      subject,
      messagePreview: preview,
      status,
      provider: extra.provider,
      failReason: extra.failReason,
      simulated: extra.simulated ?? false,
    });
  }

  const html = await buildEmailHtml({ ...opts, subject });

  const sgKey = process.env.SENDGRID_API_KEY;
  const sgFrom = process.env.SENDGRID_FROM_EMAIL;
  if (sgKey && sgFrom) {
    try {
      sgMail.setApiKey(sgKey);
      await sgMail.send({
        from: { email: sgFrom, name: process.env.SENDGRID_FROM_NAME ?? "Lumiere Med Spa" },
        to: opts.to,
        subject,
        html,
        text: opts.text,
      });
      await persist("sent", { provider: "sendgrid" });
      return { sent: true, provider: "sendgrid" };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error(`[email] FAILED via SendGrid → ${opts.to}`, error);
      await persist("failed", { provider: "sendgrid", failReason: error });
      throw err;
    }
  }

  const gmail = getGmailTransport();
  if (gmail) {
    const from = `"${process.env.GMAIL_FROM_NAME ?? "Lumiere Med Spa"}" <${process.env.GMAIL_USER}>`;
    try {
      await gmail.sendMail({ from, to: opts.to, subject, text: opts.text, html });
      await persist("sent", { provider: "gmail" });
      return { sent: true, provider: "gmail" };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error(`[email] FAILED via Gmail → ${opts.to}`, error);
      await persist("failed", { provider: "gmail", failReason: error });
      throw err;
    }
  }

  if (!process.env.RESEND_API_KEY) {
    const reason =
      "no email provider configured (no SENDGRID_API_KEY, GMAIL_USER, or RESEND_API_KEY)";
    console.warn(`[email] SKIP — ${reason}`);
    await persist("skipped", { failReason: reason });
    return { sent: false, error: reason };
  }

  const from = getFromAddress();
  const resend = getResend();
  try {
    const { error } = await resend.emails.send({
      from,
      to: opts.to,
      subject,
      html,
      text: opts.text,
    });
    if (error) throw new Error(`Resend error: ${error.message}`);
    await persist("sent", { provider: "resend" });
    return { sent: true, provider: "resend" };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[email] FAILED via Resend → ${opts.to}`, error);
    await persist("failed", { provider: "resend", failReason: error });
    throw err;
  }
}
