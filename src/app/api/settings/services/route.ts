import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { requireApiPermission } from "@/lib/rbac/guard";

export const dynamic = "force-dynamic";

const SERVICES = "Services";
const REQS = "ServiceRequirements";

function mapService(r: any) {
  return {
    id: r.id,
    name: r["Name"] ?? "",
    durationMinutes: r["DurationMinutes"] ?? 60,
    onlineBookable: r["OnlineBookable"] ?? true,
    requiresConsultation: r["RequiresConsultation"] ?? false,
    minNoticeHours: r["MinNoticeHours"] ?? 0,
    maxAdvanceDays: r["MaxAdvanceDays"] ?? 365,
    status: r["Status"] ?? "Active",
    created_at: r.created_at,
  };
}

export async function GET() {
  const check = await requireApiPermission("settings", "View");
  if (!check.ok) return check.response;

  try {
    const sb = getSupabase();
    const { data, error } = await sb.from(SERVICES).select("*").order("Name");
    if (error) throw new Error(error.message);

    const services = data ?? [];

    // Fetch all requirements for the services we found
    const ids = services.map((s: any) => s.id);
    const { data: reqs } = await sb
      .from(REQS)
      .select("*")
      .in("service_id", ids.length ? ids : ["invalid"]);

    const grouped: Record<string, any[]> = {};
    (reqs ?? []).forEach((r: any) => {
      (grouped[r.service_id] ??= []).push({ id: r.id, kind: r.kind, rule: r.rule });
    });

    const payload = services.map((s: any) => ({
      ...mapService(s),
      requirements: grouped[s.id] ?? [],
    }));
    return NextResponse.json({ services: payload });
  } catch (err) {
    console.error("GET /api/settings/services error:", err);
    return NextResponse.json({ error: "Failed to load services" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const check = await requireApiPermission("settings", "Create");
  if (!check.ok) return check.response;

  try {
    const sb = getSupabase();
    const body = await req.json();
    const {
      Name,
      DurationMinutes,
      OnlineBookable,
      RequiresConsultation,
      MinNoticeHours,
      MaxAdvanceDays,
      Status,
      requirements,
    } = body;

    if (!Name || typeof Name !== "string") {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const { data: svc, error } = await sb
      .from(SERVICES)
      .insert({
        Name,
        DurationMinutes: DurationMinutes ?? 60,
        OnlineBookable: OnlineBookable ?? true,
        RequiresConsultation: RequiresConsultation ?? false,
        MinNoticeHours: MinNoticeHours ?? 0,
        MaxAdvanceDays: MaxAdvanceDays ?? 365,
        Status: Status ?? "Active",
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    // Insert requirements if provided
    if (Array.isArray(requirements) && requirements.length > 0) {
      const rows = requirements.map((r: any) => ({
        service_id: svc.id,
        kind: r.kind,
        rule: r.rule,
      }));
      const { error: rerr } = await sb.from(REQS).insert(rows);
      if (rerr) throw new Error(rerr.message);
    }

    return NextResponse.json({ service: mapService(svc) });
  } catch (err) {
    console.error("POST /api/settings/services error:", err);
    return NextResponse.json({ error: "Failed to create service" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const check = await requireApiPermission("settings", "Update");
  if (!check.ok) return check.response;

  try {
    const sb = getSupabase();
    const body = await req.json();
    const { id } = body;
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const fields: Record<string, any> = {};
    if (body.Name !== undefined) fields["Name"] = body.Name;
    if (body.DurationMinutes !== undefined) fields["DurationMinutes"] = body.DurationMinutes;
    if (body.OnlineBookable !== undefined) fields["OnlineBookable"] = body.OnlineBookable;
    if (body.RequiresConsultation !== undefined)
      fields["RequiresConsultation"] = body.RequiresConsultation;
    if (body.MinNoticeHours !== undefined) fields["MinNoticeHours"] = body.MinNoticeHours;
    if (body.MaxAdvanceDays !== undefined) fields["MaxAdvanceDays"] = body.MaxAdvanceDays;
    if (body.Status !== undefined) fields["Status"] = body.Status;

    const { data: svc, error } = await sb
      .from(SERVICES)
      .update(fields)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);

    // Replace requirements if provided
    if (Array.isArray(body.requirements)) {
      // delete existing
      const { error: dErr } = await sb.from(REQS).delete().eq("service_id", id);
      if (dErr) throw new Error(dErr.message);
      if (body.requirements.length > 0) {
        const rows = body.requirements.map((r: any) => ({
          service_id: id,
          kind: r.kind,
          rule: r.rule,
        }));
        const { error: iErr } = await sb.from(REQS).insert(rows);
        if (iErr) throw new Error(iErr.message);
      }
    }

    return NextResponse.json({ service: mapService(svc) });
  } catch (err) {
    console.error("PATCH /api/settings/services error:", err);
    return NextResponse.json({ error: "Failed to update service" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const check = await requireApiPermission("settings", "Delete");
  if (!check.ok) return check.response;

  try {
    const sb = getSupabase();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const { error } = await sb.from(SERVICES).delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/settings/services error:", err);
    return NextResponse.json({ error: "Failed to delete service" }, { status: 500 });
  }
}
