import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { requireApiPermission } from "@/lib/rbac/guard";
import { getEventsByRange } from "@/lib/integrations/google-calendar";
import { todayInZone, addCalendarDays } from "@/lib/booking/dates";
import { getClinicTimezone } from "@/lib/clinic-config";
import { isValidHttpUrl, normalizeFormLinks } from "@/lib/settings/service-form-links";

export const dynamic = "force-dynamic";

const SERVICES = "Services";
const REQS = "ServiceRequirements";
const FORM_LINKS = "ServiceFormLinks";
const FORM_ASSIGNMENTS = "ServiceFormAssignments";

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

    const { data: links } = await sb
      .from(FORM_LINKS)
      .select("*")
      .in("service_id", ids.length ? ids : ["invalid"])
      .order("sort_order", { ascending: true });

    const linksGrouped: Record<string, any[]> = {};
    (links ?? []).forEach((l: any) => {
      (linksGrouped[l.service_id] ??= []).push({ id: l.id, label: l.label, url: l.url });
    });

    const { data: assignments } = await sb
      .from(FORM_ASSIGNMENTS)
      .select("*")
      .in("service_id", ids.length ? ids : ["invalid"]);

    const assignmentsGrouped: Record<string, string[]> = {};
    (assignments ?? []).forEach((a: any) => {
      (assignmentsGrouped[a.service_id] ??= []).push(a.form_id);
    });

    const payload = services.map((s: any) => ({
      ...mapService(s),
      requirements: grouped[s.id] ?? [],
      formLinks: linksGrouped[s.id] ?? [],
      attachedFormIds: assignmentsGrouped[s.id] ?? [],
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
      formLinks,
      attachedFormIds,
    } = body;

    if (!Name || typeof Name !== "string") {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (
      DurationMinutes !== undefined &&
      (typeof DurationMinutes !== "number" || DurationMinutes <= 0)
    ) {
      return NextResponse.json(
        { error: "Duration must be a positive number of minutes" },
        { status: 400 },
      );
    }
    if (Array.isArray(formLinks)) {
      const badUrl = formLinks.find(
        (l: any) => l?.url && String(l.url).trim() && !isValidHttpUrl(String(l.url).trim()),
      );
      if (badUrl) {
        return NextResponse.json(
          { error: `"${badUrl.url}" is not a valid http(s) URL` },
          { status: 400 },
        );
      }
    }
    const { data: existing } = await sb.from(SERVICES).select("id").ilike("Name", Name.trim());
    if (existing && existing.length > 0) {
      return NextResponse.json(
        { error: `A service named "${Name}" already exists` },
        { status: 409 },
      );
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

    // Insert form links if provided
    if (Array.isArray(formLinks) && formLinks.length > 0) {
      const rows = normalizeFormLinks(formLinks).map((l) => ({
        service_id: svc.id,
        label: l.label,
        url: l.url,
        sort_order: l.sort_order,
      }));
      if (rows.length > 0) {
        const { error: lerr } = await sb.from(FORM_LINKS).insert(rows);
        if (lerr) throw new Error(lerr.message);
      }
    }

    // Insert attached form assignments if provided
    if (Array.isArray(attachedFormIds) && attachedFormIds.length > 0) {
      const rows = attachedFormIds.map((formId: string) => ({
        service_id: svc.id,
        form_id: formId,
      }));
      const { error: aerr } = await sb.from(FORM_ASSIGNMENTS).insert(rows);
      if (aerr) throw new Error(aerr.message);
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

    if (
      body.DurationMinutes !== undefined &&
      (typeof body.DurationMinutes !== "number" || body.DurationMinutes <= 0)
    ) {
      return NextResponse.json(
        { error: "Duration must be a positive number of minutes" },
        { status: 400 },
      );
    }
    if (Array.isArray(body.formLinks)) {
      const badUrl = body.formLinks.find(
        (l: any) => l?.url && String(l.url).trim() && !isValidHttpUrl(String(l.url).trim()),
      );
      if (badUrl) {
        return NextResponse.json(
          { error: `"${badUrl.url}" is not a valid http(s) URL` },
          { status: 400 },
        );
      }
    }

    if (typeof body.Name === "string" && body.Name.trim()) {
      const { data: existing } = await sb
        .from(SERVICES)
        .select("id")
        .ilike("Name", body.Name.trim())
        .neq("id", id);
      if (existing && existing.length > 0) {
        return NextResponse.json(
          { error: `A service named "${body.Name}" already exists` },
          { status: 409 },
        );
      }
    }

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

    // Replace form links if provided
    if (Array.isArray(body.formLinks)) {
      const { error: dlErr } = await sb.from(FORM_LINKS).delete().eq("service_id", id);
      if (dlErr) throw new Error(dlErr.message);
      const rows = normalizeFormLinks(body.formLinks).map((l) => ({
        service_id: id,
        label: l.label,
        url: l.url,
        sort_order: l.sort_order,
      }));
      if (rows.length > 0) {
        const { error: ilErr } = await sb.from(FORM_LINKS).insert(rows);
        if (ilErr) throw new Error(ilErr.message);
      }
    }

    // Replace attached form assignments if provided
    if (Array.isArray(body.attachedFormIds)) {
      const { error: daErr } = await sb.from(FORM_ASSIGNMENTS).delete().eq("service_id", id);
      if (daErr) throw new Error(daErr.message);
      if (body.attachedFormIds.length > 0) {
        const rows = body.attachedFormIds.map((formId: string) => ({
          service_id: id,
          form_id: formId,
        }));
        const { error: iaErr } = await sb.from(FORM_ASSIGNMENTS).insert(rows);
        if (iaErr) throw new Error(iaErr.message);
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
    const force = searchParams.get("force") === "true";
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const { data: svc } = await sb.from(SERVICES).select("Name").eq("id", id).maybeSingle();

    if (!force && svc?.["Name"]) {
      // Deleting the Service row would orphan any future appointment that still references it
      // by name — the calendar event itself displays fine (it's plain text), but rescheduling
      // or re-resolving it would find no recipe at all. Warn instead of silently orphaning.
      const tz = await getClinicTimezone();
      const today = todayInZone(tz);
      const future = await getEventsByRange(today, addCalendarDays(today, 180), tz);
      const upcomingCount = future.filter(
        (e) => e.treatment.toLowerCase() === String(svc["Name"]).toLowerCase(),
      ).length;
      if (upcomingCount > 0) {
        return NextResponse.json(
          {
            error: `${svc["Name"]} has ${upcomingCount} upcoming appointment(s) in the next 180 days — deleting it now would leave them pointing at a service that no longer exists.`,
            upcomingCount,
            code: "WOULD_ORPHAN_APPOINTMENTS",
          },
          { status: 409 },
        );
      }
    }

    const { error } = await sb.from(SERVICES).delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/settings/services error:", err);
    return NextResponse.json({ error: "Failed to delete service" }, { status: 500 });
  }
}
