import { NextRequest, NextResponse } from "next/server";
import { mapCustomerRow } from "@/lib/customers/map-row";
import { normalizeBirthdayForStorage } from "@/lib/birthday";
import { getSupabase } from "@/lib/supabase";
import { requireApiPermission } from "@/lib/rbac/guard";

export const dynamic = "force-dynamic";

const TABLE = "Clients";
const mapRow = mapCustomerRow;

export async function GET(req: NextRequest) {
  const check = await requireApiPermission("customers", "View");
  if (!check.ok) return check.response;

  try {
    const sb = getSupabase();
    const { searchParams } = req.nextUrl;
    const q = searchParams.get("q") ?? "";
    const status = searchParams.get("status") ?? "all";
    const last = searchParams.get("last") ?? "any";
    const limit = Math.min(Number(searchParams.get("limit") ?? "500"), 1000);

    let query = sb.from(TABLE).select("*").limit(limit);
    if (status !== "all") query = query.eq("Status", status);
    if (q) {
      query = query.or(`Name.ilike.%${q}%,Phone.ilike.%${q}%,Email.ilike.%${q}%`);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    let customers = (data ?? []).map(mapRow);

    if (last !== "any") {
      const now = Date.now();
      customers = customers.filter((c) => {
        if (!c.last_visit) return false;
        const days = (now - new Date(c.last_visit).getTime()) / 86400000;
        if (last === "7") return days <= 7;
        if (last === "30") return days <= 30;
        if (last === "30-90") return days > 30 && days <= 90;
        if (last === "90") return days > 90;
        return true;
      });
    }

    return NextResponse.json({ customers, total: customers.length });
  } catch (error) {
    console.error("GET /api/customers error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const check = await requireApiPermission("customers", "Create");
  if (!check.ok) return check.response;

  try {
    const sb = getSupabase();
    const body = await req.json();
    const { name, phone, email, birthday, status, notes, treatmentInterest } = body;
    if (!name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });

    const normalizedBirthday = birthday ? normalizeBirthdayForStorage(String(birthday)) : "";

    const { data, error } = await sb
      .from(TABLE)
      .insert({
        Name: name,
        Phone: phone ?? "",
        Email: email ?? "",
        Birthday: normalizedBirthday ?? "",
        Status: status ?? "Active",
        Notes: notes ?? "",
        "Treatment Interest": treatmentInterest ?? "",
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ customer: mapRow(data) });
  } catch (error) {
    console.error("POST /api/customers error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const check = await requireApiPermission("customers", "Update");
  if (!check.ok) return check.response;

  try {
    const sb = getSupabase();
    const body = await req.json();
    const {
      recordId,
      name,
      phone,
      email,
      birthday,
      status,
      notes,
      treatmentInterest,
      appointments,
      lastVisit,
    } = body;
    if (!recordId) return NextResponse.json({ error: "recordId is required" }, { status: 400 });

    const fields: Record<string, any> = {};
    if (name !== undefined) fields["Name"] = name;
    if (phone !== undefined) fields["Phone"] = phone;
    if (email !== undefined) fields["Email"] = email;
    if (birthday !== undefined) {
      fields["Birthday"] = birthday ? (normalizeBirthdayForStorage(String(birthday)) ?? "") : "";
    }
    if (status !== undefined) fields["Status"] = status;
    if (notes !== undefined) fields["Notes"] = notes;
    if (treatmentInterest !== undefined) fields["Treatment Interest"] = treatmentInterest;
    if (appointments !== undefined) fields["Appointments"] = appointments;
    if (lastVisit !== undefined) fields["Last Visit"] = lastVisit;

    const { data, error } = await sb
      .from(TABLE)
      .update(fields)
      .eq("id", recordId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ customer: mapRow(data) });
  } catch (error) {
    console.error("PATCH /api/customers error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const check = await requireApiPermission("customers", "Delete");
  if (!check.ok) return check.response;

  try {
    const sb = getSupabase();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const { error } = await sb.from(TABLE).delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/customers error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
