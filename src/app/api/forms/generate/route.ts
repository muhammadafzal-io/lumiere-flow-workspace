import { NextResponse } from "next/server";
import { AINotConfiguredError, generateFormWithAI, isAIConfigured } from "@/lib/forms/ai";
import { requireApiPermission } from "@/lib/rbac/guard";

export const dynamic = "force-dynamic";

export async function GET() {
  const check = await requireApiPermission("forms", "View");
  if (!check.ok) return check.response;

  return NextResponse.json({ configured: isAIConfigured() });
}

export async function POST(req: Request) {
  const check = await requireApiPermission("forms", "Create");
  if (!check.ok) return check.response;

  try {
    const body = await req.json();
    const { prompt } = body as { prompt?: string };

    if (!prompt?.trim()) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }

    const generated = await generateFormWithAI(prompt.trim());
    return NextResponse.json({ ok: true, ...generated });
  } catch (error) {
    if (error instanceof AINotConfiguredError) {
      return NextResponse.json(
        { error: "AI is not configured. Add OPENAI_API_KEY to .env.local" },
        { status: 503 },
      );
    }
    console.error("POST /api/forms/generate error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate form" },
      { status: 500 },
    );
  }
}
