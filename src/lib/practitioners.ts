import type { Practitioner } from "./types";

export function mapTeamToPractitioners(
  team: Array<{
    id: string;
    name: string;
    role?: string;
    color?: string;
    status?: string;
    qualifications?: string[];
  }>,
): Practitioner[] {
  return team
    .filter((p) => p.status !== "Inactive")
    .map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role ?? "",
      color: p.color ?? "#6366f1",
      avatar_initial: p.name?.charAt(0)?.toUpperCase() ?? "?",
      qualifications: p.qualifications ?? [],
    }));
}
