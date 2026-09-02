"use client"

import { Info } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

interface InfoTooltipProps {
  title: string
  /** Optional formula, shown on its own line above the description. */
  formula?: string
  description: string
  howToRead?: string
  limitations?: string
  dataCoverage?: string
}

export function InfoTooltip({ title, formula, description, howToRead, limitations, dataCoverage }: InfoTooltipProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button className="inline-flex items-center justify-center rounded-full w-5 h-5 bg-muted hover:bg-muted/80 transition-colors">
            <Info className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </TooltipTrigger>
        {/* normal-case: the trigger often sits inside an uppercase label, whose
            text-transform would otherwise be inherited by this non-portalled content. */}
        <TooltipContent className="max-w-sm p-4 space-y-2 normal-case" side="right">
          <div>
            <p className="font-semibold text-sm mb-1">{title}</p>
            {formula && <p className="text-xs font-medium text-foreground">{formula}</p>}
            <p className={cn("text-xs text-muted-foreground", formula && "mt-2")}>{description}</p>
          </div>
          {howToRead && (
            <div>
              <p className="font-semibold text-xs mb-1">How to read:</p>
              <p className="text-xs text-muted-foreground">{howToRead}</p>
            </div>
          )}
          {limitations && (
            <div>
              <p className="font-semibold text-xs mb-1 text-amber-600">Limitations:</p>
              <p className="text-xs text-muted-foreground">{limitations}</p>
            </div>
          )}
          {dataCoverage && (
            <div className="pt-2 border-t border-border">
              <p className="text-xs text-muted-foreground">{dataCoverage}</p>
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
