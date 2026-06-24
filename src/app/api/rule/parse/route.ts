import { NextResponse } from "next/server";
import { AINotConfiguredError, isAIConfigured, parseRuleWithAI } from "@/lib/rules/ai";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ configured: isAIConfigured() });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { description } = body as { description?: string };

    if (!description?.trim()) {
      return NextResponse.json({ error: "description is required" }, { status: 400 });
    }

    const rule = await parseRuleWithAI(description.trim());
    return NextResponse.json({ ok: true, rule, source: "openai" });
  } catch (error) {
    if (error instanceof AINotConfiguredError) {
      return NextResponse.json(
        { error: "AI is not configured. Add OPENAI_API_KEY to .env.local" },
        { status: 503 },
      );
    }
    console.error("POST /api/rule/parse error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to parse rule" },
      { status: 500 },
    );
  }
}
