/* eslint-disable prettier/prettier */
import { NextRequest, NextResponse } from "next/server";
import { bookAppointment } from "@/lib/services/booking-service";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    startTime,
    endTime,
    clientName,
    clientContact,
    treatment,
    room,
    practitionerName,
    notes,
  } = body as Record<string, string>;

  if (!startTime || !endTime || !clientName || !treatment || !room || !practitionerName) {
    return NextResponse.json(
      {
        error: "startTime, endTime, clientName, treatment, room and practitionerName are required",
      },
      { status: 400 },
    );
  }

  try {
    const result = await bookAppointment({
      startTime,
      endTime,
      clientName,
      clientContact: clientContact || "",
      treatment,
      room,
      practitionerName,
      notes,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Booking failed";
    const isConflict =
      message.toLowerCase().includes("already booked") ||
      message.toLowerCase().includes("not available") ||
      message.toLowerCase().includes("unavailable");
    return NextResponse.json(
      { error: message, code: isConflict ? "CONFLICT" : "BOOKING_ERROR" },
      { status: isConflict ? 409 : 400 },
    );
  }
}
