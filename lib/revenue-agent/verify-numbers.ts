// Anti-hallucination check on the agent's prose: every number it writes must
// appear (up to display rounding) in what the tools returned, what the tools
// were asked, or what the user typed. Pure functions — no I/O.

const MONTHS = "janv|févr|fevr|mars|avr|mai|juin|juil|août|aout|sept|oct|nov|déc|dec"

// Tokens that are not quantities: dates, versions, durations, ordinals.
const NOT_A_QUANTITY = [
  /\d{4}-\d{2}-\d{2}/g, // ISO dates
  /(?<![\d,.])\d{1,2}\/\d{1,2}(?:\/\d{2,4})?(?![\d,.])/g, // 27/07, 27/07/2026 (not prices 13,99/79,99)
  /\b\d+\.\d+\.\d+\b/g, // versions 0.1.9
  new RegExp(`\\b\\d{1,2}(?:er)?(?:\\s*[-–au]+\\s*\\d{1,2}(?:er)?)?\\s+(?:${MONTHS})[a-zéû]*\\.?(?:\\s+\\d{4})?`, "gi"), // 1er-7 mars 2026
  /\b\d+\s*(?:jours?|j|semaines?|sem\.?|mois|ans?|h|min)\b/gi, // windows / durations
  /\b(?:S|M|J)\+?\d+\b/g, // S+1, M1, J+7
  /\b20\d{2}\b/g, // years
]

const NUMBER = /\d{1,3}(?:[   ]\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?/g

/** Numbers the answer claims, as written (French formatting tolerated). */
export function extractClaimedNumbers(text: string): Array<{ raw: string; value: number; decimals: number }> {
  let cleaned = text
  for (const pattern of NOT_A_QUANTITY) cleaned = cleaned.replace(pattern, " ")
  return [...cleaned.matchAll(NUMBER)].map((m) => {
    const normalized = m[0].replace(/[   ]/g, "").replace(",", ".")
    const decimals = normalized.includes(".") ? normalized.split(".")[1].length : 0
    return { raw: m[0], value: Number(normalized), decimals }
  })
}

/** Every number found in a blob of evidence (tool JSON, tool inputs, user text). */
export function collectEvidenceNumbers(evidence: string, into: Set<number>): void {
  for (const m of evidence.matchAll(/\d+(?:[.,]\d+)?/g)) into.add(Number(m[0].replace(",", ".")))
}

const roundTo = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d

/**
 * Claimed numbers with no match in the evidence. A claim matches if some
 * evidence value rounds to it at the claim's precision (1 166,1 ← 1166.1;
 * 5,7 ← 5.68; 1 167 ← 1166.6). Integers ≤ 12 are skipped: too ambiguous
 * ("2 groupes", "3 fois") to be worth a false alarm.
 */
export function findUnverifiedNumbers(answer: string, evidence: Set<number>): string[] {
  const values = [...evidence].map(Math.abs)
  const unverified = new Set<string>()
  for (const claim of extractClaimedNumbers(answer)) {
    if (claim.decimals === 0 && claim.value <= 12) continue
    const ok = values.some((v) => roundTo(v, claim.decimals) === claim.value)
    if (!ok) unverified.add(claim.raw.trim())
  }
  return [...unverified]
}
