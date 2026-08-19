import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { requireApiPermission } from "@/lib/rbac/guard";
import { getEventsByRange } from "@/lib/integrations/google-calendar";
import { todayInZone, addCalendarDays } from "@/lib/booking/dates";
import { getClinicTimezone } from "@/lib/clinic-config";
import { resolvePricing, type ServiceOfferRow } from "@/lib/booking/offer-pricing";

export const dynamic = "force-dynamic";

const SERVICES = "Services";
const REQS = "ServiceRequirements";
const FORM_ASSIGNMENTS = "ServiceFormAssignments";
const ADDONS = "ServiceAddons";
const OFFERS = "ServiceOffers";

/** Validates the shape of an incoming addOns array before it ever touches the DB — each row
 * needs a name; price/durationMinutes, if given, must be non-negative numbers. Returns an error
 * string, or null if valid. */
function validateAddonsPayload(addOns: unknown): string | null {
  if (!Array.isArray(addOns)) return null;
  for (const a of addOns) {
    if (!a || typeof a !== "object" || !String(a.name ?? "").trim()) {
      return "Each add-on needs a name";
    }
    if (a.price !== undefined && a.price !== null && (typeof a.price !== "number" || a.price < 0)) {
      return `Add-on "${a.name}" price must be a non-negative number`;
    }
    if (
      a.durationMinutes !== undefined &&
      a.durationMinutes !== null &&
      (typeof a.durationMinutes !== "number" || a.durationMinutes < 0)
    ) {
      return `Add-on "${a.name}" duration must be a non-negative number of minutes`;
    }
  }
  return null;
}

function toAddonRows(serviceId: string, addOns: any[]) {
  return addOns.map((a) => ({
    service_id: serviceId,
    name: String(a.name).trim(),
    description: a.description || null,
    price: a.price ?? null,
    duration_minutes: a.durationMinutes ?? 0,
    status: a.status === "Inactive" ? "Inactive" : "Active",
  }));
}

/** Validates the shape of an incoming offers array — each row needs a name, a valid discount
 * type, and a discount value that can't ever produce a negative/nonsensical price (mirrors
 * isValidDiscountValue in src/lib/booking/offer-pricing.ts so Settings rejects the same values
 * the booking flow would silently exclude anyway, instead of letting staff save something that
 * quietly never applies). */
function validateOffersPayload(offers: unknown): string | null {
  if (!Array.isArray(offers)) return null;
  for (const o of offers) {
    if (!o || typeof o !== "object" || !String(o.name ?? "").trim()) {
      return "Each offer needs a name";
    }
    if (o.discountType !== "percentage" && o.discountType !== "fixed") {
      return `Offer "${o.name}" discount type must be "percentage" or "fixed"`;
    }
    const value = Number(o.discountValue);
    if (!Number.isFinite(value) || value < 0) {
      return `Offer "${o.name}" discount value must be a non-negative number`;
    }
    if (o.discountType === "percentage" && value > 100) {
      return `Offer "${o.name}" percentage discount can't exceed 100%`;
    }
    if (o.startsAt && o.endsAt && new Date(o.startsAt) > new Date(o.endsAt)) {
      return `Offer "${o.name}" start date must be before its end date`;
    }
  }
  return null;
}

function toOfferRows(serviceId: string, offers: any[]) {
  return offers.map((o) => ({
    service_id: serviceId,
    name: String(o.name).trim(),
    discount_type: o.discountType === "fixed" ? "fixed" : "percentage",
    discount_value: Number(o.discountValue),
    enabled: o.enabled !== false,
    starts_at: o.startsAt || null,
    ends_at: o.endsAt || null,
  }));
}

function mapService(r: any) {
  return {
    id: r.id,
    name: r["Name"] ?? "",
    durationMinutes: r["DurationMinutes"] ?? 60,
    onlineBookable: r["OnlineBookable"] ?? true,
    requiresConsultation: r["RequiresConsultation"] ?? false,
    minNoticeHours: r["MinNoticeHours"] ?? 0,
    maxAdvanceDays: r["MaxAdvanceDays"] ?? 365,
    waitlistCap: r["WaitlistCap"] ?? null,
    price: r["Price"] === null || r["Price"] === undefined ? null : Number(r["Price"]),
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

    const { data: assignments } = await sb
      .from(FORM_ASSIGNMENTS)
      .select("*")
      .in("service_id", ids.length ? ids : ["invalid"]);

    const assignmentsGrouped: Record<string, string[]> = {};
    (assignments ?? []).forEach((a: any) => {
      (assignmentsGrouped[a.service_id] ??= []).push(a.form_id);
    });

    const { data: addons } = await sb
      .from(ADDONS)
      .select("*")
      .in("service_id", ids.length ? ids : ["invalid"]);

    const addonsGrouped: Record<string, any[]> = {};
    (addons ?? []).forEach((a: any) => {
      (addonsGrouped[a.service_id] ??= []).push({
        id: a.id,
        name: a.name,
        description: a.description,
        price: a.price === null ? null : Number(a.price),
        durationMinutes: a.duration_minutes ?? 0,
        status: a.status ?? "Active",
      });
    });

    const { data: offers } = await sb
      .from(OFFERS)
      .select("*")
      .in("service_id", ids.length ? ids : ["invalid"]);

    const offersGrouped: Record<string, any[]> = {};
    (offers ?? []).forEach((o: any) => {
      (offersGrouped[o.service_id] ??= []).push({
        id: o.id,
        name: o.name,
        discountType: o.discount_type === "fixed" ? "fixed" : "percentage",
        discountValue: Number(o.discount_value),
        enabled: o.enabled ?? true,
        startsAt: o.starts_at,
        endsAt: o.ends_at,
      });
    });

    const payload = services.map((s: any) => {
      const mapped = mapService(s);
      const rowOffers: ServiceOfferRow[] = (offersGrouped[s.id] ?? []).map((o) => ({
        id: o.id,
        serviceId: s.id,
        name: o.name,
        discountType: o.discountType,
        discountValue: o.discountValue,
        enabled: o.enabled,
        startsAt: o.startsAt,
        endsAt: o.endsAt,
      }));
      const pricing = resolvePricing(mapped.price, rowOffers);
      return {
        ...mapped,
        requirements: grouped[s.id] ?? [],
        attachedFormIds: assignmentsGrouped[s.id] ?? [],
        addOns: addonsGrouped[s.id] ?? [],
        offers: offersGrouped[s.id] ?? [],
        offerPrice: pricing.offer ? pricing.finalPrice : null,
        activeOfferId: pricing.offer?.id ?? null,
      };
    });
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
      WaitlistCap,
      Price,
      Status,
      requirements,
      attachedFormIds,
      addOns,
      offers,
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
    if (
      WaitlistCap !== undefined &&
      WaitlistCap !== null &&
      (typeof WaitlistCap !== "number" || WaitlistCap <= 0)
    ) {
      return NextResponse.json(
        { error: "Waitlist cap must be a positive number, or left blank for the default" },
        { status: 400 },
      );
    }
    if (Price !== undefined && Price !== null && (typeof Price !== "number" || Price < 0)) {
      return NextResponse.json(
        { error: "Price must be a non-negative number, or left blank" },
        { status: 400 },
      );
    }
    const addonsError = validateAddonsPayload(addOns);
    if (addonsError) {
      return NextResponse.json({ error: addonsError }, { status: 400 });
    }
    const offersError = validateOffersPayload(offers);
    if (offersError) {
      return NextResponse.json({ error: offersError }, { status: 400 });
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
        WaitlistCap: WaitlistCap ?? null,
        Price: Price ?? null,
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

    // Insert attached form assignments if provided
    if (Array.isArray(attachedFormIds) && attachedFormIds.length > 0) {
      const rows = attachedFormIds.map((formId: string) => ({
        service_id: svc.id,
        form_id: formId,
      }));
      const { error: aerr } = await sb.from(FORM_ASSIGNMENTS).insert(rows);
      if (aerr) throw new Error(aerr.message);
    }

    // Insert add-ons if provided
    if (Array.isArray(addOns) && addOns.length > 0) {
      const { error: addonErr } = await sb.from(ADDONS).insert(toAddonRows(svc.id, addOns));
      if (addonErr) throw new Error(addonErr.message);
    }

    // Insert offers if provided
    if (Array.isArray(offers) && offers.length > 0) {
      const { error: offerErr } = await sb.from(OFFERS).insert(toOfferRows(svc.id, offers));
      if (offerErr) throw new Error(offerErr.message);
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
    if (
      body.WaitlistCap !== undefined &&
      body.WaitlistCap !== null &&
      (typeof body.WaitlistCap !== "number" || body.WaitlistCap <= 0)
    ) {
      return NextResponse.json(
        { error: "Waitlist cap must be a positive number, or left blank for the default" },
        { status: 400 },
      );
    }
    if (
      body.Price !== undefined &&
      body.Price !== null &&
      (typeof body.Price !== "number" || body.Price < 0)
    ) {
      return NextResponse.json(
        { error: "Price must be a non-negative number, or left blank" },
        { status: 400 },
      );
    }
    const addonsError = validateAddonsPayload(body.addOns);
    if (addonsError) {
      return NextResponse.json({ error: addonsError }, { status: 400 });
    }
    const offersError = validateOffersPayload(body.offers);
    if (offersError) {
      return NextResponse.json({ error: offersError }, { status: 400 });
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
    if (body.WaitlistCap !== undefined) fields["WaitlistCap"] = body.WaitlistCap;
    if (body.Price !== undefined) fields["Price"] = body.Price;
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

    // Replace add-ons if provided
    if (Array.isArray(body.addOns)) {
      const { error: daoErr } = await sb.from(ADDONS).delete().eq("service_id", id);
      if (daoErr) throw new Error(daoErr.message);
      if (body.addOns.length > 0) {
        const { error: iaoErr } = await sb.from(ADDONS).insert(toAddonRows(id, body.addOns));
        if (iaoErr) throw new Error(iaoErr.message);
      }
    }

    // Replace offers if provided
    if (Array.isArray(body.offers)) {
      const { error: doErr } = await sb.from(OFFERS).delete().eq("service_id", id);
      if (doErr) throw new Error(doErr.message);
      if (body.offers.length > 0) {
        const { error: ioErr } = await sb.from(OFFERS).insert(toOfferRows(id, body.offers));
        if (ioErr) throw new Error(ioErr.message);
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
