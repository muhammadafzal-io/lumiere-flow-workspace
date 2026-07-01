import { countCustomerVisits, normalizeMinVisits } from "@/lib/customers/visit-count";

const CLIENTS_TABLE = "Clients";

export interface EligibleCustomer {
  id: string;
  name: string;
  email: string;
  phone: string;
  visit_count: number;
}

/**
 * Paginated scan of Clients — scales to thousands of rows via batched reads.
 */
export async function fetchEligibleCustomers(
  sb: ReturnType<typeof import("@/lib/supabase").getSupabase>,
  minVisits: number,
): Promise<EligibleCustomer[]> {
  const threshold = normalizeMinVisits(minVisits);
  const PAGE = 500;
  const eligible: EligibleCustomer[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await sb
      .from(CLIENTS_TABLE)
      .select('id, "Name", "Email", "Phone", "Appointments", "Last Visit"')
      .range(offset, offset + PAGE - 1);

    if (error) throw new Error(error.message);
    if (!data?.length) break;

    for (const row of data) {
      const visit_count = countCustomerVisits(
        row["Appointments"] ?? null,
        row["Last Visit"] ?? null,
      );
      const email = String(row["Email"] ?? "").trim();
      if (visit_count >= threshold && visit_count > 0 && email) {
        eligible.push({
          id: String(row.id),
          name: String(row["Name"] ?? "Unknown"),
          email,
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
