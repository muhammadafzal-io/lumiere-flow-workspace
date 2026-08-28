/**
 * Pure validation for a main service's add-on-service selection (Settings → Services → "Add-On
 * Services"). No I/O — the caller (the settings/services API route) is responsible for confirming
 * each serviceId actually exists; this only enforces the two structural rules that don't need a
 * database round-trip: no duplicates, and a service can't be its own add-on.
 */
export function validateAddonLinkSelection(
  mainServiceId: string | null | undefined,
  selectedServiceIds: string[],
): string | null {
  const seen = new Set<string>();
  for (const id of selectedServiceIds) {
    if (!id || typeof id !== "string") {
      return "Each add-on selection needs a valid service id";
    }
    if (mainServiceId && id === mainServiceId) {
      return "A service cannot be its own add-on";
    }
    if (seen.has(id)) {
      return "Duplicate add-on selection is not allowed";
    }
    seen.add(id);
  }
  return null;
}
