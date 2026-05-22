import type {
  Customer,
  Rule,
  Activity,
  Treatment,
  Status,
  MsgStatus,
  Practitioner,
  Appointment,
  AppointmentStatus,
  AppointmentSource,
  AiTranscriptMsg,
} from "./types";

const FIRST = [
  "Sofia",
  "Emma",
  "Olivia",
  "Ava",
  "Isabella",
  "Mia",
  "Charlotte",
  "Amelia",
  "Harper",
  "Evelyn",
  "Liam",
  "Noah",
  "Ethan",
  "Lucas",
  "Mason",
  "James",
  "Benjamin",
  "Henry",
  "Alexander",
  "Daniel",
  "Priya",
  "Aisha",
  "Mei",
  "Yuki",
  "Zara",
  "Camila",
  "Valentina",
  "Sienna",
  "Nadia",
  "Leila",
  "Gabriel",
  "Mateo",
  "Diego",
  "Omar",
  "Ravi",
  "Chen",
  "Hiro",
  "Kenji",
  "Anya",
  "Freya",
  "Ingrid",
  "Lena",
  "Elena",
  "Marisol",
  "Naomi",
  "Ruth",
  "Tessa",
  "Wren",
  "Nora",
  "Iris",
];
const LAST = [
  "Marchetti",
  "Chen",
  "Patel",
  "Hernandez",
  "Kim",
  "Williams",
  "Johnson",
  "Garcia",
  "Brown",
  "Davis",
  "Wilson",
  "Anderson",
  "Thompson",
  "Moore",
  "Martinez",
  "Robinson",
  "Clark",
  "Lewis",
  "Walker",
  "Hall",
  "Allen",
  "Young",
  "King",
  "Wright",
  "Scott",
  "Green",
  "Baker",
  "Adams",
  "Nelson",
  "Hill",
  "Ramirez",
  "Campbell",
  "Mitchell",
  "Carter",
  "Roberts",
  "Tanaka",
  "Schmidt",
  "Dubois",
  "Rossi",
  "Novak",
  "Singh",
  "Khan",
  "Lopez",
  "Reyes",
  "Cruz",
  "Ortiz",
  "Vargas",
  "Mendoza",
  "Rivera",
  "Flores",
];
const TREATMENTS: Treatment[] = [
  "Botox",
  "HydraFacial",
  "Laser",
  "Microneedling",
  "IV Drip",
  "Filler",
];
const NOTES = [
  "Prefers morning appointments.",
  "Sensitive to lidocaine.",
  "Referred by Lauren K.",
  "VIP — birthday in spring.",
  "Pregnancy — pause treatments.",
  "Loves the rose facial.",
  "Allergic to latex.",
  "",
  "",
];

export const TREATMENT_DURATIONS: Record<Treatment, number> = {
  Botox: 30,
  HydraFacial: 60,
  Laser: 45,
  Microneedling: 75,
  "IV Drip": 45,
  Filler: 60,
};
export const TREATMENT_PRICES: Record<Treatment, number> = {
  Botox: 480,
  HydraFacial: 220,
  Laser: 350,
  Microneedling: 420,
  "IV Drip": 180,
  Filler: 720,
};

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randInt(a: number, b: number) {
  return Math.floor(Math.random() * (b - a + 1)) + a;
}
function daysAgo(d: number) {
  const x = new Date();
  x.setDate(x.getDate() - d);
  return x.toISOString();
}
function pad(n: number) {
  return String(n).padStart(2, "0");
}

function genPhone() {
  return `+1 (${randInt(200, 989)}) ${randInt(200, 989)}-${pad(randInt(0, 9999)).padStart(4, "0")}`;
}

export function seedCustomers(): Customer[] {
  const list: Customer[] = [];
  for (let i = 0; i < 50; i++) {
    const first = rand(FIRST);
    const last = rand(LAST);
    const name = `${first} ${last}`;
    const visits_count = randInt(1, 32);
    const days_since_visit = i < 18 ? randInt(95, 540) : i < 30 ? randInt(0, 14) : randInt(15, 89);
    const ltv = randInt(200, 8400);
    const status: Status =
      ltv > 3000 ? "VIP" : days_since_visit > 90 ? "Dormant" : visits_count <= 2 ? "New" : "Active";
    const treatHistory: Treatment[] = Array.from(
      new Set(Array.from({ length: randInt(1, 4) }, () => rand(TREATMENTS))),
    );
    const visits = Array.from({ length: visits_count }, (_, j) => ({
      date: daysAgo(days_since_visit + j * randInt(20, 90)),
      treatment: rand(treatHistory),
      spend: randInt(150, 800),
    }));
    const payments = visits.map((v) => ({
      date: v.date,
      amount: v.spend,
      method: rand(["Visa •• 4242", "Amex •• 1003", "Mastercard •• 8821", "Apple Pay"]),
    }));
    list.push({
      id: `c_${i + 1}`,
      name,
      phone: genPhone(),
      email: `${first.toLowerCase()}.${last.toLowerCase()}@${rand(["gmail.com", "outlook.com", "icloud.com", "proton.me"])}`,
      birthday: `${randInt(1970, 2002)}-${pad(randInt(1, 12))}-${pad(randInt(1, 28))}`,
      last_visit: daysAgo(days_since_visit),
      total_visits: visits_count,
      lifetime_value: ltv,
      treatments: treatHistory,
      status,
      notes: rand(NOTES),
      visits,
      payments,
    });
  }
  return list;
}

export function seedRules(): Rule[] {
  return [
    {
      id: "r_1",
      name: "Birthday greeting",
      trigger_type: "Birthday",
      trigger_config: { days_before: 7 },
      audience_filter: [],
      channel: "WhatsApp",
      message_template:
        "Hi {first_name}, happy early birthday from all of us at Lumière. Enjoy a $50 credit on your next visit — code: {credit_code}.",
      offer_code: "BDAY50",
      status: "active",
      created_at: daysAgo(120),
      last_run_at: daysAgo(2),
      audience_size: 23,
      sent_30d: 23,
      reply_rate: 0.34,
      revenue: 4280,
    },
    {
      id: "r_2",
      name: "Dormant client win-back",
      trigger_type: "Inactivity",
      trigger_config: { days: 90 },
      audience_filter: [],
      channel: "Both",
      message_template:
        "We miss you, {first_name}. Come back for any treatment with 20% off — use {credit_code} within 30 days.",
      offer_code: "COMEBACK20",
      status: "active",
      created_at: daysAgo(200),
      last_run_at: daysAgo(1),
      audience_size: 134,
      sent_30d: 48,
      reply_rate: 0.21,
      revenue: 7840,
    },
    {
      id: "r_3",
      name: "Botox follow-up",
      trigger_type: "Treatment-based",
      trigger_config: { treatment: "Botox", days_after: 14 },
      audience_filter: [],
      channel: "WhatsApp",
      message_template:
        "Hi {first_name} — checking in 2 weeks after your Botox. How are you feeling? Tap here to rebook your touch-up.",
      status: "active",
      created_at: daysAgo(90),
      last_run_at: daysAgo(3),
      audience_size: 18,
      sent_30d: 18,
      reply_rate: 0.55,
      revenue: 3120,
    },
    {
      id: "r_4",
      name: "New client welcome",
      trigger_type: "Treatment-based",
      trigger_config: { treatment: "Any", days_after: 1 },
      audience_filter: [],
      channel: "Email",
      message_template:
        "Welcome to Lumière, {first_name}. Here's your aftercare guide and a few tips for the next 48 hours.",
      status: "active",
      created_at: daysAgo(150),
      last_run_at: daysAgo(4),
      audience_size: 12,
      sent_30d: 12,
      reply_rate: 0.18,
      revenue: 1640,
    },
    {
      id: "r_5",
      name: "Spring laser sale",
      trigger_type: "Date-based",
      trigger_config: { date: "2026-03-15" },
      audience_filter: ["Laser history"],
      channel: "Both",
      message_template:
        "Spring is here. Get 30% off full body laser this weekend only — book with code {credit_code}.",
      offer_code: "SPRING30",
      status: "paused",
      created_at: daysAgo(60),
      audience_size: 89,
      sent_30d: 0,
      reply_rate: 0,
      revenue: 1540,
    },
    {
      id: "r_6",
      name: "No-show recovery",
      trigger_type: "No-show recovery",
      trigger_config: { hours_after: 24 },
      audience_filter: [],
      channel: "WhatsApp",
      message_template:
        "Hi {first_name}, we missed you yesterday. Things happen — tap here to rebook in one tap.",
      status: "draft",
      created_at: daysAgo(5),
      audience_size: 6,
      sent_30d: 0,
      reply_rate: 0,
      revenue: 0,
    },
  ];
}

export function seedActivity(customers: Customer[], rules: Rule[]): Activity[] {
  const out: Activity[] = [];
  const activeRules = rules.filter((r) => r.status === "active");
  for (let i = 0; i < 80; i++) {
    const cust = rand(customers);
    const rule = rand(activeRules);
    const daysBack = randInt(0, 29);
    const hour = randInt(9, 19);
    const d = new Date();
    d.setDate(d.getDate() - daysBack);
    d.setHours(hour, randInt(0, 59));
    const statusRoll = Math.random();
    const status: MsgStatus =
      statusRoll < 0.05
        ? "Failed"
        : statusRoll < 0.15
          ? "Replied"
          : statusRoll < 0.55
            ? "Opened"
            : "Delivered";
    const first = cust.name.split(" ")[0];
    const body = rule.message_template
      .replace("{first_name}", first)
      .replace("{credit_code}", rule.offer_code || "WELCOME")
      .replace("{last_treatment}", cust.treatments[0] || "your treatment");
    out.push({
      id: `a_${i + 1}`,
      timestamp: d.toISOString(),
      customer_id: cust.id,
      rule_id: rule.id,
      channel: rule.channel === "Email" ? "Email" : "WhatsApp",
      message_body: body,
      status,
      reply:
        status === "Replied"
          ? rand([
              "Thank you!",
              "Booked, see you soon.",
              "Can I move it to next week?",
              "Loved the last visit.",
            ])
          : undefined,
      kind: "automated",
    });
  }
  return out.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export function seedPractitioners(): Practitioner[] {
  return [
    {
      id: "p_sofia",
      name: "Dr. Sofia Marchetti",
      role: "Founder · MD",
      color: "#0F766E",
      avatar_initial: "SM",
    },
    {
      id: "p_maya",
      name: "Maya Patel",
      role: "Aesthetician",
      color: "#D97706",
      avatar_initial: "MP",
    },
    {
      id: "p_jordan",
      name: "Jordan Riley",
      role: "Aesthetician",
      color: "#7C3AED",
      avatar_initial: "JR",
    },
  ];
}

const ROOMS = ["Room 1", "Room 2"];

function buildTranscript(client: string, treatment: Treatment, when: Date): AiTranscriptMsg[] {
  const day = when.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  const time = when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const first = client.split(" ")[0];
  return [
    {
      from: "client",
      text: `Hi! I was thinking about getting ${treatment.toLowerCase()} done sometime soon — do you have any openings?`,
      ts: "",
    },
    {
      from: "ai",
      text: `Hi ${first}, lovely to hear from you. I can definitely help. Quick check — any recent skin treatments, pregnancy, or new medications I should know about?`,
      ts: "",
    },
    { from: "client", text: `Nope, all good. Last visit was a HydraFacial in spring.`, ts: "" },
    {
      from: "ai",
      text: `Perfect. I have a few slots this week — ${day} at ${time} works well, with Dr. Sofia. Should I lock that in?`,
      ts: "",
    },
    { from: "client", text: `Yes please, that works.`, ts: "" },
    {
      from: "ai",
      text: `Booked. You'll get a confirmation by SMS in a moment, plus a reminder 24 hours before. See you ${day}.`,
      ts: "",
    },
  ];
}

function slotKey(prac: string, start: Date, dur: number) {
  return `${prac}_${start.toISOString().slice(0, 16)}_${dur}`;
}

function pickClinicSlot(daysOffset: number): Date {
  // Tue-Sat (2-6), 10am-7pm, weighted towards lunch & evening
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  d.setHours(0, 0, 0, 0);
  // skip Sun(0)/Mon(1)
  const dow = d.getDay();
  if (dow === 0) d.setDate(d.getDate() + 2);
  if (dow === 1) d.setDate(d.getDate() + 1);
  const hours = [10, 11, 12, 12, 13, 14, 15, 16, 17, 17, 18, 18];
  const h = rand(hours);
  const m = rand([0, 0, 30]);
  d.setHours(h, m, 0, 0);
  return d;
}

export function seedAppointments(
  customers: Customer[],
  practitioners: Practitioner[],
): Appointment[] {
  const list: Appointment[] = [];
  const used = new Set<string>();
  const pracPick = (): Practitioner => {
    const r = Math.random();
    if (r < 0.5) return practitioners[0];
    if (r < 0.8) return practitioners[1];
    return practitioners[2];
  };
  let aiTranscriptCount = 0;

  const total = 120;
  for (let i = 0; i < total; i++) {
    const past = i < 40;
    const offset = past ? -randInt(1, 14) : randInt(0, 14);
    let start: Date | null = null;
    let prac: Practitioner | null = null;
    let treatment: Treatment | null = null;
    let dur = 0;
    for (let attempt = 0; attempt < 20; attempt++) {
      const s = pickClinicSlot(offset);
      const t = rand(TREATMENTS);
      const p = pracPick();
      const d = TREATMENT_DURATIONS[t];
      const key = slotKey(p.id, s, d);
      if (!used.has(key)) {
        // also check overlap loosely with same practitioner's existing
        const conflict = list.some(
          (a) =>
            a.practitioner_id === p.id &&
            Math.abs(new Date(a.start_time).getTime() - s.getTime()) < d * 60000,
        );
        if (!conflict) {
          start = s;
          prac = p;
          treatment = t;
          dur = d;
          used.add(key);
          break;
        }
      }
    }
    if (!start || !prac || !treatment) continue;
    const end = new Date(start.getTime() + dur * 60000);
    const cust = rand(customers);
    const source: AppointmentSource = Math.random() < 0.6 ? "ai_booked" : "manual";

    let status: AppointmentStatus;
    if (past) {
      const r = Math.random();
      status = r < 0.82 ? "completed" : r < 0.92 ? "no_show" : "cancelled";
    } else {
      const r = Math.random();
      status = r < 0.78 ? "confirmed" : r < 0.95 ? "pending" : "cancelled";
    }
    const includeTranscript =
      source === "ai_booked" && aiTranscriptCount < 10 && Math.random() < 0.6;
    if (includeTranscript) aiTranscriptCount++;

    const now = Date.now();
    const startMs = start.getTime();
    const reminder_status = {
      t_3day: startMs - now < 3 * 86400000,
      t_1day: startMs - now < 86400000,
      t_2hour: startMs - now < 2 * 3600000,
    };

    list.push({
      id: `apt_${i + 1}`,
      customer_id: cust.id,
      treatment,
      duration_minutes: dur,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      practitioner_id: prac.id,
      room: rand(ROOMS),
      status,
      source,
      notes:
        Math.random() < 0.25
          ? rand([
              "First-time client.",
              "Allergic to lidocaine.",
              "Wants light touch.",
              "Repeat client — usual.",
            ])
          : "",
      price: TREATMENT_PRICES[treatment],
      created_at: new Date(start.getTime() - randInt(2, 14) * 86400000).toISOString(),
      created_by: source === "manual" ? "Sofia" : undefined,
      ai_transcript: includeTranscript ? buildTranscript(cust.name, treatment, start) : undefined,
      reminder_status,
    });
  }
  return list.sort((a, b) => a.start_time.localeCompare(b.start_time));
}
