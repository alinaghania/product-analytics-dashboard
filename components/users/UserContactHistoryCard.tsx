"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ContactDialog } from "@/components/users/ContactDialog"
import { deleteUserContact, fetchUserContacts } from "@/lib/api-client"
import { formatDateTime } from "@/lib/date-utils"
import { CONTACT_CHANNEL_LABELS, type ContactEntry } from "@/lib/types"
import { Mail, Phone, Plus, Trash2 } from "lucide-react"

interface UserContactHistoryCardProps {
  userId: string
  // Email or name shown in the add-contact dialog title.
  userLabel: string
}

function ChannelBadge({ channel }: { channel: ContactEntry["channel"] }) {
  const Icon = channel === "phone" ? Phone : Mail
  return (
    <Badge variant="secondary" className="gap-1 font-normal">
      <Icon className="h-3 w-3" />
      {CONTACT_CHANNEL_LABELS[channel]}
    </Badge>
  )
}

// Outreach (relance) history for one user: list of logged contacts with an
// add form and per-entry delete. Data lives in the dashboard-owned Firestore
// database, separate from the mobile app's data.
export function UserContactHistoryCard({ userId, userLabel }: UserContactHistoryCardProps) {
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [entryToDelete, setEntryToDelete] = useState<ContactEntry | null>(null)

  const { data: result, isLoading } = useQuery({
    queryKey: ["contactEntries", userId],
    queryFn: () => fetchUserContacts(userId),
    enabled: Boolean(userId),
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  })

  const entries = result?.data ?? []
  const unavailable = result?.error

  const { mutate: removeEntry, isPending: isDeleting } = useMutation({
    mutationFn: (entryId: string) => deleteUserContact(userId, entryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contactEntries", userId], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["contactSummaries"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["users"], refetchType: "active" })
      toast.success("Contact supprimé")
      setEntryToDelete(null)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Échec de la suppression")
      setEntryToDelete(null)
    },
  })

  return (
    <Card className="border-border bg-card">
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">Relances</CardTitle>
          {entries.length > 0 && (
            <Badge variant="outline" className="font-normal">
              {entries.length}
            </Badge>
          )}
        </div>
        <Button size="sm" onClick={() => setDialogOpen(true)} className="gap-1.5">
          <Plus className="h-4 w-4" />
          Ajouter
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : unavailable ? (
          <p className="text-sm text-muted-foreground">
            Base « dashboard » indisponible — vérifier la configuration GCP (base Firestore
            nommée + droits d'écriture du service account).
          </p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun contact enregistré.</p>
        ) : (
          <ul className="divide-y divide-border">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-start justify-between gap-4 py-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <ChannelBadge channel={entry.channel} />
                    <span className="font-medium text-foreground">
                      {formatDateTime(entry.contactedAt)}
                    </span>
                    <span className="text-muted-foreground">par {entry.contactedBy}</span>
                  </div>
                  {entry.note && (
                    <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                      {entry.note}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => setEntryToDelete(entry)}
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="sr-only">Supprimer</span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <ContactDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        userId={userId}
        userLabel={userLabel}
      />

      <AlertDialog open={Boolean(entryToDelete)} onOpenChange={(open) => !open && setEntryToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette relance ?</AlertDialogTitle>
            <AlertDialogDescription>
              {entryToDelete &&
                `${CONTACT_CHANNEL_LABELS[entryToDelete.channel]} du ${formatDateTime(
                  entryToDelete.contactedAt,
                )} par ${entryToDelete.contactedBy}. Cette action est définitive.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              onClick={(e) => {
                // Keep the dialog open while the delete runs; onSuccess closes it.
                e.preventDefault()
                if (entryToDelete) removeEntry(entryToDelete.id)
              }}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
