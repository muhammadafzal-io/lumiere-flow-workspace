import { NextResponse } from "next/server";
import { AINotConfiguredError, generateRuleMessageWithAI } from "@/lib/rules/ai";
import type { TriggerType } from "@/lib/types";
import { requireApiPermission } from "@/lib/rbac/guard";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const check = await requireApiPermission("rules", "View");
  if (!check.ok) return check.response;

  try {
    const body = await req.json();
    const { ruleName, triggerType, triggerConfig, offerCode, instruction } = body as {
      ruleName?: string;
      triggerType?: TriggerType;
      triggerConfig?: Record<string, unknown>;
      offerCode?: string;
      instruction?: string;
    };

    if (!ruleName?.trim() || !triggerType) {
      return NextResponse.json({ error: "ruleName and triggerType are required" }, { status: 400 });
    }

    const message = await generateRuleMessageWithAI({
      ruleName: ruleName.trim(),
      triggerType,
      triggerConfig: triggerConfig ?? {},
      offerCode,
      instruction,
    });

    return NextResponse.json({ ok: true, message, source: "openai" });
  } catch (error) {
    if (error instanceof AINotConfiguredError) {
      return NextResponse.json(
        { error: "AI is not configured. Add OPENAI_API_KEY to .env.local" },
        { status: 503 },
      );
    }
    console.error("POST /api/rule/generate-message error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate message" },
      { status: 500 },
    );
  }
}
