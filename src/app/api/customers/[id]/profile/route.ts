import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { mapCustomerRow } from "@/lib/customers/map-row";
import { getAppointmentHistoryForContact } from "@/lib/integrations/google-calendar";
import { readEmailSendLog } from "@/lib/integrations/email-send-log";
import { readFollowupSendsForClient } from "@/lib/retention/followup-sends";
import { readActivityLogForClient } from "@/lib/integrations/activity-log";
import {
  computeCustomerStatistics,
  groupPractitioners,
  groupTreatments,
  mergeTimeline,
} from "@/lib/customers/profile";
import { getClinicTimezone } from "@/lib/clinic-config";
import { requireApiPermission } from "@/lib/rbac/guard";

export const dynamic = "force-dynamic";

const TABLE = "Clients";

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const check = await requireApiPermission("customers", "View");
  if (!check.ok) return check.response;

  try {
    const { id } = await ctx.params;
    const { searchParams } = req.nextUrl;
    const pastDays = Number(searchParams.get("historyDays") ?? "730");
    const futureDays = Number(searchParams.get("futureDays") ?? "180");

    const sb = getSupabase();
    const { data: row, error } = await sb.from(TABLE).select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

    const customer = mapCustomerRow(row);
    const tz = await getClinicTimezone();

    const [history, communicationsResult, followups, activityRows] = await Promise.all([
      getAppointmentHistoryForContact(
        { id: customer.id, phone: customer.phone, name: customer.name },
        { pastDays, futureDays },
      ),
      readEmailSendLog({ clientId: id, limit: 200 }),
      readFollowupSendsForClient(id, 100),
      readActivityLogForClient(id, { phone: customer.phone, limit: 200 }),
    ]);

    const statistics = computeCustomerStatistics(customer, history, activityRows);
    const treatments = groupTreatments(history, customer.treatments);
    const practitioners = groupPractitioners(history);
    const timeline = mergeTimeline(
      activityRows,
      history,
      communicationsResult.entries,
      followups,
      tz,
    );

    return NextResponse.json({
      customer,
      statistics,
      appointments: {
        upcoming: history.upcoming,
        past: history.past,
        lookbackDays: pastDays,
        truncated: history.truncated,
      },
      treatments,
      practitioners,
      communications: {
        emails: communicationsResult.entries,
        followups,
        total: communicationsResult.entries.length + followups.length,
      },
      timeline,
      meta: {
        matchedBy: history.matchedBy,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("GET /api/customers/[id]/profile error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
