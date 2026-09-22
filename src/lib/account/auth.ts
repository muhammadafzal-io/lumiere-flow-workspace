import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-auth/server";
import { getSupabase } from "@/lib/supabase";
import { mapCustomerRow } from "@/lib/customers/map-row";
import type { Customer } from "@/lib/types";
import {
  decideAccountLink,
  provesOwnership,
  type OwnershipProof,
} from "@/lib/account/link-decision";

/**
 * Who the portal is talking to.
 *
 * Every customer-facing endpoint resolves the session to exactly one Clients row here and scopes
 * its queries to THAT id — never an id from the URL or body. Ownership is therefore decided in one
 * place instead of being re-checked correctly in a dozen.
 *
 * Staff endpoints are unaffected and already safe against a customer session: an auth user with no
 * Users row holds zero permissions, so requireApiPermission refuses it.
 */

const CLIENTS = "Clients";

export interface AccountSession {
  authUserId: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
}

export type CustomerCheck =
  | { ok: true; session: AccountSession; customer: Customer }
  | { ok: false; response: NextResponse };

/** The signed-in Google account, or null. */
export async function getAccountSession(): Promise<AccountSession | null> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  return {
    authUserId: user.id,
    email: user.email ?? null,
    name: (meta.full_name as string) ?? (meta.name as string) ?? null,
    avatarUrl: (meta.avatar_url as string) ?? (meta.picture as string) ?? null,
  };
}

export async function findClientByAuthUser(authUserId: string): Promise<Customer | null> {
  const { data, error } = await getSupabase()
    .from(CLIENTS)
    .select("*")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (error) throw new Error(`findClientByAuthUser: ${error.message}`);
  return data ? mapCustomerRow(data) : null;
}

/**
 * Use at the top of every portal route:
 *   const check = await requireCustomer();
 *   if (!check.ok) return check.response;
 *
 * 401 means "sign in", 409 means "signed in but no client record is linked yet" — distinct so the
 * page can send the second case to the account-linking step rather than back to the login screen.
 */
export async function requireCustomer(): Promise<CustomerCheck> {
  const session = await getAccountSession();
  if (!session) {
    return { ok: false, response: NextResponse.json({ error: "Not signed in." }, { status: 401 }) };
  }

  const customer = await findClientByAuthUser(session.authUserId);
  if (!customer) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "No linked profile.", code: "NOT_LINKED" },
        { status: 409 },
      ),
    };
  }

  return { ok: true, session, customer };
}

/** Client records carrying this email, with whether each already holds visit history. */
async function matchesForEmail(email: string) {
  const { data, error } = await getSupabase()
    .from(CLIENTS)
    .select("*")
    .ilike("Email", email.trim())
    .is("auth_user_id", null);
  if (error) throw new Error(`matchesForEmail: ${error.message}`);

  return (data ?? []).map((row) => {
    const customer = mapCustomerRow(row);
    return {
      row,
      customer,
      candidate: {
        id: customer.id,
        // "Anything to lose": a visit on file, or a last-visit date from before this app.
        hasHistory: customer.total_visits > 0 || !!customer.last_visit,
      },
    };
  });
}

export type LinkOutcome =
  | { status: "linked"; customer: Customer }
  | {
      status: "needs_verification";
      clientId: string;
      hint: { phoneLast4: boolean; birthday: boolean };
    }
  | { status: "ambiguous" };

/**
 * Attaches the signed-in account to a client record, creating one when this is a new client.
 * Applies the rule in link-decision.ts, which is where the reasoning lives.
 */
export async function linkAccount(session: AccountSession): Promise<LinkOutcome> {
  const existing = await findClientByAuthUser(session.authUserId);
  if (existing) return { status: "linked", customer: existing };

  const email = session.email?.trim();
  if (!email) return { status: "ambiguous" };

  const matches = await matchesForEmail(email);
  const decision = decideAccountLink(matches.map((m) => m.candidate));

  if (decision.action === "ambiguous") return { status: "ambiguous" };

  if (decision.action === "create") {
    const { data, error } = await getSupabase()
      .from(CLIENTS)
      .insert({
        Name: session.name || email.split("@")[0],
        Email: email,
        Status: "Active",
        auth_user_id: session.authUserId,
      })
      .select("*")
      .single();
    if (error) throw new Error(`linkAccount create: ${error.message}`);
    return { status: "linked", customer: mapCustomerRow(data) };
  }

  if (decision.action === "verify") {
    const match = matches.find((m) => m.candidate.id === decision.clientId)!;
    return {
      status: "needs_verification",
      clientId: decision.clientId,
      // Tells the page which question it can ask — never the values themselves.
      hint: {
        phoneLast4: !!match.customer.phone,
        birthday: !!match.customer.birthday,
      },
    };
  }

  return { status: "linked", customer: await attachToClient(decision.clientId, session) };
}

/** Completes a claim on a record that holds history, once the person proved a detail on file. */
export async function verifyAndLink(
  session: AccountSession,
  clientId: string,
  proof: OwnershipProof,
): Promise<{ ok: true; customer: Customer } | { ok: false; error: string }> {
  const { data, error } = await getSupabase()
    .from(CLIENTS)
    .select("*")
    .eq("id", clientId)
    .is("auth_user_id", null)
    .maybeSingle();
  if (error) throw new Error(`verifyAndLink: ${error.message}`);
  if (!data) return { ok: false, error: "That profile is no longer available to claim." };

  const customer = mapCustomerRow(data);
  // The email must still match the signed-in account: the client id alone is never enough, or a
  // guessed id plus a guessed birthday would be a way in.
  if ((customer.email ?? "").trim().toLowerCase() !== (session.email ?? "").trim().toLowerCase()) {
    return { ok: false, error: "That profile is no longer available to claim." };
  }

  if (!provesOwnership({ phone: customer.phone, birthday: customer.birthday }, proof)) {
    return { ok: false, error: "That didn't match what we have on file." };
  }

  return { ok: true, customer: await attachToClient(clientId, session) };
}

/** Writes the link, refusing if another account claimed the record in the meantime. */
async function attachToClient(clientId: string, session: AccountSession): Promise<Customer> {
  const { data, error } = await getSupabase()
    .from(CLIENTS)
    .update({ auth_user_id: session.authUserId })
    .eq("id", clientId)
    .is("auth_user_id", null)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`attachToClient: ${error.message}`);
  if (!data) throw new Error("That profile was just claimed by another account.");
  return mapCustomerRow(data);
}
