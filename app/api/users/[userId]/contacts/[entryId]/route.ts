import { type NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/lib/api-utils"
import { serializeTimestamps } from "@/lib/firestore-admin-queries"
import { deleteContactEntry } from "@/lib/firestore-dashboard-queries"

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string; entryId: string }> },
) {
  return withAuth(request, async () => {
    const { userId, entryId } = await params

    const result = await deleteContactEntry(userId, entryId)
    if (!result) {
      return NextResponse.json({ error: "Contact entry not found" }, { status: 404 })
    }

    return NextResponse.json({ data: serializeTimestamps(result) })
  })
}
