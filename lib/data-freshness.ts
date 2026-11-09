"use client"

import { useSyncExternalStore } from "react"
import { usePathname } from "next/navigation"

// Browser side of the server cache (lib/server-cache.ts), tracked per page
// while the admin stays on it (components/dashboard/page-cache-scope.tsx drops
// it on navigation):
// - which requests the page already got an answer for: a reload button asks
//   the server to recompute those (?fresh=1), while data the page never
//   loaded (first load of a manual-load section) still comes from the cache;
// - when the cached answers on display were computed, for the header.

interface PageState {
  answered: Set<string> // requests (path + query, without `fresh`)
  cachedAt: Map<string, number> // API route → computation date of its latest answer, if cached
  oldestCachedAt: Date | null // stable snapshot for useSyncExternalStore
}

const pages = new Map<string, PageState>()
const listeners = new Set<() => void>()
let reloading = 0

const notify = () => listeners.forEach((listener) => listener())

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Records how the server cache answered `request` (to `route`) for the page at
 * `pathname`. Answers without cache headers (live Overview data, auth…) are
 * ignored.
 */
export function recordCacheStatus(pathname: string, request: string, route: string, headers: Headers) {
  const status = headers.get("X-Cache")
  if (!status) return
  let page = pages.get(pathname)
  if (!page) {
    page = { answered: new Set(), cachedAt: new Map(), oldestCachedAt: null }
    pages.set(pathname, page)
  }
  page.answered.add(request)

  // The latest answer of each route is the one on display.
  const cachedAt = Date.parse(headers.get("X-Cache-Date") ?? "")
  if (status === "HIT" && !Number.isNaN(cachedAt)) page.cachedAt.set(route, cachedAt)
  else page.cachedAt.delete(route)

  const oldest = page.cachedAt.size ? Math.min(...page.cachedAt.values()) : null
  if ((page.oldestCachedAt?.getTime() ?? null) === oldest) return
  page.oldestCachedAt = oldest === null ? null : new Date(oldest)
  notify()
}

/** Forgets a page the admin left: back on it, its first loads use the cache again. */
export function forgetPage(pathname: string) {
  if (pages.delete(pathname)) notify()
}

/** Whether `request` must skip the server cache: re-sent by a reload button, for data already shown. */
export function shouldForceFresh(pathname: string, request: string): boolean {
  return reloading > 0 && (pages.get(pathname)?.answered.has(request) ?? false)
}

/**
 * Runs a reload button's handler. Requests it starts synchronously, which is
 * how TanStack Query's refetch() calls query functions, are flagged; they are
 * then recomputed if the page already showed their data.
 */
export async function runReload(reload?: () => unknown): Promise<void> {
  if (!reload) return
  let pending: unknown
  reloading++
  try {
    pending = reload()
  } finally {
    reloading--
  }
  await pending
}

/** Computation date of the oldest cached data on the current page, if any. */
export function usePageCacheDate(): Date | null {
  const pathname = usePathname()
  return useSyncExternalStore(
    subscribe,
    () => pages.get(pathname)?.oldestCachedAt ?? null,
    () => null,
  )
}
