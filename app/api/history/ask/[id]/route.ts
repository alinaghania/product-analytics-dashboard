import { type NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/lib/api-utils"
import { deleteAskHistory } from "@/lib/firestore-dashboard-queries"

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAuth(request, async () => {
    const { id } = await params
    const deleted = await deleteAskHistory(id)
    if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ data: { id } })
  })
}
