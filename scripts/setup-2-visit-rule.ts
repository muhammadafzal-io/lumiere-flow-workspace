/**
 * One-time setup: set 2-visit Appointments on sample clients + create loyalty rule.
 * Run: npx tsx --env-file=.env.local scripts/setup-2-visit-rule.ts
 */
import { getSupabase } from "../src/lib/supabase";

const CLIENT_UPDATES: Array<{ id: string; name: string; appointments: string; lastVisit: string }> =
  [
    {
      id: "e39014a6-4c65-46fc-bee6-3eb9c1aedbe5",
      name: "Afzal",
      appointments: "2026-05-01;2026-06-05",
      lastVisit: "2026-06-05",
    },
    {
      id: "370ddec9-bfc8-4b6d-a009-135937554809",
      name: "Yush",
      appointments: "2026-05-10;2026-06-07",
      lastVisit: "2026-06-07",
    },
    {
      id: "ce1dea1e-7b3c-43f7-8c1b-a6116e5e9752",
      name: "Shukla",
      appointments: "2026-04-20;2026-06-01",
      lastVisit: "2026-06-01",
    },
  ];

async function main() {
  const sb = getSupabase();

  for (const c of CLIENT_UPDATES) {
    const { error } = await sb
      .from("Clients")
      .update({ Appointments: c.appointments, "Last Visit": c.lastVisit })
      .eq("id", c.id);
    if (error) throw new Error(`Update ${c.name}: ${error.message}`);
    console.log(`✓ ${c.name} → 2 visits (${c.appointments})`);
  }

  const existing = await sb
    .from("Rules")
    .select("id")
    .eq("Rule Name", "2-Visit loyalty email")
    .maybeSingle();

  if (existing.data?.id) {
    console.log(`✓ Rule already exists: ${existing.data.id}`);
    return;
  }

  const { data, error } = await sb
    .from("Rules")
    .insert({
      "Rule Name": "2-Visit loyalty email",
      Status: "Active",
      "Trigger Type": "Visit count",
      "Trigger Config": JSON.stringify({
        min_visits: 2,
        audience_filters: { visit_min: 2, visit_max: 2 },
      }),
      Channel: "Email",
      "Message Template":
        "Hi {first_name}, thank you for visiting Lumière twice! Enjoy $20 off your next treatment. Use code {credit_code} when you book.",
      "Incentive Code": "VISIT2",
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  console.log(`✓ Created rule: ${data.id}`);
  console.log(`  Open: /rules/${data.id}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
