import { NextRequest, NextResponse } from "next/server";
import { getClientByCreditCode, redeemCreditCode } from "@/lib/integrations/airtable";
import { logEvent } from "@/lib/integrations/activity-log";
import { requireApiPermission } from "@/lib/rbac/guard";

export const dynamic = "force-dynamic";

/**
 * POST /api/credits/redeem
 * Body: { "code": "BDAY-MA-IP1L" }
 *
 * Validates and permanently marks a credit code as redeemed.
 * Call this once at checkout AFTER confirming with the client.
 */
export async function POST(req: NextRequest) {
  const check = await requireApiPermission("credits", "Update");
  if (!check.ok) return check.response;

  let body: { code?: string };
  try {
    body = (await req.json()) as { code?: string };
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const code = body.code?.trim().toUpperCase();
  if (!code) {
    return NextResponse.json(
      { success: false, error: 'Missing "code" in request body' },
      { status: 400 },
    );
  }

  try {
    const result = await getClientByCreditCode(code);

    if (!result) {
      return NextResponse.json({ success: false, error: "Code not found" }, { status: 404 });
    }

    const { client, codeInfo } = result;

    if (codeInfo.isUsed) {
      return NextResponse.json({
        success: false,
        error: "This code has already been redeemed",
        clientName: client.name,
      });
    }

    if (codeInfo.isExpired) {
      return NextResponse.json({
        success: false,
        error: `Code expired on ${codeInfo.expiresAt}`,
        clientName: client.name,
      });
    }

    // Mark as redeemed in Supabase
    await redeemCreditCode(client.id!, codeInfo.raw);

    // Log to activity log
    await logEvent(
      "birthday",
      client.name,
      `Credit code ${codeInfo.code} redeemed at checkout. $${codeInfo.creditAmount} discount applied.`,
      { clientId: client.id, phone: client.phone, email: client.email, platform: "checkout" },
    );

    return NextResponse.json({
      success: true,
      code: codeInfo.code,
      clientId: client.id,
      clientName: client.name,
      clientPhone: client.phone ?? null,
      creditAmount: codeInfo.creditAmount,
      redeemedAt: new Date().toISOString(),
      message: `$${codeInfo.creditAmount} credit applied for ${client.name}`,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
