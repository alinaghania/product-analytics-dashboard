// Deep analysis = deterministic orchestrator (this file, plain code) that:
//   1. builds 5 dossiers in code (dossiers.ts) — all numbers, verdicts, charts;
//   2. runs 5 specialist analysts in parallel (LLM, no tools) that each read
//      ONE dossier and explain it;
//   3. runs a synthesis (LLM) that turns the 5 sections into a diagnosis,
//      a strategy for Endora's stage and prioritized recommendations.
// Every number written by an LLM is checked against the dossiers; one rewrite
// is requested on failure, then leftovers are flagged in the UI.

import "server-only"
import { z } from "zod"
import { callJson } from "@/lib/llm-client"
import type { ChartSpec } from "./chart-spec"
import { DOSSIER_BUILDERS, type Dossier, type DossierId } from "./dossiers"
import { collectEvidenceNumbers, findUnverifiedNumbers } from "./verify-numbers"

// Business context given to every LLM. Edit here when the strategy changes.
const BUSINESS_CONTEXT = `Endora : app iOS de santé féminine (endométriose, cycle), abonnement « Endora Unlimited », mensuel ou annuel.
Phase : lancement (premières abonnées en mars 2026). Équipe minuscule.
Objectif prioritaire : CROISSANCE — plus d'utilisatrices et d'abonnées (distribution), tout en faisant monter le revenu.
Changements récents : test de prix France 13,99 €/79,99 € depuis le 23/07/2026 ; hausse des prix le 27/07/2026 (mensuel 3,99 → 10,99 €, annuel 39,99 → 59,99 € en France) ; essai gratuit de 7 jours depuis le 19/08/2026.
Lectrice : Alina, la fondatrice. Elle a un TDAH : phrases courtes, une idée par phrase, mais avec le CONTEXTE (pourquoi c'est important) — pas juste des chiffres.`

const RULES = `RÈGLES ABSOLUES
- Tu ne calcules RIEN : aucun %, somme, écart, ratio, « x fois ». Tu recopies les nombres du dossier (arrondi d'affichage seulement). Chaque nombre est vérifié automatiquement ; un nombre absent du dossier est rejeté.
- « Réel » ou « hasard » = le champ verdict (« écart probablement réel », « peut-être le hasard », « trop peu de données »). Jamais ton avis.
- Coïncidence ≠ cause : « coïncide avec », jamais « grâce à » / « à cause de ». Plusieurs changements dans la même période → dis-le.
- Chiffre incomplet / provisoire / projeté → dis-le avec l'hypothèse.
- Français simple. Jargon expliqué en 3 mots la 1re fois (MRR = revenu mensuel récurrent ; churn = désabonnements ; cohorte = abonnées du même mois).
- Réponds UNIQUEMENT avec le JSON demandé.`

const ANALYST_ROLES: Record<DossierId, string> = {
  offres:
    "Analyste OFFRES & PRIX. Compare mensuel et annuel (MRR, revenu, mix des nouvelles abonnées), les effets possibles des changements de prix, et le test de prix France. Rappelle que le revenu brut gonfle l'annuel le mois de l'achat : raisonne en MRR.",
  retention:
    "Analyste RÉTENTION & VALEUR. Combien de temps restent les abonnées, combien vaut une abonnée sur 12 mois selon l'offre, renouvellement automatique coupé, remboursements. Dis clairement ce qui est observé et ce qui est projeté.",
  conversion:
    "Analyste CONVERSION. Entonnoir inscrite → essai → payante par mois, effet de l'essai gratuit et de la hausse de prix (avec verdicts). Distingue volume et taux.",
  acquisition:
    "Analyste ACQUISITION & CROISSANCE. Évolution des nouvelles clientes, sources d'inscription qui montent ou baissent, sources qui amènent le plus de premium (avec verdicts). Relie à l'objectif de croissance.",
  produit:
    "Analyste PRODUIT & ENGAGEMENT. Releases, features, paywalls ajoutés, usage hebdo, avis App Store. Ce qui coïncide avec les variations, et les signaux d'alerte (avis négatifs, usage qui baisse).",
}

const sectionSchema = z.object({
  en_une_phrase: z.string(),
  constats: z
    .array(z.object({ fait: z.string(), ce_que_ca_veut_dire: z.string() }))
    .min(2)
    .max(4),
  recommandation: z.string(),
  graphiques: z.array(z.string()).max(2),
  confiance: z.enum(["haute", "moyenne", "faible"]),
  limites: z.string(),
})
type SectionLLM = z.infer<typeof sectionSchema>

const synthesisSchema = z.object({
  en_bref: z.array(z.string()).min(2).max(3),
  diagnostic: z.string(),
  strategie: z.string(),
  recommandations: z
    .array(
      z.object({
        action: z.string(),
        pourquoi: z.string(),
        comment_mesurer: z.string(),
        effort: z.enum(["faible", "moyen", "fort"]),
      }),
    )
    .min(3)
    .max(5),
  a_surveiller: z.array(z.string()).max(4),
  on_ne_sait_pas_encore: z.array(z.string()).max(3),
})
type SynthesisLLM = z.infer<typeof synthesisSchema>

export interface DeepSection extends Omit<SectionLLM, "graphiques"> {
  id: DossierId
  titre: string
  charts: ChartSpec[]
  warnings: string[]
  unverifiedNumbers: string[]
}

export interface DeepReport {
  question: string | null
  generatedAt: string
  synthese: (SynthesisLLM & { unverifiedNumbers: string[] }) | null
  sections: DeepSection[]
  erreurs: string[]
}

export type DeepProgress =
  | { step: "dossier"; id: DossierId; ok: boolean }
  | { step: "analyste"; id: DossierId; ok: boolean }
  | { step: "synthese"; ok: boolean }

const agentModel = () => ({
  deployment: process.env.ANTHROPIC_FOUNDRY_DEPLOYMENT_AGENT || undefined,
  model: process.env.LLM_MODEL_AGENT || undefined,
})

/** Text fields of a JSON object, joined — what the number check reads. */
function prose(value: unknown): string {
  if (typeof value === "string") return value
  if (Array.isArray(value)) return value.map(prose).join("\n")
  if (value && typeof value === "object") return Object.values(value).map(prose).join("\n")
  return ""
}

/** LLM JSON call + number check; one corrective retry, then flag leftovers. */
async function verifiedCall<T>(
  args: { system: string; user: string; schema: z.ZodType<T>; omitFromCheck?: (v: T) => unknown },
  evidence: Set<number>,
): Promise<{ value: T; unverifiedNumbers: string[] }> {
  const check = (v: T) => findUnverifiedNumbers(prose(args.omitFromCheck ? args.omitFromCheck(v) : v), evidence)
  const first = await callJson({ system: [{ text: args.system, cacheable: true }], user: args.user, schema: args.schema, ...agentModel() })
  const bad = check(first)
  if (bad.length === 0) return { value: first, unverifiedNumbers: [] }
  const retry = await callJson({
    system: [{ text: args.system, cacheable: true }],
    user: `${args.user}\n\nVÉRIFICATION AUTOMATIQUE de ta réponse précédente : ces nombres ne sont PAS dans les données : ${bad.join(", ")}. Réécris tout le JSON en les remplaçant par des nombres présents tels quels, ou en les supprimant. N'en calcule aucun.`,
    schema: args.schema,
    ...agentModel(),
  })
  return { value: retry, unverifiedNumbers: check(retry) }
}

async function runAnalyst(dossier: Dossier, question: string | null, evidence: Set<number>): Promise<DeepSection> {
  const chartIds = Object.keys(dossier.graphiques)
  const system = `${ANALYST_ROLES[dossier.id]}

CONTEXTE
${BUSINESS_CONTEXT}

${RULES}

FORMAT JSON
{
  "en_une_phrase": "le message clé de ta section, ≤ 20 mots",
  (Si une question est posée : réponds-y sous l'angle de TA spécialité avec tes données. Ne consacre JAMAIS un constat à dire ce que ton dossier ne contient pas — mets-le seulement dans "limites".)
  "constats": [ { "fait": "un fait chiffré avec sa période", "ce_que_ca_veut_dire": "pourquoi c'est important pour Endora, en 1-2 phrases" } ] (2 à 4, du plus important au moins important),
  "recommandation": "une action concrète pour ta partie",
  "graphiques": ids à afficher parmi ${JSON.stringify(chartIds)} (0 à 2, les plus parlants),
  "confiance": "haute" | "moyenne" | "faible" (faible si petits effectifs ou données projetées),
  "limites": "ce que ces données ne permettent pas de dire, 1 phrase"
}`
  const user = `${question ? `Question d'Alina : « ${question} »\n\n` : ""}DOSSIER « ${dossier.titre} » (calculé par le code) :
${JSON.stringify({ donnees: dossier.donnees, avertissements: dossier.warnings })}`

  const { value, unverifiedNumbers } = await verifiedCall(
    { system, user, schema: sectionSchema, omitFromCheck: ({ graphiques, ...rest }) => rest },
    evidence,
  )
  return {
    id: dossier.id,
    titre: dossier.titre,
    en_une_phrase: value.en_une_phrase,
    constats: value.constats,
    recommandation: value.recommandation,
    confiance: value.confiance,
    limites: value.limites,
    charts: value.graphiques.map((id) => dossier.graphiques[id]).filter(Boolean),
    warnings: dossier.warnings,
    unverifiedNumbers,
  }
}

async function runSynthesis(sections: DeepSection[], question: string | null, evidence: Set<number>) {
  const system = `Tu es la DIRECTRICE STRATÉGIE d'Endora. Tu reçois les sections de 5 analystes (offres, rétention, conversion, acquisition, produit), chacune fondée sur des chiffres calculés par le code.
Ton travail : croiser les sections (ex. « l'annuel domine les ventes MAIS est beaucoup remboursé et peu renouvelé »), poser un diagnostic, une stratégie adaptée à la phase de lancement et à l'objectif de croissance, et 3 à 5 recommandations priorisées.

CONTEXTE
${BUSINESS_CONTEXT}

${RULES}
- N'utilise que les nombres présents dans les sections.
- Les recommandations sont classées de la plus importante à la moins importante, chacune testable (comment_mesurer = quel chiffre regarder et quand).

FORMAT JSON
{
  "en_bref": [2 à 3 phrases ≤ 20 mots : ce qu'Alina doit retenir],
  "diagnostic": "3 à 5 phrases courtes qui croisent les sections",
  "strategie": "3 à 5 phrases : quoi privilégier maintenant (offre, prix, acquisition) et pourquoi, vu l'objectif de croissance",
  "recommandations": [ { "action": "...", "pourquoi": "...", "comment_mesurer": "...", "effort": "faible" | "moyen" | "fort" } ],
  "a_surveiller": [jusqu'à 4 signaux à suivre chaque semaine],
  "on_ne_sait_pas_encore": [jusqu'à 3 inconnues importantes et quand on saura]
}`
  const user = `${question ? `Question d'Alina : « ${question} »\n\n` : ""}SECTIONS DES ANALYSTES :
${JSON.stringify(sections.map(({ charts, ...s }) => s))}`
  const { value, unverifiedNumbers } = await verifiedCall({ system, user, schema: synthesisSchema }, evidence)
  return { ...value, unverifiedNumbers }
}

export async function runDeepAnalysis(
  question: string | null,
  onProgress: (p: DeepProgress) => void = () => {},
): Promise<DeepReport> {
  const erreurs: string[] = []
  const ids = Object.keys(DOSSIER_BUILDERS) as DossierId[]

  // 1. Dossiers (code). RevenueCat calls are queued by the shared rate limiter.
  const built = await Promise.all(
    ids.map(async (id) => {
      try {
        const d = await DOSSIER_BUILDERS[id]()
        onProgress({ step: "dossier", id, ok: true })
        return d
      } catch (error) {
        console.error(`[deep-analysis] dossier ${id} failed:`, error)
        erreurs.push(`Dossier ${id} indisponible : ${error instanceof Error ? error.message : error}`)
        onProgress({ step: "dossier", id, ok: false })
        return null
      }
    }),
  )
  const dossiers = built.filter((d): d is Dossier => d !== null)

  // Evidence = every number of every dossier + the question.
  const evidence = new Set<number>()
  collectEvidenceNumbers(JSON.stringify(dossiers.map((d) => ({ donnees: d.donnees, warnings: d.warnings }))), evidence)
  if (question) collectEvidenceNumbers(question, evidence)

  // 2. Analysts in parallel (LLM, read-only on their dossier).
  const analysed = await Promise.all(
    dossiers.map(async (d) => {
      try {
        const section = await runAnalyst(d, question, evidence)
        onProgress({ step: "analyste", id: d.id, ok: true })
        return section
      } catch (error) {
        console.error(`[deep-analysis] analyst ${d.id} failed:`, error)
        erreurs.push(`Analyste ${d.id} en échec : ${error instanceof Error ? error.message : error}`)
        onProgress({ step: "analyste", id: d.id, ok: false })
        return null
      }
    }),
  )
  const sections = analysed.filter((s): s is DeepSection => s !== null)

  // 3. Synthesis.
  let synthese: DeepReport["synthese"] = null
  if (sections.length > 0) {
    try {
      synthese = await runSynthesis(sections, question, evidence)
      onProgress({ step: "synthese", ok: true })
    } catch (error) {
      console.error("[deep-analysis] synthesis failed:", error)
      erreurs.push(`Synthèse en échec : ${error instanceof Error ? error.message : error}`)
      onProgress({ step: "synthese", ok: false })
    }
  }

  return { question, generatedAt: new Date().toISOString(), synthese, sections, erreurs }
}
