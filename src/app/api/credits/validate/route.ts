import { NextRequest, NextResponse } from "next/server";
import { getClientByCreditCode } from "@/lib/integrations/airtable";

export const dynamic = "force-dynamic";

/**
 * GET /api/credits/validate?code=BDAY-MA-IP1L
 *
 * Returns the validity status of a credit code.
 * Safe to call at checkout — does NOT mark the code as used.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code")?.trim().toUpperCase();

  if (!code) {
    return NextResponse.json(
      { valid: false, error: "Missing ?code= query parameter" },
      { status: 400 },
    );
  }

  try {
    const result = await getClientByCreditCode(code);

    if (!result) {
      return NextResponse.json({ valid: false, error: "Code not found" }, { status: 404 });
    }

    const { client, codeInfo } = result;

    if (codeInfo.isUsed) {
      return NextResponse.json({
        valid: false,
        error: "This code has already been redeemed",
        code: codeInfo.code,
        clientName: client.name,
      });
    }

    if (codeInfo.isExpired) {
      return NextResponse.json({
        valid: false,
        error: `Code expired on ${codeInfo.expiresAt}`,
        code: codeInfo.code,
        clientName: client.name,
        expiresAt: codeInfo.expiresAt,
      });
    }

    return NextResponse.json({
      valid: true,
      code: codeInfo.code,
      clientId: client.id,
      clientName: client.name,
      clientPhone: client.phone ?? null,
      clientEmail: client.email ?? null,
      creditAmount: codeInfo.creditAmount,
      expiresAt: codeInfo.expiresAt,
      daysRemaining: codeInfo.daysRemaining,
    });
  } catch (err) {
    return NextResponse.json(
      { valid: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
