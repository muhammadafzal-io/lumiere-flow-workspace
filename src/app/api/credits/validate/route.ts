import { NextRequest, NextResponse } from "next/server";
import { validatePromoCode } from "@/lib/credits/validate-code";
import { requireApiPermission } from "@/lib/rbac/guard";

export const dynamic = "force-dynamic";

/**
 * GET /api/credits/validate?code=BDAY-MA-IP1L
 *
 * Returns the validity status of a credit code.
 * Safe to call at checkout — does NOT mark the code as used.
 */
export async function GET(req: NextRequest) {
  const check = await requireApiPermission("credits", "View");
  if (!check.ok) return check.response;

  const code = req.nextUrl.searchParams.get("code")?.trim().toUpperCase();
  const phone = req.nextUrl.searchParams.get("phone")?.trim() ?? "";

  if (!code) {
    return NextResponse.json(
      { valid: false, error: "Missing ?code= query parameter" },
      { status: 400 },
    );
  }

  if (!phone) {
    return NextResponse.json(
      { valid: false, error: "Missing ?phone= query parameter (required for validation)" },
      { status: 400 },
    );
  }

  try {
    const result = await validatePromoCode(code, { phone });

    if (!result.valid) {
      const status = result.error === "Code not found" ? 404 : 200;
      return NextResponse.json(
        {
          valid: false,
          error: result.error,
          clientName: result.clientName,
        },
        { status },
      );
    }

    return NextResponse.json({
      valid: true,
      code: result.code,
      codeType: result.codeType,
      clientId: result.clientId ?? null,
      clientName: result.clientName ?? null,
      offerType: result.offerType,
      offerAmount: result.offerAmount,
      creditAmount: result.creditAmount ?? null,
      discountPercent: result.discountPercent ?? null,
      offerSummary: result.offerSummary,
      ruleName: result.ruleName ?? null,
      campaignName: result.campaignName ?? null,
      expiresAt: result.expiresAt ?? null,
      daysRemaining: result.daysRemaining ?? null,
      message: result.message,
    });
  } catch (err) {
    return NextResponse.json(
      { valid: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
