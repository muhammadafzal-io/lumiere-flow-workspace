import { NextRequest, NextResponse } from "next/server";
import { runBirthdayFlow } from "@/lib/retention/birthday";
import { runFollowupFlow } from "@/lib/retention/followup";
import { runReminderFlow } from "@/lib/retention/reminders";
import { runNoshowFlow } from "@/lib/retention/noshow";
import { runReactivationFlow } from "@/lib/retention/reactivation";
import type { RunFlowOptions } from "@/types";
import { requireApiPermission } from "@/lib/rbac/guard";

const FLOW_MAP = {
  birthday: runBirthdayFlow,
  reminders: runReminderFlow,
  noshow: runNoshowFlow,
  reactivation: runReactivationFlow,
  followup: runFollowupFlow,
} as const;

type FlowKey = keyof typeof FLOW_MAP;

async function runOne(flow: FlowKey, opts?: RunFlowOptions) {
  return FLOW_MAP[flow]({ trigger: "manual", ...opts });
}

export async function GET(req: NextRequest) {
  const check = await requireApiPermission("flows", "Update");
  if (!check.ok) return check.response;

  const flow = req.nextUrl.searchParams.get("flow") as FlowKey | "all" | null;

  if (!flow) {
    return NextResponse.json({ ok: false, error: "Missing ?flow= param" }, { status: 400 });
  }

  try {
    if (flow === "all") {
      const entries = await Promise.allSettled(
        (Object.entries(FLOW_MAP) as [FlowKey, (o?: RunFlowOptions) => Promise<unknown>][]).map(
          ([, fn]) => fn(),
        ),
      );
      const results = Object.fromEntries(
        (Object.keys(FLOW_MAP) as FlowKey[]).map((key, i) => {
          const entry = entries[i];
          return [
            key,
            entry.status === "fulfilled" ? entry.value : { error: String(entry.reason) },
          ];
        }),
      );
      return NextResponse.json({ ok: true, results });
    }

    if (!(flow in FLOW_MAP)) {
      return NextResponse.json({ ok: false, error: `Unknown flow: ${flow}` }, { status: 400 });
    }

    const result = await runOne(flow);
    return NextResponse.json({ ok: true, ...(result as object) });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const check = await requireApiPermission("flows", "Update");
  if (!check.ok) return check.response;

  const flow = req.nextUrl.searchParams.get("flow") as FlowKey | null;
  if (!flow || !(flow in FLOW_MAP)) {
    return NextResponse.json(
      { ok: false, error: "Missing or invalid ?flow= param" },
      { status: 400 },
    );
  }

  try {
    const body = (await req.json().catch(() => ({}))) as RunFlowOptions;
    const result = await runOne(flow, body);
    return NextResponse.json({ ok: true, ...(result as object) });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
