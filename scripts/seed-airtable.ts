/// <reference types="node" />
/**
 * Seed script — populates the Airtable "Clients" table with 50 realistic
 * fake clients for the demo environment.
 *
 * Run with env vars loaded:
 *   set AIRTABLE_API_KEY=... && set AIRTABLE_BASE_ID=... && npx tsx scripts/seed-airtable.ts
 * Or with a .env.local file using tsx's built-in env loading:
 *   npx tsx --env-file=.env.local scripts/seed-airtable.ts
 */

import Airtable from "airtable";

const apiKey = process.env.AIRTABLE_API_KEY;
const baseId = process.env.AIRTABLE_BASE_ID;
const TABLE = process.env.AIRTABLE_CLIENTS_TABLE ?? "Clients";

if (!apiKey || !baseId) {
  console.error("Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID");
  process.exit(1);
}

const base = new Airtable({ apiKey }).base(baseId);

const TREATMENTS = [
  "Botox",
  "Lip Filler",
  "Cheek Filler",
  "HydraFacial Classic",
  "HydraFacial Deluxe",
  "Laser Hair Removal",
  "Microneedling",
  "IV Vitamin Therapy - Myers Cocktail",
  "IV Vitamin Therapy - Glow Drip",
  "Under-Eye Filler",
];

const FIRST_NAMES = [
  "Emma",
  "Olivia",
  "Sophia",
  "Ava",
  "Isabella",
  "Mia",
  "Charlotte",
  "Amelia",
  "Harper",
  "Evelyn",
  "Abigail",
  "Emily",
  "Elizabeth",
  "Sofia",
  "Avery",
  "Ella",
  "Scarlett",
  "Grace",
  "Victoria",
  "Riley",
  "Aria",
  "Lily",
  "Aubrey",
  "Zoey",
  "Penelope",
  "Layla",
  "Nora",
  "Luna",
  "Ellie",
  "Hannah",
  "Lillian",
  "Addison",
  "Aubree",
  "Madison",
  "Brooklyn",
  "Leah",
  "Savannah",
  "Chloe",
  "Camila",
  "Paisley",
  "Genesis",
  "Natalia",
  "Claire",
  "Skylar",
  "Lucy",
  "Violet",
  "Aurora",
  "Stella",
  "Zoe",
  "Maya",
];

const LAST_NAMES = [
  "Smith",
  "Johnson",
  "Williams",
  "Brown",
  "Jones",
  "Garcia",
  "Miller",
  "Davis",
  "Wilson",
  "Martinez",
  "Anderson",
  "Taylor",
  "Thomas",
  "Hernandez",
  "Moore",
  "Martin",
  "Jackson",
  "Thompson",
  "White",
  "Lopez",
  "Lee",
  "Harris",
  "Clark",
];

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomDate(daysAgo: { min: number; max: number }): string {
  const days = Math.floor(Math.random() * (daysAgo.max - daysAgo.min + 1)) + daysAgo.min;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}

function randomBirthday(): string {
  const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, "0");
  const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, "0");
  return `${month}-${day}`;
}

function randomPhone(): string {
  const area = Math.floor(Math.random() * 900) + 100;
  const mid = Math.floor(Math.random() * 900) + 100;
  const end = Math.floor(Math.random() * 9000) + 1000;
  return `${area}-${mid}-${end}`;
}

// 30 clients with recent visits (Active), 20 with old visits (Dormant)
const clients = FIRST_NAMES.map((first, i) => {
  const last = randomFrom(LAST_NAMES);
  const treatment = randomFrom(TREATMENTS);
  const isDormant = i >= 30;

  return {
    Name: `${first} ${last}`,
    Phone: randomPhone(),
    Email: `${first.toLowerCase()}.${last.toLowerCase()}${i}@example.com`,
    "Last Visit": isDormant ? randomDate({ min: 91, max: 180 }) : randomDate({ min: 7, max: 85 }),
    "Treatment Interest": treatment,
    Birthday: randomBirthday(),
    Status: isDormant ? "Dormant" : "Active",
    Notes: i === 0 ? "VIP client — Dr. Marchetti personally handles" : "",
  };
});

async function seed() {
  console.log(`Seeding ${clients.length} clients into Airtable table "${TABLE}"...`);

  // Airtable create allows max 10 records per call
  for (let i = 0; i < clients.length; i += 10) {
    const batch = clients
      .slice(i, i + 10)
      .map((fields) => ({ fields: fields as Airtable.FieldSet }));
    await base(TABLE).create(batch);
    console.log(`  Created ${Math.min(i + 10, clients.length)} / ${clients.length}`);
  }

  console.log("Seed complete!");
}

seed().catch((err: unknown) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
