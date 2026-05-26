/* eslint-disable prettier/prettier */
import { NextRequest, NextResponse } from "next/server";
import type { Customer, Status, Treatment } from "@/lib/types";

export const dynamic = "force-dynamic";

const TABLE = "Clients";

function airtableBase() {
  const token = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!token || !baseId) throw new Error("Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID");
  return { token, baseId };
}

function parseAppointments(raw: string | string[] | null): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  return raw
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseTreatments(raw: string | string[] | null): Treatment[] {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : raw.split(/[;,]/).map((s) => s.trim());
  const valid: Treatment[] = [
    "Botox",
    "HydraFacial",
    "Laser",
    "Microneedling",
    "IV Drip",
    "Filler",
  ];
  return list.filter((t): t is Treatment => valid.includes(t as Treatment));
}

function mapRecord(record: any): Customer {
  const f = record.fields;

  const apptStrings = parseAppointments(f["Appointments"] ?? null);
  const treatments = parseTreatments(f["Treatment Interest"] ?? null);

  // Derive visits from the Appointments field strings (best effort)
  const visits = apptStrings
    .map((appt) => {
      const dateMatch = appt.match(
        /[A-Z][a-z]{2}\s+[A-Z][a-z]{2}\s+\d{1,2},\s*\d{4}|^\d{4}-\d{2}-\d{2}/,
      );
      const treatMatch = treatments[0] ?? "HydraFacial";
      if (!dateMatch) return null;
      const date = new Date(dateMatch[0]);
      if (isNaN(date.getTime())) return null;
      return { date: date.toISOString(), treatment: treatMatch, spend: 0 };
    })
    .filter(Boolean) as Customer["visits"];

  return {
    id: record.id,
    name: f["Name"] ?? "Unknown",
    phone: f["Phone"] ?? "",
    email: f["Email"] ?? "",
    birthday: f["Birthday"] ?? "",
    last_visit: f["Last Visit"] ?? "",
    total_visits: apptStrings.length || 0,
    lifetime_value: 0,
    treatments,
    status: (f["Status"] as Status) ?? "Active",
    notes: f["Notes"] ?? "",
    visits,
    payments: [],
  };
}

// GET /api/customers?q=&status=&last=&limit=
export async function GET(req: NextRequest) {
  try {
    const { token, baseId } = airtableBase();
    const { searchParams } = req.nextUrl;
    const q = searchParams.get("q") ?? "";
    const status = searchParams.get("status") ?? "all";
    const last = searchParams.get("last") ?? "any";
    const limit = Math.min(Number(searchParams.get("limit") ?? "500"), 1000);

    // Build Airtable filter formula
    const filters: string[] = [];
    if (status !== "all") {
      filters.push(`{Status}="${status}"`);
    }
    if (q) {
      filters.push(
        `OR(SEARCH(LOWER("${q}"),LOWER({Name})),SEARCH(LOWER("${q}"),LOWER({Phone})),SEARCH(LOWER("${q}"),LOWER({Email})))`,
      );
    }
    const formula = filters.length > 1 ? `AND(${filters.join(",")})` : (filters[0] ?? "");

    const params = new URLSearchParams({
      pageSize: String(Math.min(limit, 100)),
      ...(formula && { filterByFormula: formula }),
    });

    // Paginate through all records
    const allRecords: any[] = [];
    let offset: string | undefined;

    do {
      if (offset) params.set("offset", offset);
      const res = await fetch(`https://api.airtable.com/v0/${baseId}/${TABLE}?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!res.ok) {
        const err = await res.json();
        console.error("Airtable GET Clients error:", err);
        return NextResponse.json({ error: "Failed to fetch customers" }, { status: res.status });
      }
      const data = await res.json();
      allRecords.push(...(data.records ?? []));
      offset = data.offset;
    } while (offset && allRecords.length < limit);

    let customers = allRecords.slice(0, limit).map(mapRecord);

    // Client-side last-visit filter (Airtable formula for dates is complex)
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

// POST /api/customers — create a new customer in Airtable
export async function POST(req: Request) {
  try {
    const { token, baseId } = airtableBase();
    const body = await req.json();
    const { name, phone, email, birthday, status, notes, treatmentInterest } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const res = await fetch(`https://api.airtable.com/v0/${baseId}/${TABLE}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        records: [
          {
            fields: {
              Name: name,
              Phone: phone ?? "",
              Email: email ?? "",
              Birthday: birthday ?? "",
              Status: status ?? "Active",
              Notes: notes ?? "",
              "Treatment Interest": treatmentInterest ?? "",
            },
          },
        ],
        typecast: true,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      console.error("Airtable POST Clients error:", err);
      return NextResponse.json({ error: "Failed to create customer" }, { status: res.status });
    }

    const data = await res.json();
    const created = mapRecord(data.records[0]);
    return NextResponse.json({ customer: created });
  } catch (error) {
    console.error("POST /api/customers error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// PATCH /api/customers — update a customer by Airtable record ID
export async function PATCH(req: Request) {
  try {
    const { token, baseId } = airtableBase();
    const body = await req.json();
    const { recordId, ...fields } = body;

    if (!recordId) {
      return NextResponse.json({ error: "recordId is required" }, { status: 400 });
    }

    const airtableFields: Record<string, any> = {};
    if (fields.name !== undefined) airtableFields["Name"] = fields.name;
    if (fields.phone !== undefined) airtableFields["Phone"] = fields.phone;
    if (fields.email !== undefined) airtableFields["Email"] = fields.email;
    if (fields.birthday !== undefined) airtableFields["Birthday"] = fields.birthday;
    if (fields.status !== undefined) airtableFields["Status"] = fields.status;
    if (fields.notes !== undefined) airtableFields["Notes"] = fields.notes;
    if (fields.treatmentInterest !== undefined)
      airtableFields["Treatment Interest"] = fields.treatmentInterest;

    const res = await fetch(`https://api.airtable.com/v0/${baseId}/${TABLE}/${recordId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields: airtableFields, typecast: true }),
    });

    if (!res.ok) {
      const err = await res.json();
      console.error("Airtable PATCH Clients error:", err);
      return NextResponse.json({ error: "Failed to update customer" }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json({ customer: mapRecord(data) });
  } catch (error) {
    console.error("PATCH /api/customers error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// DELETE /api/customers?id=recXXX
export async function DELETE(req: Request) {
  try {
    const { token, baseId } = airtableBase();
    const { searchParams } = new URL(req.url);
    const recordId = searchParams.get("id");

    if (!recordId) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const res = await fetch(`https://api.airtable.com/v0/${baseId}/${TABLE}/${recordId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const err = await res.json();
      console.error("Airtable DELETE Clients error:", err);
      return NextResponse.json({ error: "Failed to delete customer" }, { status: res.status });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/customers error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
