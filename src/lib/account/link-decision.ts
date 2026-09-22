/**
 * Deciding which client record a newly signed-in Google account belongs to.
 *
 * Pure, and deliberately its own file: this is the single most security-sensitive rule in the
 * portal. Getting it wrong hands one person another person's appointment history, birthday and
 * treatment-area photos, so it is unit-tested on its own rather than buried in a route.
 */

export interface MatchCandidate {
  id: string;
  /** Whether this record already has visits on file — i.e. whether there is anything to lose. */
  hasHistory: boolean;
}

export type LinkDecision =
  /** Attach the account to this record now. */
  | { action: "link"; clientId: string }
  /** The record holds history, so prove ownership before attaching. */
  | { action: "verify"; clientId: string }
  /** No record matched: this is a new client, create one from the Google profile. */
  | { action: "create" }
  /** Several records share this email; linking to any of them would be a guess. */
  | { action: "ambiguous" };

/**
 * A verified email is proof that someone controls that address — not proof of who they are. Staff
 * mistype addresses, and families share them, so an email match alone is enough to create a record
 * but not always enough to claim one:
 *
 * - no match          → create a fresh record; there is nothing to expose
 * - one match, empty  → link; an untouched record holds nothing worth protecting
 * - one match, history→ verify a detail on file first (phone digits or birthday)
 * - several matches   → refuse, and send them to the clinic; a guess here is unforgivable
 */
export function decideAccountLink(candidates: MatchCandidate[]): LinkDecision {
  if (candidates.length === 0) return { action: "create" };
  if (candidates.length > 1) return { action: "ambiguous" };

  const [only] = candidates;
  return only.hasHistory
    ? { action: "verify", clientId: only.id }
    : { action: "link", clientId: only.id };
}

/** Last four digits of a phone number, ignoring spaces, dashes and country-code formatting. */
export function lastFourDigits(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}

export type OwnershipProof = { phoneLast4?: string; birthday?: string };

/**
 * Whether the person proved they are the client on file. Either detail is enough on its own — the
 * point is that they know something the record holds, not that they know everything.
 *
 * Comparison is done on normalised digits and on the stored birthday string, and an empty proof
 * never passes, so a record with no phone and no birthday on file simply cannot be claimed this
 * way (staff link it instead).
 */
export function provesOwnership(
  onFile: { phone: string | null; birthday: string | null },
  proof: OwnershipProof,
): boolean {
  const expectedLast4 = lastFourDigits(onFile.phone);
  const givenLast4 = (proof.phoneLast4 ?? "").replace(/\D/g, "");
  if (expectedLast4 && givenLast4 && givenLast4 === expectedLast4) return true;

  const expectedBirthday = (onFile.birthday ?? "").trim();
  const givenBirthday = (proof.birthday ?? "").trim();
  if (expectedBirthday && givenBirthday && givenBirthday === expectedBirthday) return true;

  return false;
}
