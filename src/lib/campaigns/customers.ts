const CLIENTS_TABLE = "Clients";

export interface EligibleCustomer {
  id: string;
  name: string;
  email: string;
  phone: string;
  visit_count: number;
}

function parseVisitCount(appointmentsRaw: string | null): number {
  if (!appointmentsRaw) return 0;
  return appointmentsRaw
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean).length;
}

/**
 * Paginated scan of Clients — scales to thousands of rows via batched reads.
 */
export async function fetchEligibleCustomers(
  sb: ReturnType<typeof import("@/lib/supabase").getSupabase>,
  minVisits: number,
): Promise<EligibleCustomer[]> {
  const PAGE = 500;
  const eligible: EligibleCustomer[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await sb
      .from(CLIENTS_TABLE)
      .select('id, "Name", "Email", "Phone", "Appointments"')
      .range(offset, offset + PAGE - 1);

    if (error) throw new Error(error.message);
    if (!data?.length) break;

    for (const row of data) {
      const visit_count = parseVisitCount(row["Appointments"] ?? null);
      if (visit_count >= minVisits) {
        eligible.push({
          id: String(row.id),
          name: String(row["Name"] ?? "Unknown"),
          email: String(row["Email"] ?? ""),
          phone: String(row["Phone"] ?? ""),
          visit_count,
        });
      }
    }

    if (data.length < PAGE) break;
    offset += PAGE;
  }

  return eligible;
}

/** Count customers meeting visit threshold without loading full rows (for preview). */
export async function countEligibleCustomers(
  sb: ReturnType<typeof import("@/lib/supabase").getSupabase>,
  minVisits: number,
): Promise<number> {
  const customers = await fetchEligibleCustomers(sb, minVisits);
  return customers.length;
}
