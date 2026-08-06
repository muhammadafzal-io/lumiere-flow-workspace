import { deriveLastVisit } from "@/lib/customers/last-visit";
import { countCustomerVisits, splitAppointmentField } from "@/lib/customers/visit-count";
import type { Customer, Status, Treatment } from "@/lib/types";

export function parseAppointments(raw: string | null): string[] {
  return splitAppointmentField(raw);
}

export function parseTreatments(raw: string | null): Treatment[] {
  if (!raw) return [];
  return raw
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Maps a raw `Clients` table row (Postgres, legacy Airtable-style column names) to the admin-UI `Customer` shape. */
export function mapCustomerRow(row: any): Customer {
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
      return { date: date.toISOString(), treatment: treatments[0] ?? "", spend: 0 };
    })
    .filter(Boolean) as Customer["visits"];

  return {
    id: row.id,
    name: row["Name"] ?? "Unknown",
    phone: row["Phone"] ?? "",
    email: row["Email"] ?? "",
    birthday: row["Birthday"] ?? "",
    last_visit: deriveLastVisit(row["Last Visit"], apptStrings),
    total_visits: countCustomerVisits(row["Appointments"] ?? null, row["Last Visit"] ?? null),
    lifetime_value: 0,
    treatments,
    status: (row["Status"] as Status) ?? "Active",
    notes: row["Notes"] ?? "",
    visits,
    payments: [],
    appointments: row["Appointments"] ?? "",
  };
}
