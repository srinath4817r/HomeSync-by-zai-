"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "./session";

/** Fetch JSON from an API endpoint. Throws Error with server-provided message. */
export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error || `Request failed (${res.status})`);
  return body as T;
}

/** Send a mutation (POST / PATCH / DELETE) with JSON body. Attaches the signed-in user as X-HS-Actor so API activity logs can attribute the action. */
export async function apiSend<T>(
  url: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown
): Promise<T> {
  const actor = useSession.getState().user?.name;
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(actor ? { "X-HS-Actor": actor } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  return data as T;
}

/**
 * Tiny data-fetching hook: fetches on mount / url change, exposes refresh().
 * Pass `null` as url to skip fetching.
 */
export function useResource<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(url));
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef(url);
  urlRef.current = url;

  const refresh = useCallback(async () => {
    const u = urlRef.current;
    if (!u) return;
    try {
      setError(null);
      const d = await apiGet<T>(u);
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!url) {
      setLoading(false);
      return;
    }
    setLoading(true);
    refresh();
  }, [url, refresh]);

  return { data, loading, error, refresh, setData };
}

/** Relative "time ago" label, e.g. "5 min ago", "2 hrs ago". */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs > 1 ? "s" : ""} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

/** Format ISO time as "9:30 AM". */
export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

/** Format ISO date as "Mon, 26 Oct". */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" });
}

/** Format currency amount (INR default). */
export function fmtMoney(amount: number, currency = "INR"): string {
  const symbol = currency === "INR" ? "₹" : currency === "USD" ? "$" : currency === "EUR" ? "€" : `${currency} `;
  return `${symbol}${amount.toLocaleString("en-IN")}`;
}
