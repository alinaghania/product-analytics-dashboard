"use client"

import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Textarea } from "@/components/ui/textarea"
import { addUserContact } from "@/lib/api-client"
import type { ContactChannel } from "@/lib/types"
import { format } from "date-fns"
import { Loader2, Mail, Phone } from "lucide-react"

interface ContactDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
  // Email or name shown in the dialog title.
  userLabel: string
}

// Local calendar day — toISOString() would give the UTC day, which is
// yesterday between midnight and ~2am in Paris.
const today = () => format(new Date(), "yyyy-MM-dd")

// Modal form to log one outreach attempt (relance) for a user. Used from the
// users list quick-action button and the user detail history card.
export function ContactDialog({ open, onOpenChange, userId, userLabel }: ContactDialogProps) {
  const queryClient = useQueryClient()
  const [channel, setChannel] = useState<ContactChannel>("email")
  const [date, setDate] = useState(today)
  const [note, setNote] = useState("")

  const resetForm = () => {
    setChannel("email")
    setDate(today())
    setNote("")
  }

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      addUserContact(userId, {
        channel,
        note,
        // If the date wasn't backdated, omit it so the server stamps the
        // exact current time instead of local noon.
        contactedAt: date === today() ? undefined : new Date(`${date}T12:00:00`).toISOString(),
      }),
    onSuccess: () => {
      // refetchType "all": the global refetchOnMount=false config would
      // otherwise leave an invalidated-but-unmounted query stale forever
      // (e.g. log a contact from the list, then open the user's detail page).
      queryClient.invalidateQueries({ queryKey: ["contactEntries", userId], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["contactSummaries"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["users"], refetchType: "active" })
      toast.success("Contact enregistré")
      onOpenChange(false)
      resetForm()
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Échec de l'enregistrement")
    },
  })

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enregistrer un contact</DialogTitle>
          <DialogDescription>{userLabel}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Canal</Label>
            <RadioGroup
              value={channel}
              onValueChange={(v) => setChannel(v as ContactChannel)}
              className="flex gap-4"
            >
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <RadioGroupItem value="email" id="contact-channel-email" />
                <Mail className="h-4 w-4 text-muted-foreground" />
                Email
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <RadioGroupItem value="phone" id="contact-channel-phone" />
                <Phone className="h-4 w-4 text-muted-foreground" />
                Téléphone
              </label>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="contact-date">Date du contact</Label>
            <Input
              id="contact-date"
              type="date"
              value={date}
              max={today()}
              onChange={(e) => setDate(e.target.value)}
              className="w-[180px]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="contact-note">Note (contenu du message, réponse...)</Label>
            <Textarea
              id="contact-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ex : mail de relance envoyé avec offre -20%, pas encore de réponse"
              rows={4}
              maxLength={2000}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
            Annuler
          </Button>
          <Button onClick={() => mutate()} disabled={isPending || !date}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
