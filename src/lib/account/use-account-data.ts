"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface UseAccountDataResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Fetches one of the customer's own /api/account/* endpoints and keeps it current.
 *
 * This is personal data — appointments, offers, profile details — that can change from a staff
 * action, an automated flow, or the client's own action in another tab, so a stale response is a
 * wrong one. `cache: "no-store"` stops the browser serving a cached copy, and the request repeats
 * automatically whenever the tab regains focus or becomes visible again, the same "revalidate on
 * focus" convention data-fetching libraries default to — without needing to add one as a
 * dependency for what is otherwise a handful of plain fetch calls.
 *
 * The loading flag is only ever true for the first load: a focus-triggered background refresh
 * updates the data in place rather than flashing a spinner over content the client is looking at.
 */
export function useAccountData<T>(url: string): UseAccountDataResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadedOnce = useRef(false);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    // A focus event firing while a load is already in flight (fast alt-tabbing) should not queue
    // a second overlapping request.
    if (inFlight.current) return;
    inFlight.current = true;
    if (!loadedOnce.current) setLoading(true);
    setError(null);
    try {
      const res = await fetch(url, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "We couldn't load that.");
      setData(json);
      loadedOnce.current = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't load that.");
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    void load();

    const onFocus = () => void load();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load]);

  return { data, loading, error, reload: load };
}
