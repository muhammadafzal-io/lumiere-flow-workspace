import { Resend } from "resend";
import nodemailer from "nodemailer";
import sgMail from "@sendgrid/mail";

// ─── types ───────────────────────────────────────────────────────────────────

export type EmailFlowType = "reminder" | "noshow" | "reactivation" | "birthday" | "general";

export interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  flowType?: EmailFlowType;
  /** Optional CTA button shown below the message body */
  cta?: { label: string; url: string };
}

// ─── client ──────────────────────────────────────────────────────────────────

function getResend(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set");
  return new Resend(key);
}

function getFromAddress(): string {
  return process.env.RESEND_FROM_EMAIL ?? "Lumière Med Spa <hello@lumiereflow.com>";
}

// ─── HTML template ───────────────────────────────────────────────────────────

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
  general: BRAND.gold,
};

const FLOW_ICON: Record<EmailFlowType, string> = {
  reminder: "📅",
  noshow: "💛",
  reactivation: "✨",
  birthday: "🎂",
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

function buildEmailHtml(opts: SendEmailOptions): string {
  const flowType = opts.flowType ?? "general";
  const accent = FLOW_ACCENT[flowType];
  const icon = FLOW_ICON[flowType];
  const body = textToHtmlParagraphs(opts.text);

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
  <title>${opts.subject}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.surface};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">

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
                ${icon}&nbsp;&nbsp;Austin, Texas
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
                2847 S Lamar Blvd, Suite 120, Austin TX 78704<br/>
                Mon–Sat · 9 AM–7 PM CT
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

// ─── Gmail SMTP transport ────────────────────────────────────────────────────

function getGmailTransport() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
}

// ─── public API ──────────────────────────────────────────────────────────────

/**
 * Send a branded retention email.
 *
 * Priority order:
 *   1. SendGrid  — SENDGRID_API_KEY + SENDGRID_FROM_EMAIL set → sends to anyone, no domain DNS needed
 *   2. Gmail     — GMAIL_USER + GMAIL_APP_PASSWORD set        → sends to anyone, no domain needed
 *   3. Resend    — RESEND_API_KEY set                         → requires verified domain for arbitrary recipients
 */
export async function sendRetentionEmail(opts: SendEmailOptions): Promise<void> {
  const html = buildEmailHtml(opts);

  // ── 1. SendGrid (single sender verification — no domain DNS needed) ──────
  const sgKey = process.env.SENDGRID_API_KEY;
  const sgFrom = process.env.SENDGRID_FROM_EMAIL;
  if (sgKey && sgFrom) {
    sgMail.setApiKey(sgKey);
    await sgMail.send({
      from: { email: sgFrom, name: process.env.SENDGRID_FROM_NAME ?? "Lumiere Med Spa" },
      to: opts.to,
      subject: opts.subject,
      html,
      text: opts.text,
    });
    console.log(`[email] SENT via SendGrid → ${opts.to} | subject: ${opts.subject}`);
    return;
  }

  // ── 2. Gmail SMTP (app password — no domain needed) ──────────────────────
  const gmail = getGmailTransport();
  if (gmail) {
    const from = `"${process.env.GMAIL_FROM_NAME ?? "Lumiere Med Spa"}" <${process.env.GMAIL_USER}>`;
    await gmail.sendMail({ from, to: opts.to, subject: opts.subject, html, text: opts.text });
    console.log(`[email] SENT via Gmail → ${opts.to} | subject: ${opts.subject}`);
    return;
  }

  // ── 3. Resend (requires verified domain for arbitrary recipients) ─────────
  if (!process.env.RESEND_API_KEY) {
    console.log(`[email] SKIP (no SENDGRID_API_KEY, GMAIL_USER, or RESEND_API_KEY) → ${opts.to}`);
    return;
  }

  const resend = getResend();
  const { error } = await resend.emails.send({
    from: getFromAddress(),
    to: opts.to,
    subject: opts.subject,
    html,
    text: opts.text,
  });

  if (error) throw new Error(`Resend error: ${error.message}`);
}
