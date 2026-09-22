import { NextResponse } from "next/server";
import { requireCustomer } from "@/lib/account/auth";
import { getCustomerAppointments } from "@/lib/account/data";

export const dynamic = "force-dynamic";

export async function GET() {
  const check = await requireCustomer();
  if (!check.ok) return check.response;

  try {
    // Scoped to the customer the session resolved to — never an id from the request.
    return NextResponse.json(await getCustomerAppointments(check.customer));
  } catch (err) {
    console.error("GET /api/account/appointments error:", err);
    return NextResponse.json({ error: "Failed to load your appointments" }, { status: 500 });
  }
}
