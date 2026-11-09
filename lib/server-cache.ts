import "server-only"
import { createHash } from "node:crypto"
import { promisify } from "node:util"
import { gunzip, gzip } from "node:zlib"
import { NextResponse, type NextRequest } from "next/server"
import { toDayKey } from "./analytics"
import { getCacheBucket } from "./firebase-admin"

// Server-side cache of API results, shared by every admin. It exists to cut
// costs: most pages re-read thousands of Firestore documents (or re-run LLM
// calls) to show numbers that barely move within a day.
//
// - Validity: an entry serves until midnight Europe/Paris of the day it was
//   computed. "Reload All" sends ?fresh=1, which recomputes and replaces it.
// - Layers: process memory first, then a private Cloud Storage bucket
//   (CACHE_BUCKET) that survives the instance stopping (0 instances when idle).
// - Entries are namespaced by Cloud Run revision: after a deploy, results are
//   recomputed by the new code instead of being served from the old one.
// - Off under `next dev`, where edits to query code must show up immediately.
//
// The Overview stays live: its routes don't go through this module, except the
// retention curve once its activity window is over (app/api/retention).

export type CacheStatus = "HIT" | "MISS" | "BYPASS" | "OFF"

interface Entry {
  body: string // serialized JSON
  cachedAt: number // epoch ms, taken when the computation started
}

interface CacheResult extends Entry {
  status: CacheStatus
}

interface Computed {
  body: string
  keep: boolean // false: serve this result once without caching it
}

const ENABLED = process.env.NODE_ENV !== "development"
const VERSION = process.env.K_REVISION ?? "local"

const gzipAsync = promisify(gzip)
const gunzipAsync = promisify(gunzip)

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))
const isCurrent = (entry: Entry) => toDayKey(new Date(entry.cachedAt)) === toDayKey(new Date())

// ---- Memory layer: LRU (a Map iterates in insertion order) under a budget ----

const MEMORY_BUDGET = 64 * 1024 * 1024 // characters of JSON
const memory = new Map<string, Entry>()
let memoryUsed = 0

function forget(name: string) {
  const entry = memory.get(name)
  if (!entry) return
  memory.delete(name)
  memoryUsed -= entry.body.length
}

function memoryGet(name: string): Entry | undefined {
  const entry = memory.get(name)
  if (!entry) return undefined
  forget(name)
  if (!isCurrent(entry)) return undefined
  memory.set(name, entry) // re-inserted as the most recently used
  memoryUsed += entry.body.length
  return entry
}

function memorySet(name: string, entry: Entry) {
  forget(name)
  // A single huge entry would evict everything else: keep it in the bucket only.
  if (entry.body.length > MEMORY_BUDGET / 4) return
  memory.set(name, entry)
  memoryUsed += entry.body.length
  for (const oldest of memory.keys()) {
    if (memoryUsed <= MEMORY_BUDGET) break
    forget(oldest)
  }
}

// ---- Bucket layer: one gzipped object per entry, `{"cachedAt":…}\n<body>` ----
// Failures are logged and swallowed: the cache must never break a request.

async function bucketGet(name: string): Promise<Entry | undefined> {
  try {
    const bucket = getCacheBucket()
    if (!bucket) return undefined
    const [compressed] = await bucket.file(name).download()
    const text = (await gunzipAsync(compressed)).toString("utf8")
    const newline = text.indexOf("\n")
    const { cachedAt } = JSON.parse(text.slice(0, newline)) as { cachedAt: number }
    return { cachedAt, body: text.slice(newline + 1) }
  } catch (error) {
    // 404: never computed, or already deleted by the bucket's lifecycle rule.
    if ((error as { code?: unknown }).code !== 404) {
      console.warn(`[cache] read failed for ${name}:`, errorMessage(error))
    }
    return undefined
  }
}

async function bucketSet(name: string, entry: Entry) {
  try {
    const bucket = getCacheBucket()
    if (!bucket) return
    const data = await gzipAsync(`${JSON.stringify({ cachedAt: entry.cachedAt })}\n${entry.body}`)
    await bucket.file(name).save(data, { resumable: false, contentType: "application/gzip" })
  } catch (error) {
    // The response is still served; the next cold start just recomputes it.
    console.warn(`[cache] write failed for ${name}:`, errorMessage(error))
  }
}

// ---- Core ----

const inFlight = new Map<string, Promise<CacheResult>>()

// A forced refresh can finish before a lookup or computation that started
// earlier: the older result must not replace it.
const isSuperseded = (name: string, entry: Entry) => (memory.get(name)?.cachedAt ?? 0) > entry.cachedAt

function objectName(scope: string, key: unknown): string {
  const hash = createHash("sha256").update(JSON.stringify(key ?? null)).digest("hex").slice(0, 32)
  return `${VERSION}/${scope}/${hash}.json.gz`
}

async function getOrCompute(
  scope: string,
  key: unknown,
  fresh: boolean,
  compute: () => Promise<Computed>,
): Promise<CacheResult> {
  if (!ENABLED) return { body: (await compute()).body, cachedAt: Date.now(), status: "OFF" }

  const name = objectName(scope, key)
  if (!fresh) {
    const hit = memoryGet(name)
    if (hit) return { ...hit, status: "HIT" }
  }

  // Concurrent requests for the same entry share one bucket read and one
  // computation. A forced refresh never joins a plain lookup, which could
  // answer with the very entry it is meant to replace.
  const flightKey = fresh ? `${name}#fresh` : name
  let flight = inFlight.get(flightKey)
  if (!flight) {
    flight = (async (): Promise<CacheResult> => {
      if (!fresh) {
        const stored = await bucketGet(name)
        if (stored && isCurrent(stored)) {
          if (!isSuperseded(name, stored)) memorySet(name, stored)
          console.log(`[cache] restored ${scope} from the bucket`)
          return { ...stored, status: "HIT" }
        }
      }
      const cachedAt = Date.now()
      const { body, keep: cacheable } = await compute()
      const entry: Entry = { body, cachedAt }
      const kept = cacheable && !isSuperseded(name, entry)
      if (kept) {
        memorySet(name, entry)
        await bucketSet(name, entry)
      }
      const outcome = kept ? "" : cacheable ? " (a newer refresh is kept)" : " (partial result, not cached)"
      console.log(`[cache] ${fresh ? "refreshed" : "computed"} ${scope} in ${Date.now() - cachedAt} ms${outcome}`)
      return { ...entry, status: fresh ? "BYPASS" : "MISS" }
    })().finally(() => inFlight.delete(flightKey))
    inFlight.set(flightKey, flight)
  }
  return flight
}

/** True when the caller asked to skip the cache (`?fresh=1`, sent by "Reload All"). */
export function wantsFresh(request: NextRequest): boolean {
  return request.nextUrl.searchParams.get("fresh") === "1"
}

/**
 * Route-handler response for `compute()`, served from the cache while today's
 * entry exists. `key` identifies the result (the parsed parameters, built in a
 * stable order); `compute` must throw on failure, so errors are never cached.
 * `cacheIf` keeps a degraded result (e.g. a section that failed to load) from
 * being served all day: it is returned once, then recomputed.
 */
export async function cachedJson<T>(
  request: NextRequest,
  scope: string,
  key: unknown,
  compute: () => Promise<T>,
  options: { cacheIf?: (value: T) => boolean } = {},
): Promise<NextResponse> {
  const result = await getOrCompute(scope, key, wantsFresh(request), async () => {
    const value = await compute()
    return { body: JSON.stringify(value), keep: options.cacheIf?.(value) ?? true }
  })
  return new NextResponse(result.body, {
    headers: {
      "Content-Type": "application/json",
      // This cache is the only copy: browsers must ask every time, otherwise
      // "Reload All" could be answered from their own HTTP cache.
      "Cache-Control": "private, no-store",
      "X-Cache": result.status,
      "X-Cache-Date": new Date(result.cachedAt).toISOString(),
    },
  })
}

/**
 * Cached result of `compute()` for server code (LLM corpora, agent tools,
 * reports). The value goes through JSON on every path, hit or miss, so `T` must
 * be plain JSON (no Date, Map or Firestore Timestamp). `fresh` and `cacheIf`
 * work as in `cachedJson`.
 */
export async function cachedValue<T>(
  scope: string,
  key: unknown,
  compute: () => Promise<T>,
  options: { fresh?: boolean; cacheIf?: (value: T) => boolean } = {},
): Promise<{ value: T; cachedAt: Date; status: CacheStatus }> {
  const result = await getOrCompute(scope, key, options.fresh ?? false, async () => {
    const value = await compute()
    return { body: JSON.stringify(value), keep: options.cacheIf?.(value) ?? true }
  })
  return { value: JSON.parse(result.body) as T, cachedAt: new Date(result.cachedAt), status: result.status }
}
