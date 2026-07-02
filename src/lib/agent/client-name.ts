/** True when name has at least first + last (two words, 2+ letters each). */
export function isFullName(name: string): boolean {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed) return false;
  const parts = trimmed.split(" ").filter(Boolean);
  if (parts.length < 2) return false;
  return parts.every((part) => part.replace(/[^a-zA-Z'-]/g, "").length >= 2);
}

export function fullNameValidationError(fieldLabel = "name"): string {
  return `Please collect the client's full name (first and last). ${fieldLabel} must include at least two name parts before continuing — e.g. "Sarah Johnson", not just "Sarah".`;
}
