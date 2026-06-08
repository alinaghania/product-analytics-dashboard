import "server-only"
import { z } from "zod"
import { assertLlmConfigured, callJson, type SystemBlock } from "./llm-client"
import {
  fetchRecentConversationsForInsights,
  type InsightsConversation,
} from "./firestore-admin-queries"

export interface ConversationRef {
  conversationId: string
  userId: string
  reason: string
}

export interface ConversationInsights {
  summary: string
  bestConversation: ConversationRef | null
  // Unit = conversation (a userId may repeat); deduped by conversationId, ≤ 30.
  interestingConversations: ConversationRef[]
  meta: {
    conversationsAnalyzed: number
    onboardingExcluded: number
    truncated: boolean
    hallucinationsFiltered: number
  }
}

// ---- LLM output schemas (validated, then cross-checked against the corpus) ----

const summarySchema = z.object({
  summary: z.string(),
  bestConversation: z
    .object({
      conversationId: z.string(),
      userId: z.string(),
      reason: z.string(),
    })
    .nullable(),
})

const topConversationsSchema = z.object({
  conversations: z.array(
    z.object({
      conversationId: z.string(),
      userId: z.string(),
      reason: z.string(),
    }),
  ),
})

// Render the corpus as plain text, each conversation prefixed with its real IDs.
function buildTranscript(conversations: InsightsConversation[]): string {
  return conversations
    .map((conv) => {
      const lines = conv.messages.map((m) => `[${m.role}] ${m.content}`).join("\n")
      return `=== conversation conversationId=${conv.conversationId} userId=${conv.userId} ===\n${lines}`
    })
    .join("\n\n")
}

const SYSTEM_PREAMBLE =
  "Tu es un analyste produit pour Endora, une app de suivi de santé féminine. " +
  "On te fournit un corpus de conversations récentes entre des utilisatrices et l'assistante IA Endora " +
  "(l'onboarding/intro a déjà été retiré). Chaque conversation est préfixée par ses identifiants réels " +
  "(conversationId, userId). Règle absolue: tout conversationId ou userId que tu renvoies DOIT être copié " +
  "EXACTEMENT depuis le corpus — n'invente jamais d'identifiant."

const INSTRUCTION_SUMMARY =
  "À partir du corpus ci-dessus, produis: (1) un résumé global en français (3 à 5 phrases) des thèmes " +
  "récurrents, besoins, douleurs et signaux produit notables et surtout des problèmes remontés par les utilisatrices; (2) LA conversation la plus intéressante à " +
  "lire (la plus riche ou révélatrice). " +
  'Réponds UNIQUEMENT en JSON: {"summary": string, "bestConversation": {"conversationId": string, ' +
  '"userId": string, "reason": string} | null}. "reason" est une phrase courte en français. ' +
  "Les identifiants doivent provenir exactement du corpus."

const INSTRUCTION_TOP =
  "À partir du corpus ci-dessus, identifie les 30 conversations LES PLUS intéressantes à lire " +
  "(signaux produit, douleurs utilisateurs, usages révélateurs, bugs, demandes de fonctionnalités). " +
  "L'unité est la conversation, pas l'utilisateur: un même userId PEUT apparaître plusieurs fois si " +
  "plusieurs de ses conversations sont intéressantes. " +
  'Réponds UNIQUEMENT en JSON: {"conversations": [{"conversationId": string, "userId": string, ' +
  '"reason": string}]} avec au plus 30 entrées, triées de la plus intéressante à la moins. ' +
  '"reason" est une phrase courte en français. Les identifiants doivent provenir exactement du corpus.'

// Run the two LLM calls over a shared, cached corpus and return only IDs that
// have been verified against that corpus (the LLM is never trusted on IDs).
export async function generateConversationInsights(): Promise<ConversationInsights> {
  // Fail fast (→ 503) on missing creds before the expensive corpus fetch.
  assertLlmConfigured()

  const { conversations, meta } = await fetchRecentConversationsForInsights()

  // Source of truth: the corpus maps each real conversationId to its userId.
  const byConv = new Map<string, string>()
  for (const conv of conversations) byConv.set(conv.conversationId, conv.userId)

  // Shared cached prefix (preamble + transcript); only the instruction varies.
  const system: SystemBlock[] = [
    { text: SYSTEM_PREAMBLE },
    { text: buildTranscript(conversations), cacheable: true },
  ]

  let hallucinationsFiltered = 0

  // Empty corpus → nothing to ask the LLM.
  if (conversations.length === 0) {
    return {
      summary: "Aucune conversation à analyser (hors onboarding) sur la période récente.",
      bestConversation: null,
      interestingConversations: [],
      meta: { ...meta, hallucinationsFiltered },
    }
  }

  // Sequential on purpose: the first call writes the ephemeral prompt cache for
  // the shared corpus (the second reads it), and discovers any unsupported
  // optional field so the second call starts in bare mode without re-paying the
  // 400-retry penalty. Running in parallel would race the cache and double the
  // retry cost.
  const summaryResult = await callJson({
    system,
    user: INSTRUCTION_SUMMARY,
    schema: summarySchema,
    maxTokens: 4096,
  })
  const topResult = await callJson({
    system,
    user: INSTRUCTION_TOP,
    schema: topConversationsSchema,
    maxTokens: 8192,
  })

  // Keep an entry only if its conversationId exists in the corpus; overwrite the
  // userId with the corpus value (the corpus is authoritative, not the LLM).
  const verify = (ref: { conversationId: string; userId: string; reason: string }): ConversationRef | null => {
    const realUserId = byConv.get(ref.conversationId)
    if (realUserId === undefined) {
      hallucinationsFiltered++
      return null
    }
    return { conversationId: ref.conversationId, userId: realUserId, reason: ref.reason }
  }

  const bestConversation = summaryResult.bestConversation ? verify(summaryResult.bestConversation) : null

  // Verify, dedup by conversationId (keep first/best), cap at 30.
  const seen = new Set<string>()
  const interestingConversations: ConversationRef[] = []
  for (const ref of topResult.conversations) {
    const verified = verify(ref)
    if (!verified || seen.has(verified.conversationId)) continue
    seen.add(verified.conversationId)
    interestingConversations.push(verified)
    if (interestingConversations.length >= 30) break
  }

  return {
    summary: summaryResult.summary,
    bestConversation,
    interestingConversations,
    meta: { ...meta, hallucinationsFiltered },
  }
}
