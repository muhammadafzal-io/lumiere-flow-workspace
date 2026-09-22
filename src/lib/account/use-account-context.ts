"use client";

import { createContext, useContext } from "react";

/**
 * Who's signed in, made available to any page inside AccountShell without a second fetch —
 * AccountShell already loads this once (via /api/account/me) to decide whether to render the shell
 * at all, so every page underneath it can reuse that same result instead of asking again.
 */
export interface AccountIdentity {
  name: string;
  firstName: string;
  email: string | null;
}

export const AccountContext = createContext<AccountIdentity | null>(null);

export function useAccountIdentity(): AccountIdentity | null {
  return useContext(AccountContext);
}
