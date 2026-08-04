import { NextRequest, NextResponse } from "next/server";
import { getClientByCreditCode, redeemCreditCode } from "@/lib/integrations/airtable";
import {
  redeemRuleCode,
  redeemCampaignCode,
  type PromoCodeType,
} from "@/lib/credits/validate-code";
import { logEvent } from "@/lib/integrations/activity-log";
import { requireApiPermission } from "@/lib/rbac/guard";

export const dynamic = "force-dynamic";

/**
 * POST /api/credits/redeem
 * Body: { "code": "BDAY-MA-IP1L", "codeType": "birthday" | "rule" | "campaign", "ruleId"?, "clientId"? }
 *
 * Validates and permanently marks a credit code as redeemed. `codeType` (and `ruleId`/`clientId`
 * for rule codes) come straight from the /api/credits/validate response — call this once at
 * checkout AFTER confirming with the client, never speculatively.
 *
 * Rule and campaign codes are a single code shared across every matching client, so — unlike a
 * birthday code, where the code itself already identifies the client — redeeming one requires
 * knowing *which* client is redeeming it (clientId), or two different real clients would be
 * blocked from ever using their own copy of the same shared code.
 */
export async function POST(req: NextRequest) {
  const check = await requireApiPermission("credits", "Update");
  if (!check.ok) return check.response;

  let body: { code?: string; codeType?: PromoCodeType; ruleId?: string; clientId?: string };
  try {
    body = await req.json();
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

  const codeType: PromoCodeType = body.codeType ?? "birthday";

  try {
    if (codeType === "rule") {
      if (!body.ruleId || !body.clientId) {
        return NextResponse.json(
          { success: false, error: "ruleId and clientId are required to redeem a rule code" },
          { status: 400 },
        );
      }
      const ok = await redeemRuleCode(body.ruleId, body.clientId);
      if (!ok) {
        return NextResponse.json({ success: false, error: "This code has already been redeemed" });
      }
      await logEvent("campaign", body.clientId, `Rule offer code ${code} redeemed at checkout.`, {
        clientId: body.clientId,
        platform: "checkout",
      });
      return NextResponse.json({
        success: true,
        code,
        clientId: body.clientId,
        redeemedAt: new Date().toISOString(),
        message: `Code ${code} redeemed`,
      });
    }

    if (codeType === "campaign") {
      const ok = await redeemCampaignCode(code);
      if (!ok) {
        return NextResponse.json({ success: false, error: "This code has already been redeemed" });
      }
      return NextResponse.json({
        success: true,
        code,
        redeemedAt: new Date().toISOString(),
        message: `Code ${code} redeemed`,
      });
    }

    // Birthday codes: unique per client, stored on the client's own "Credit Codes" field.
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
