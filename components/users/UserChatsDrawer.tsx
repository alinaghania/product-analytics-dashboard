"use client"

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { UserChatsPanel } from "./UserChatsPanel"

interface UserChatsDrawerProps {
  userId: string
  userEmail: string
  open: boolean
  onClose: () => void
}

export function UserChatsDrawer({ userId, userEmail, open, onClose }: UserChatsDrawerProps) {
  return (
    <Sheet
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose()
      }}
    >
      <SheetContent side="right" className="flex w-full flex-col gap-4 overflow-hidden sm:max-w-[720px]">
        <SheetHeader>
          <SheetTitle>Chats - {userEmail || "Unknown email"}</SheetTitle>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>UID:</span>
            <Badge variant="outline" className="text-[10px]">
              {userId || "unknown"}
            </Badge>
          </div>
        </SheetHeader>

        <Separator />

        <UserChatsPanel userId={userId} enabled={open} />
      </SheetContent>
    </Sheet>
  )
}
