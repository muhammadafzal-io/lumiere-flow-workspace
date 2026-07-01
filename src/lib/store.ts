import { useSyncExternalStore } from "react";
import type { Customer, Rule, Activity, Practitioner, Appointment } from "./types";

const KEYS = {
  c: "lumiere.customers",
  r: "lumiere.rules",
  a: "lumiere.activity",
  p: "lumiere.practitioners",
  apt: "lumiere.appointments",
  v: "lumiere.v",
} as const;
const VERSION = "3";

type State = {
  customers: Customer[];
  rules: Rule[];
  activity: Activity[];
  practitioners: Practitioner[];
  appointments: Appointment[];
};

const emptyState = (): State => ({
  customers: [],
  rules: [],
  activity: [],
  practitioners: [],
  appointments: [],
});

let state: State = emptyState();
let initialized = false;
const listeners = new Set<() => void>();

function load() {
  if (typeof window === "undefined") return;
  if (initialized) return;
  initialized = true;

  if (localStorage.getItem(KEYS.v) !== VERSION) {
    state = emptyState();
    persist();
    localStorage.setItem(KEYS.v, VERSION);
  } else {
    state = {
      customers: JSON.parse(localStorage.getItem(KEYS.c) || "[]"),
      rules: JSON.parse(localStorage.getItem(KEYS.r) || "[]"),
      activity: JSON.parse(localStorage.getItem(KEYS.a) || "[]"),
      practitioners: JSON.parse(localStorage.getItem(KEYS.p) || "[]"),
      appointments: JSON.parse(localStorage.getItem(KEYS.apt) || "[]"),
    };
  }
  emit();
}

function persist() {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEYS.c, JSON.stringify(state.customers));
  localStorage.setItem(KEYS.r, JSON.stringify(state.rules));
  localStorage.setItem(KEYS.a, JSON.stringify(state.activity));
  localStorage.setItem(KEYS.p, JSON.stringify(state.practitioners));
  localStorage.setItem(KEYS.apt, JSON.stringify(state.appointments));
}

function emit() {
  listeners.forEach((l) => l());
}

export const store = {
  get: () => state,
  subscribe: (l: () => void) => {
    load();
    listeners.add(l);
    return () => listeners.delete(l);
  },
  setRules: (rules: Rule[]) => {
    state = { ...state, rules };
    persist();
    emit();
  },
  upsertRule: (r: Rule) => {
    const i = state.rules.findIndex((x) => x.id === r.id);
    const rules = i >= 0 ? state.rules.map((x) => (x.id === r.id ? r : x)) : [r, ...state.rules];
    store.setRules(rules);
  },
  deleteRule: (id: string) => store.setRules(state.rules.filter((r) => r.id !== id)),
  setCustomers: (customers: Customer[]) => {
    state = { ...state, customers };
    persist();
    emit();
  },
  addCustomer: (c: Customer) => store.setCustomers([c, ...state.customers]),
  setAppointments: (appointments: Appointment[]) => {
    state = { ...state, appointments };
    persist();
    emit();
  },
  upsertAppointment: (a: Appointment) => {
    const i = state.appointments.findIndex((x) => x.id === a.id);
    const appointments =
      i >= 0 ? state.appointments.map((x) => (x.id === a.id ? a : x)) : [a, ...state.appointments];
    store.setAppointments(appointments);
  },
  deleteAppointment: (id: string) =>
    store.setAppointments(state.appointments.filter((a) => a.id !== id)),
  addActivity: (a: Activity) => {
    state = { ...state, activity: [a, ...state.activity] };
    persist();
    emit();
  },
};

export function useStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.get()),
    () => selector(emptyState()),
  );
}
