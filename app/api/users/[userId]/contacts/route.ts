import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { withAuth } from "@/lib/api-utils"
import { serializeTimestamps } from "@/lib/firestore-admin-queries"
import {
  addContactEntry,
  fetchContactEntries,
  isDashboardDbUnavailable,
} from "@/lib/firestore-dashboard-queries"

const postSchema = z.object({
  channel: z.enum(["email", "phone"]),
  note: z.string().trim().max(2000).default(""),
  // Optional backdate; when absent the server stamps the current time.
  contactedAt: z
    .string()
    .datetime({ offset: true })
    .optional()
    .refine((v) => !v || new Date(v).getTime() <= Date.now() + 24 * 60 * 60 * 1000, {
      message: "contactedAt cannot be in the future",
    }),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  return withAuth(request, async () => {
    const { userId } = await params
    try {
      const data = await fetchContactEntries(userId)
      return NextResponse.json({ data: serializeTimestamps(data), error: null })
    } catch (error) {
      // Dashboard DB not set up yet — the history card shows a setup hint.
      if (!isDashboardDbUnavailable(error)) throw error
      console.error("[API] contact entries unavailable:", error)
      return NextResponse.json({ data: [], error: "dashboard database unavailable" })
    }
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  return withAuth(request, async (auth) => {
    const { userId } = await params
    const body = postSchema.parse(await request.json())

    // contactedBy is always the authenticated admin — never taken from the body.
    const result = await addContactEntry(
      userId,
      {
        channel: body.channel,
        note: body.note,
        contactedAt: body.contactedAt ? new Date(body.contactedAt) : undefined,
      },
      auth.email,
    )

    return NextResponse.json({ data: serializeTimestamps(result) }, { status: 201 })
  })
}
