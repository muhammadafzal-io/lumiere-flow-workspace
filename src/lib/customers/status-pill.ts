const STATUS_PILL_MAP: Record<string, string> = {
  Active: "bg-success/10 text-success border-success/20",
  Dormant: "bg-warning/15 text-warning-foreground border-warning/30",
  VIP: "bg-primary/10 text-primary border-primary/20",
  New: "bg-info/10 text-info border-info/20",
  "No-show": "bg-destructive/10 text-destructive border-destructive/20",
  Discard: "bg-muted text-muted-foreground border-border",
};

export function statusPillClass(status: string): string {
  return `inline-flex px-2 py-0.5 text-[11px] font-medium rounded-md border ${STATUS_PILL_MAP[status] ?? STATUS_PILL_MAP["Discard"]}`;
}
