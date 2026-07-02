export type RetentionFlowKey = "birthday" | "reminders" | "noshow" | "reactivation" | "followup";

export interface AudienceFilters {
  q?: string;
  status?: string[];
  treatment?: string[];
  visit_min?: number;
  visit_max?: number;
  last_visit?: "30" | "30-90" | "90" | "any";
  has_email?: boolean;
  has_contact?: boolean;
  birthday_days_ahead?: number;
  credit_not_sent?: boolean;
  dormant_days?: number;
  reactivation_step?: number[];
  noshow_date?: string;
  reminder_window?: "T-72h" | "T-24h" | "T-2h" | "any";
  /** Min days after appointment ended before follow-up (default 1) */
  followup_min_days?: number;
  /** Max days after appointment ended to include (default 14) */
  followup_max_days?: number;
  /** Exclude appointments that already received a follow-up email */
  followup_not_sent?: boolean;
}

export interface AudienceRow {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  status?: string;
  visits?: number;
  lastVisit?: string;
  treatment?: string;
  detail?: string;
}

export interface AudienceResult {
  flow: RetentionFlowKey;
  total: number;
  eligible: number;
  rows: AudienceRow[];
  activeFilterCount: number;
}

export type FilterFieldType = "typeahead" | "multiselect" | "select" | "number" | "date";

export interface FilterFieldDef {
  key: keyof AudienceFilters | string;
  label: string;
  type: FilterFieldType;
  placeholder?: string;
  suggestField?: "status" | "treatment" | "visit_range";
  options?: { label: string; value: string }[];
  flowOnly?: RetentionFlowKey;
}

export const SHARED_FILTER_FIELDS: FilterFieldDef[] = [
  {
    key: "status",
    label: "Status",
    type: "typeahead",
    suggestField: "status",
    placeholder: "Type status…",
  },
  {
    key: "treatment",
    label: "Treatment",
    type: "typeahead",
    suggestField: "treatment",
    placeholder: "Type treatment…",
  },
  {
    key: "visit_min",
    label: "Min visits",
    type: "number",
    placeholder: "e.g. 5",
  },
  {
    key: "visit_max",
    label: "Max visits",
    type: "number",
    placeholder: "e.g. 20",
  },
  {
    key: "last_visit",
    label: "Last visit",
    type: "select",
    options: [
      { label: "Any time", value: "any" },
      { label: "Within 30 days", value: "30" },
      { label: "30–90 days ago", value: "30-90" },
      { label: "90+ days ago", value: "90" },
    ],
  },
  {
    key: "has_email",
    label: "Has email",
    type: "select",
    options: [
      { label: "Any", value: "any" },
      { label: "Yes", value: "yes" },
      { label: "No", value: "no" },
    ],
  },
  {
    key: "has_contact",
    label: "Has contact",
    type: "select",
    options: [
      { label: "Any", value: "any" },
      { label: "Yes", value: "yes" },
      { label: "No", value: "no" },
    ],
  },
];

export const FLOW_FILTER_FIELDS: FilterFieldDef[] = [
  {
    key: "birthday_days_ahead",
    label: "Birthday within (days)",
    type: "number",
    placeholder: "7",
    flowOnly: "birthday",
  },
  {
    key: "credit_not_sent",
    label: "Birthday credit",
    type: "select",
    flowOnly: "birthday",
    options: [
      { label: "Not sent yet", value: "yes" },
      { label: "Any", value: "any" },
    ],
  },
  {
    key: "reminder_window",
    label: "Reminder window",
    type: "select",
    flowOnly: "reminders",
    options: [
      { label: "Any window", value: "any" },
      { label: "T-72h (3 days)", value: "T-72h" },
      { label: "T-24h (tomorrow)", value: "T-24h" },
      { label: "T-2h (2 hours)", value: "T-2h" },
    ],
  },
  {
    key: "noshow_date",
    label: "No-show date",
    type: "date",
    flowOnly: "noshow",
  },
  {
    key: "dormant_days",
    label: "Dormant for (days)",
    type: "number",
    placeholder: "90",
    flowOnly: "reactivation",
  },
  {
    key: "reactivation_step",
    label: "Reactivation step",
    type: "select",
    flowOnly: "reactivation",
    options: [
      { label: "Any", value: "any" },
      { label: "Step 0 (new)", value: "0" },
      { label: "Step 1", value: "1" },
      { label: "Step 2", value: "2" },
      { label: "Step 3", value: "3" },
    ],
  },
  {
    key: "followup_min_days",
    label: "Min days after treatment",
    type: "number",
    placeholder: "1",
    flowOnly: "followup",
  },
  {
    key: "followup_max_days",
    label: "Max days after treatment",
    type: "number",
    placeholder: "14",
    flowOnly: "followup",
  },
  {
    key: "followup_not_sent",
    label: "Follow-up status",
    type: "select",
    flowOnly: "followup",
    options: [
      { label: "Not sent yet", value: "yes" },
      { label: "Any (include sent)", value: "any" },
    ],
  },
];

export function filtersForFlow(flow: RetentionFlowKey): FilterFieldDef[] {
  const flowSpecific = FLOW_FILTER_FIELDS.filter((f) => f.flowOnly === flow);
  return [...flowSpecific, ...SHARED_FILTER_FIELDS];
}

export function defaultFiltersForFlow(flow: RetentionFlowKey): AudienceFilters {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  switch (flow) {
    case "birthday":
      return { birthday_days_ahead: 7, credit_not_sent: true, has_contact: true };
    case "reminders":
      return { reminder_window: "any", has_contact: true };
    case "noshow":
      return { noshow_date: today, status: ["no-show"], has_contact: true };
    case "reactivation":
      return { dormant_days: 90, has_contact: true };
    case "followup":
      return {
        followup_min_days: 1,
        followup_max_days: 14,
        followup_not_sent: true,
        has_email: true,
      };
  }
}

export function parseFiltersFromSearchParams(
  flow: RetentionFlowKey,
  params: URLSearchParams,
): AudienceFilters {
  const defaults = defaultFiltersForFlow(flow);
  const status = params.getAll("status").filter(Boolean);
  const treatment = params.getAll("treatment").filter(Boolean);
  const reactivation_step = params
    .getAll("reactivation_step")
    .map(Number)
    .filter((n) => !isNaN(n));

  const hasEmail = params.get("has_email");
  const hasContact = params.get("has_contact");

  return {
    ...defaults,
    q: params.get("q") ?? undefined,
    status: status.length ? status : defaults.status,
    treatment: treatment.length ? treatment : defaults.treatment,
    visit_min: params.has("visit_min")
      ? Math.max(1, Number(params.get("visit_min")))
      : defaults.visit_min,
    visit_max: params.has("visit_max") ? Number(params.get("visit_max")) : defaults.visit_max,
    last_visit: (params.get("last_visit") as AudienceFilters["last_visit"]) ?? defaults.last_visit,
    has_email:
      hasEmail === "yes" ? true : hasEmail === "no" ? false : (defaults.has_email ?? undefined),
    has_contact:
      hasContact === "yes"
        ? true
        : hasContact === "no"
          ? false
          : (defaults.has_contact ?? undefined),
    birthday_days_ahead: params.has("birthday_days_ahead")
      ? Number(params.get("birthday_days_ahead"))
      : defaults.birthday_days_ahead,
    credit_not_sent:
      params.get("credit_not_sent") === "yes" || defaults.credit_not_sent === true
        ? true
        : params.get("credit_not_sent") === "any"
          ? false
          : defaults.credit_not_sent,
    dormant_days: params.has("dormant_days")
      ? Number(params.get("dormant_days"))
      : defaults.dormant_days,
    reactivation_step: reactivation_step.length ? reactivation_step : defaults.reactivation_step,
    noshow_date: params.get("noshow_date") ?? defaults.noshow_date,
    reminder_window:
      (params.get("reminder_window") as AudienceFilters["reminder_window"]) ??
      defaults.reminder_window,
    followup_min_days: params.has("followup_min_days")
      ? Number(params.get("followup_min_days"))
      : defaults.followup_min_days,
    followup_max_days: params.has("followup_max_days")
      ? Number(params.get("followup_max_days"))
      : defaults.followup_max_days,
    followup_not_sent:
      params.get("followup_not_sent") === "any"
        ? false
        : params.get("followup_not_sent") === "yes" || defaults.followup_not_sent === true
          ? true
          : defaults.followup_not_sent,
  };
}

export function applyVisitRangePreset(filters: AudienceFilters, preset: string): AudienceFilters {
  if (preset.startsWith("1-4")) return { ...filters, visit_min: 1, visit_max: 4 };
  if (preset.startsWith("5-9")) return { ...filters, visit_min: 5, visit_max: 9 };
  if (preset.startsWith("10-14")) return { ...filters, visit_min: 10, visit_max: 14 };
  if (preset.includes("15+")) return { ...filters, visit_min: 15, visit_max: undefined };
  return filters;
}

export function countActiveFilters(filters: AudienceFilters, flow: RetentionFlowKey): number {
  let n = 0;
  if (filters.q?.trim()) n++;
  if (filters.status?.length) n++;
  if (filters.treatment?.length) n++;
  if (filters.visit_min != null) n++;
  if (filters.visit_max != null) n++;
  if (filters.last_visit && filters.last_visit !== "any") n++;
  if (filters.has_email != null) n++;
  if (filters.has_contact != null) n++;
  if (flow === "birthday") {
    if (filters.birthday_days_ahead != null && filters.birthday_days_ahead !== 7) n++;
    if (filters.credit_not_sent) n++;
  }
  if (flow === "reminders" && filters.reminder_window && filters.reminder_window !== "any") n++;
  if (flow === "noshow" && filters.noshow_date) n++;
  if (flow === "reactivation") {
    if (filters.dormant_days != null && filters.dormant_days !== 90) n++;
    if (filters.reactivation_step?.length) n++;
  }
  if (flow === "followup") {
    if (filters.followup_min_days != null && filters.followup_min_days !== 1) n++;
    if (filters.followup_max_days != null && filters.followup_max_days !== 14) n++;
    if (filters.followup_not_sent) n++;
  }
  return n;
}
