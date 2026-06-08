import "server-only"
import Anthropic from "@anthropic-ai/sdk"
import type { z } from "zod"

// Thin wrapper over @anthropic-ai/sdk configured for Azure AI Foundry (an
// Anthropic-compatible endpoint hosted on Azure Cognitive Services).
//
// Azure routing differs from the first-party API in two ways:
//   - Auth is the `api-key` header (NOT `x-api-key` / `Authorization: Bearer`).
//   - The model is selected by the `api-deployment` query param, NOT the
//     `model` field of the body (which Azure still requires by schema but
//     ignores for routing).
// Throws the "LLM not configured" error (mapped to a 503 upstream) when any
// required Foundry env var is missing. Call this early to fail fast before
// doing expensive work (e.g. the Firestore corpus fetch).
export function assertLlmConfigured(): void {
  if (
    !process.env.ANTHROPIC_FOUNDRY_BASE_URL ||
    !process.env.ANTHROPIC_FOUNDRY_API_KEY ||
    !process.env.ANTHROPIC_FOUNDRY_DEPLOYMENT
  ) {
    throw new Error(
      "LLM not configured: set ANTHROPIC_FOUNDRY_BASE_URL, ANTHROPIC_FOUNDRY_API_KEY, ANTHROPIC_FOUNDRY_DEPLOYMENT",
    )
  }
}

export function getLlmClient(): Anthropic {
  assertLlmConfigured() // guarantees the three vars below are defined
  const baseURL = process.env.ANTHROPIC_FOUNDRY_BASE_URL!
  const apiKey = process.env.ANTHROPIC_FOUNDRY_API_KEY!
  const deployment = process.env.ANTHROPIC_FOUNDRY_DEPLOYMENT!

  const headers: Record<string, string> = { "api-key": apiKey } // Azure Cognitive Services auth
  // Optional beta features (comma-separated), e.g. the 1M context window on a
  // Sonnet deployment: ANTHROPIC_FOUNDRY_BETA="context-1m-2025-08-07".
  const beta = process.env.ANTHROPIC_FOUNDRY_BETA
  if (beta) headers["anthropic-beta"] = beta

  return new Anthropic({
    baseURL, // .../anthropic → SDK appends /v1/messages
    apiKey, // satisfies the SDK constructor; x-api-key header is ignored by Azure
    defaultHeaders: headers,
    defaultQuery: { "api-deployment": deployment }, // routes to the deployment
  })
}

// `model` body field — required by the Anthropic schema but non-routing on
// Azure (the deployment query param does the routing).
export function getLlmModel(): string {
  return process.env.LLM_MODEL || "claude-opus-4-6"
}

// `cache_control` is optional and a Foundry proxy may or may not accept it. The
// SDK does NOT guarantee "ignored if unsupported" — an unknown field can 400.
// We attempt the rich payload once, and on a 400 flip this flag to false so
// every subsequent call skips straight to the bare payload (no second
// round-trip wasted re-discovering the same limitation).
//
// Note: extended thinking is intentionally NOT used. This is a summarize-and-
// rank task over a large corpus; adaptive thinking added minutes of latency and
// pushed past the Azure gateway's response timeout (socket dropped mid-request).
let supportsCacheControl = true

export interface SystemBlock {
  text: string
  // Marks the cache breakpoint. The big shared transcript is the cacheable
  // prefix; the per-call instruction (user message) varies after it.
  cacheable?: boolean
}

interface CallJsonArgs<T> {
  system: SystemBlock[]
  user: string
  schema: z.ZodType<T>
  maxTokens?: number
}

// Extract only assistant text (skip thinking blocks) from a message response.
function extractText(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("")
}

// Tolerant JSON extraction: strip ``` fences, then take the outermost {…}.
function extractJsonString(raw: string): string {
  let s = raw.trim()
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) s = fenced[1].trim()
  const start = s.indexOf("{")
  const end = s.lastIndexOf("}")
  if (start !== -1 && end > start) s = s.slice(start, end + 1)
  return s
}

function parseJson<T>(raw: string, schema: z.ZodType<T>): T | null {
  try {
    const parsed = schema.safeParse(JSON.parse(extractJsonString(raw)))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

// Call the LLM and return a schema-validated object. Two independent retry
// layers:
//   1. Field compatibility — a 400 on the rich payload (cache_control) triggers
//      one retry with a bare payload and disables the field for the rest of the
//      process.
//   2. JSON validity — if the text isn't valid JSON for the schema, retry once
//      with a stricter "JSON only" instruction.
export async function callJson<T>({ system, user, schema, maxTokens = 8192 }: CallJsonArgs<T>): Promise<T> {
  const client = getLlmClient()
  const model = getLlmModel()

  const buildPayload = (instruction: string, bare: boolean): Anthropic.MessageStreamParams => {
    const systemBlocks: Anthropic.TextBlockParam[] = system.map((block) => {
      const b: Anthropic.TextBlockParam = { type: "text", text: block.text }
      if (!bare && block.cacheable && supportsCacheControl) b.cache_control = { type: "ephemeral" }
      return b
    })
    return {
      model,
      max_tokens: maxTokens,
      system: systemBlocks,
      messages: [{ role: "user", content: instruction }],
    }
  }

  // Layer 1: stream the request, degrading optional fields on a 400. Streaming
  // is required here — a long non-streamed response exceeds the Azure gateway's
  // idle timeout, which closes the socket ("other side closed"). Streaming keeps
  // the connection active; finalMessage() returns the fully assembled message.
  const send = async (instruction: string): Promise<string> => {
    const bare = !supportsCacheControl
    try {
      return extractText(await client.messages.stream(buildPayload(instruction, bare)).finalMessage())
    } catch (error) {
      if (error instanceof Anthropic.BadRequestError && !bare) {
        // Foundry rejected cache_control — remember it and retry bare.
        supportsCacheControl = false
        return extractText(await client.messages.stream(buildPayload(instruction, true)).finalMessage())
      }
      throw error
    }
  }

  // Layer 2: validate JSON, retrying once with a stricter instruction.
  const first = parseJson(await send(user), schema)
  if (first) return first

  const stricter =
    user +
    "\n\nIMPORTANT: ta réponse précédente n'était pas un JSON valide. Réponds UNIQUEMENT avec un objet JSON valide, sans aucun texte autour ni balise de code."
  const second = parseJson(await send(stricter), schema)
  if (second) return second

  throw new Error("LLM did not return valid JSON after retry")
}
