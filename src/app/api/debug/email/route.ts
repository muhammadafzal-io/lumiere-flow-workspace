import { NextRequest, NextResponse } from "next/server";
import { sendRetentionEmail } from "@/lib/integrations/email";

export const dynamic = "force-dynamic";

/**
 * GET /api/debug/email?to=you@example.com&flow=birthday
 *
 * Sends a test email so you can verify Resend is wired up correctly.
 * Supported flow values: birthday | reminder | noshow | reactivation | general
 */
export async function GET(req: NextRequest) {
  const to = req.nextUrl.searchParams.get("to");
  const flow = (req.nextUrl.searchParams.get("flow") ?? "birthday") as
    | "birthday"
    | "reminder"
    | "noshow"
    | "reactivation"
    | "general"
    | "booking"
    | "cancellation"
    | "reschedule";

  if (!to) {
    return NextResponse.json(
      {
        ok: false,
        error: "Missing ?to= query param. Example: /api/debug/email?to=you@example.com",
      },
      { status: 400 },
    );
  }

  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "RESEND_API_KEY is not set in environment variables" },
      { status: 500 },
    );
  }

  const sampleText: Record<typeof flow, string> = {
    birthday: `Happy early birthday!\n\nThe entire Lumière team wishes you a wonderful birthday. To celebrate, we're sending you a special gift:\n\n$50 birthday credit\nCode: BDAY-TEST-DEBUG\nValid for 30 days — use it on any service!\n\nBook your birthday treat: just reply here or visit us Monday–Saturday, 9 AM–7 PM.\n\nCan't wait to see you!\n- The Lumière Team`,
    reminder: `Hi there, just a friendly reminder that you have an upcoming appointment at Lumière.\n\nTreatment: HydraFacial\nTime: Friday, Jun 20, 10:00 AM\nLocation: 2847 S Lamar Blvd, Suite 120, Austin TX\n\nPlease confirm your attendance.`,
    noshow: `Hi there, we missed you at Lumière today for your Botox appointment.\n\nWe completely understand that life gets busy. We'd love to reschedule at a time that works better for you.\n\nSimply reply to this message and we'll find you a spot.`,
    reactivation: `Hi there! We've been thinking about you at Lumière.\n\nIt's been a while since your last visit, and we'd love to have you back. Use code WELCOMEBACK20 for 20% off your next service — valid for 30 days.\n\nWe're here Monday–Saturday, 9 AM–7 PM.`,
    general: `This is a test email from Lumière Med Spa & Wellness.\n\nIf you received this, your Resend email integration is working correctly.`,
    booking: `Hi Test User, your appointment at Lumière is confirmed!\n\nTreatment: HydraFacial\nDate & Time: Friday, June 20, 2026 at 2:00 PM CT\nPractitioner: Dr. Smith\nLocation: 2847 S Lamar Blvd, Suite 120, Austin TX 78704\n\nWe look forward to seeing you!`,
    cancellation: `Hi Test User, your appointment at Lumière has been cancelled.\n\nTreatment: HydraFacial\nOriginal Date & Time: Friday, June 20, 2026 at 2:00 PM CT\n\nWe hope to see you again soon. Reply to this email or visit us to rebook.`,
    reschedule: `Hi Test User, your appointment at Lumière has been rescheduled.\n\nTreatment: HydraFacial\nNew Date & Time: Saturday, June 21, 2026 at 3:00 PM CT\nLocation: 2847 S Lamar Blvd, Suite 120, Austin TX 78704\n\nSee you then!`,
  };

  try {
    await sendRetentionEmail({
      to,
      subject: `[DEBUG] Lumière email test — ${flow} flow`,
      text: sampleText[flow],
      flowType: flow,
    });

    return NextResponse.json({
      ok: true,
      sentTo: to,
      flow,
      from: fromEmail ?? "onboarding@resend.dev",
      apiKeyPrefix: `${apiKey.slice(0, 8)}***`,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        sentTo: to,
        from: fromEmail,
        apiKeySet: !!apiKey,
      },
      { status: 500 },
    );
  }
}
