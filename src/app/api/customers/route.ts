import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import type { Customer, Status, Treatment } from "@/lib/types";

export const dynamic = "force-dynamic";

const TABLE = "Clients";

function parseAppointments(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseTreatments(raw: string | null): Treatment[] {
  if (!raw) return [];
  const valid: Treatment[] = [
    "Botox",
    "HydraFacial",
    "Laser",
    "Microneedling",
    "IV Drip",
    "Filler",
  ];
  return raw
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter((t): t is Treatment => valid.includes(t as Treatment));
}

function mapRow(row: any): Customer {
  const apptStrings = parseAppointments(row["Appointments"] ?? null);
  const treatments = parseTreatments(row["Treatment Interest"] ?? null);
  const visits = apptStrings
    .map((appt) => {
      const dateMatch = appt.match(
        /[A-Z][a-z]{2}\s+[A-Z][a-z]{2}\s+\d{1,2},\s*\d{4}|^\d{4}-\d{2}-\d{2}/,
      );
      if (!dateMatch) return null;
      const date = new Date(dateMatch[0]);
      if (isNaN(date.getTime())) return null;
      return { date: date.toISOString(), treatment: treatments[0] ?? "HydraFacial", spend: 0 };
    })
    .filter(Boolean) as Customer["visits"];

  return {
    id: row.id,
    name: row["Name"] ?? "Unknown",
    phone: row["Phone"] ?? "",
    email: row["Email"] ?? "",
    birthday: row["Birthday"] ?? "",
    last_visit: row["Last Visit"] ?? "",
    total_visits: apptStrings.length,
    lifetime_value: 0,
    treatments,
    status: (row["Status"] as Status) ?? "Active",
    notes: row["Notes"] ?? "",
    visits,
    payments: [],
  };
}

export async function GET(req: NextRequest) {
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
  try {
    const sb = getSupabase();
    const body = await req.json();
    const { name, phone, email, birthday, status, notes, treatmentInterest } = body;
    if (!name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });

    const { data, error } = await sb
      .from(TABLE)
      .insert({
        Name: name,
        Phone: phone ?? "",
        Email: email ?? "",
        Birthday: birthday ?? "",
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
  try {
    const sb = getSupabase();
    const body = await req.json();
    const { recordId, name, phone, email, birthday, status, notes, treatmentInterest } = body;
    if (!recordId) return NextResponse.json({ error: "recordId is required" }, { status: 400 });

    const fields: Record<string, any> = {};
    if (name !== undefined) fields["Name"] = name;
    if (phone !== undefined) fields["Phone"] = phone;
    if (email !== undefined) fields["Email"] = email;
    if (birthday !== undefined) fields["Birthday"] = birthday;
    if (status !== undefined) fields["Status"] = status;
    if (notes !== undefined) fields["Notes"] = notes;
    if (treatmentInterest !== undefined) fields["Treatment Interest"] = treatmentInterest;

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
