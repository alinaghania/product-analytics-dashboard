// Server-side App Store Connect API client — read-only, used by the revenue
// agent to date releases and subscription price changes.
// Requires ASC_KEY_ID, ASC_ISSUER_ID, ASC_PRIVATE_KEY (content of the .p8) and
// ASC_APP_ID. Tokens are ES256 JWTs valid ≤ 20 min; we mint one per 10 min.

import "server-only"
import crypto from "node:crypto"

const BASE_URL = "https://api.appstoreconnect.apple.com"

let cachedToken: { jwt: string; expiresAt: number } | null = null

function getToken(): string {
  const keyId = process.env.ASC_KEY_ID
  const issuerId = process.env.ASC_ISSUER_ID
  // Vercel may store the multi-line .p8 with literal "\n" — normalize.
  const privateKey = process.env.ASC_PRIVATE_KEY?.replace(/\\n/g, "\n")
  if (!keyId || !issuerId || !privateKey) {
    throw new Error("App Store Connect not configured: set ASC_KEY_ID, ASC_ISSUER_ID, ASC_PRIVATE_KEY")
  }
  const now = Math.floor(Date.now() / 1000)
  if (cachedToken && cachedToken.expiresAt > now + 60) return cachedToken.jwt

  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url")
  const unsigned = `${b64({ alg: "ES256", kid: keyId, typ: "JWT" })}.${b64({
    iss: issuerId,
    iat: now,
    exp: now + 600,
    aud: "appstoreconnect-v1",
  })}`
  const signature = crypto
    .sign("sha256", Buffer.from(unsigned), { key: privateKey, dsaEncoding: "ieee-p1363" })
    .toString("base64url")
  cachedToken = { jwt: `${unsigned}.${signature}`, expiresAt: now + 600 }
  return cachedToken.jwt
}

// Minimal JSON:API shapes — only the fields we read.
interface JsonApiResource {
  id: string
  type: string
  attributes?: Record<string, any>
  relationships?: Record<string, { data?: { id: string; type: string } | null }>
}
interface JsonApiDoc {
  data?: JsonApiResource[]
  included?: JsonApiResource[]
}

async function ascFetch(path: string): Promise<JsonApiDoc> {
  const response = await fetch(BASE_URL + path, {
    headers: { Authorization: `Bearer ${getToken()}` },
    cache: "no-store",
  })
  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new Error(`App Store Connect ${path.split("?")[0]} → ${response.status}: ${body.slice(0, 200)}`)
  }
  return response.json() as Promise<JsonApiDoc>
}

function appId(): string {
  const id = process.env.ASC_APP_ID
  if (!id) throw new Error("App Store Connect not configured: set ASC_APP_ID")
  return id
}

export interface AscVersion {
  version: string
  state: string
  /** Date the version was created in ASC (≈ submission). */
  createdDate: string
}

export async function fetchAscVersions(limit = 30): Promise<AscVersion[]> {
  const doc = await ascFetch(
    `/v1/apps/${appId()}/appStoreVersions?limit=${limit}&fields[appStoreVersions]=versionString,appStoreState,createdDate`,
  )
  return (doc.data ?? []).map((v) => ({
    version: String(v.attributes?.versionString ?? "?"),
    state: String(v.attributes?.appStoreState ?? "?"),
    createdDate: String(v.attributes?.createdDate ?? "").slice(0, 10),
  }))
}

export interface AscPriceChange {
  productId: string
  period: string
  territory: string
  price: number
  /** null = initial price (no start date). */
  startDate: string | null
}

export interface AscIntroOffer {
  productId: string
  mode: string
  duration: string
  startDate: string | null
}

/**
 * Price schedule of every subscription for the given territories, plus intro
 * offers (free trials). This is the authoritative price history: a price edit
 * in ASC leaves no trace in git nor in RevenueCat.
 */
export async function fetchAscPricing(
  territories = ["FRA", "USA"],
): Promise<{ prices: AscPriceChange[]; introOffers: AscIntroOffer[] }> {
  const groups = await ascFetch(`/v1/apps/${appId()}/subscriptionGroups?include=subscriptions`)
  const subs = (groups.included ?? []).filter((r) => r.type === "subscriptions")

  const perSub = await Promise.all(
    subs.map(async (sub) => {
      const productId = String(sub.attributes?.productId)
      const period = String(sub.attributes?.subscriptionPeriod)
      const [priceDoc, introDoc] = await Promise.all([
        ascFetch(
          `/v1/subscriptions/${sub.id}/prices?filter[territory]=${territories.join(",")}&include=subscriptionPricePoint,territory&limit=200`,
        ),
        ascFetch(`/v1/subscriptions/${sub.id}/introductoryOffers?include=territory&limit=200`),
      ])
      const pricePoints = new Map(
        (priceDoc.included ?? [])
          .filter((r) => r.type === "subscriptionPricePoints")
          .map((r) => [r.id, Number(r.attributes?.customerPrice)]),
      )
      const prices: AscPriceChange[] = (priceDoc.data ?? []).map((p) => ({
        productId,
        period,
        territory: p.relationships?.territory?.data?.id ?? "?",
        price: pricePoints.get(p.relationships?.subscriptionPricePoint?.data?.id ?? "") ?? NaN,
        startDate: p.attributes?.startDate ?? null,
      }))
      // Intro offers are per territory; collapse identical (mode, duration, date).
      const seen = new Set<string>()
      const introOffers: AscIntroOffer[] = []
      for (const o of introDoc.data ?? []) {
        const offer = {
          productId,
          mode: String(o.attributes?.offerMode),
          duration: String(o.attributes?.duration),
          startDate: o.attributes?.startDate ?? null,
        }
        const key = `${offer.mode}|${offer.duration}|${offer.startDate}`
        if (!seen.has(key)) {
          seen.add(key)
          introOffers.push(offer)
        }
      }
      return { prices, introOffers }
    }),
  )

  return {
    prices: perSub.flatMap((s) => s.prices),
    introOffers: perSub.flatMap((s) => s.introOffers),
  }
}

export interface AscReview {
  date: string
  rating: number
  title: string
  body: string
  territory: string
}

/** Most recent App Store reviews (newest first), paginated up to `max`. */
export async function fetchAscReviews(max = 400): Promise<AscReview[]> {
  const reviews: AscReview[] = []
  let path: string | null = `/v1/apps/${appId()}/customerReviews?limit=200&sort=-createdDate`
  while (path && reviews.length < max) {
    const doc = (await ascFetch(path)) as JsonApiDoc & { links?: { next?: string } }
    for (const r of doc.data ?? []) {
      reviews.push({
        date: String(r.attributes?.createdDate ?? "").slice(0, 10),
        rating: Number(r.attributes?.rating),
        title: String(r.attributes?.title ?? ""),
        body: String(r.attributes?.body ?? ""),
        territory: String(r.attributes?.territory ?? ""),
      })
    }
    path = doc.links?.next ? doc.links.next.replace(BASE_URL, "") : null
  }
  // The last page can overshoot `max` (pages hold up to 200 reviews).
  return reviews.slice(0, max)
}
