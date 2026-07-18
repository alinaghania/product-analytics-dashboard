// Queries against the dashboard-owned Firestore database ("dashboard").
// This is the ONLY file that performs Firestore writes — everything in
// firestore-admin-queries.ts reads the mobile app's "(default)" database,
// which the service account cannot write to (see CLAUDE.md).
//
// Data model:
//   user_contacts/{userId}                 summary of the latest outreach
//   user_contacts/{userId}/entries/{id}    one doc per outreach attempt

import { FieldValue, Timestamp } from "firebase-admin/firestore"
import { getDashboardDb } from "./firebase-admin"
import type { ContactChannel, ContactEntry, UserContactSummary } from "./types"

const CONTACTS_COLLECTION = "user_contacts"

// True while the GCP setup is missing (database not created, or the IAM
// binding not granted/propagated). Read routes degrade gracefully on these
// two cases only — anything else is a real error and must surface.
export function isDashboardDbUnavailable(error: unknown): boolean {
  const code = (error as { code?: number })?.code
  return code === 5 /* NOT_FOUND */ || code === 7 /* PERMISSION_DENIED */
}

function contactsRef() {
  return getDashboardDb().collection(CONTACTS_COLLECTION)
}

function toDate(value: any): Date {
  if (value instanceof Timestamp) return value.toDate()
  if (value instanceof Date) return value
  return new Date(value)
}

function mapEntryDoc(id: string, data: FirebaseFirestore.DocumentData): ContactEntry {
  return {
    id,
    contactedAt: toDate(data.contactedAt),
    channel: data.channel as ContactChannel,
    note: data.note ?? "",
    contactedBy: data.contactedBy ?? "",
    createdAt: toDate(data.createdAt),
  }
}

function mapSummaryDoc(data: FirebaseFirestore.DocumentData): UserContactSummary {
  return {
    lastContactedAt: toDate(data.lastContactedAt),
    lastChannel: data.lastChannel as ContactChannel,
    lastContactedBy: data.lastContactedBy ?? "",
    contactCount: data.contactCount ?? 0,
  }
}

export async function addContactEntry(
  userId: string,
  input: { channel: ContactChannel; note: string; contactedAt?: Date },
  contactedBy: string,
): Promise<{ entry: ContactEntry; summary: UserContactSummary }> {
  const summaryRef = contactsRef().doc(userId)
  const entryRef = summaryRef.collection("entries").doc()
  const now = new Date()
  const contactedAt = input.contactedAt ?? now

  await getDashboardDb().runTransaction(async (tx) => {
    const summarySnap = await tx.get(summaryRef)

    tx.set(entryRef, {
      contactedAt,
      channel: input.channel,
      note: input.note,
      contactedBy,
      createdAt: now,
    })

    // Only promote this entry to the summary when it is the newest contact —
    // a backdated entry must not overwrite a more recent one.
    const existing = summarySnap.exists ? summarySnap.data() : undefined
    const existingLast = existing?.lastContactedAt ? toDate(existing.lastContactedAt) : undefined
    const isNewest = !existingLast || contactedAt >= existingLast

    tx.set(
      summaryRef,
      {
        ...(isNewest && {
          lastContactedAt: contactedAt,
          lastChannel: input.channel,
          lastContactedBy: contactedBy,
        }),
        contactCount: FieldValue.increment(1),
        updatedAt: now,
      },
      { merge: true },
    )
  })

  const [entrySnap, summarySnap] = await Promise.all([entryRef.get(), summaryRef.get()])
  return {
    entry: mapEntryDoc(entrySnap.id, entrySnap.data()!),
    summary: mapSummaryDoc(summarySnap.data()!),
  }
}

export async function deleteContactEntry(
  userId: string,
  entryId: string,
): Promise<{ summary: UserContactSummary | null } | null> {
  const summaryRef = contactsRef().doc(userId)
  const entryRef = summaryRef.collection("entries").doc(entryId)

  const deleted = await getDashboardDb().runTransaction(async (tx) => {
    const entrySnap = await tx.get(entryRef)
    if (!entrySnap.exists) return false

    // Recompute the summary from the newest remaining entry; if none remain,
    // drop the summary doc so the "contacted" filter stays truthful.
    const remaining = await tx.get(
      summaryRef.collection("entries").orderBy("contactedAt", "desc").limit(2),
    )
    const newest = remaining.docs.find((d) => d.id !== entryId)

    tx.delete(entryRef)
    if (!newest) {
      tx.delete(summaryRef)
    } else {
      const data = newest.data()
      tx.set(
        summaryRef,
        {
          lastContactedAt: data.contactedAt,
          lastChannel: data.channel,
          lastContactedBy: data.contactedBy,
          contactCount: FieldValue.increment(-1),
          updatedAt: new Date(),
        },
        { merge: true },
      )
    }
    return true
  })

  if (!deleted) return null
  const summarySnap = await summaryRef.get()
  return { summary: summarySnap.exists ? mapSummaryDoc(summarySnap.data()!) : null }
}

export async function fetchContactEntries(userId: string): Promise<ContactEntry[]> {
  const snapshot = await contactsRef()
    .doc(userId)
    .collection("entries")
    .orderBy("contactedAt", "desc")
    .limit(200)
    .get()
  return snapshot.docs.map((doc) => mapEntryDoc(doc.id, doc.data()))
}

export async function fetchContactSummariesForUsers(
  userIds: string[],
): Promise<Record<string, UserContactSummary | null>> {
  const result: Record<string, UserContactSummary | null> = {}
  if (userIds.length === 0) return result

  const db = getDashboardDb()
  const chunks: string[][] = []
  for (let i = 0; i < userIds.length; i += 100) {
    chunks.push(userIds.slice(i, i + 100))
  }

  for (const chunk of chunks) {
    const snaps = await db.getAll(...chunk.map((id) => contactsRef().doc(id)))
    for (const snap of snaps) {
      result[snap.id] = snap.exists ? mapSummaryDoc(snap.data()!) : null
    }
  }
  return result
}

// IDs of every user with at least one logged contact. Empty projection —
// only document IDs travel over the wire.
export async function fetchContactedUserIdSet(): Promise<Set<string>> {
  const snapshot = await contactsRef().select().get()
  return new Set(snapshot.docs.map((doc) => doc.id))
}
