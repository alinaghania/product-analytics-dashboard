"use client"

import { Info } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface InfoTooltipProps {
  title: string
  description: string
  howToRead?: string
  limitations?: string
  dataCoverage?: string
}

export function InfoTooltip({ title, description, howToRead, limitations, dataCoverage }: InfoTooltipProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button className="inline-flex items-center justify-center rounded-full w-5 h-5 bg-muted hover:bg-muted/80 transition-colors">
            <Info className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-sm p-4 space-y-2" side="right">
          <div>
            <p className="font-semibold text-sm mb-1">{title}</p>
            <p className="text-xs text-muted-foreground">{description}</p>
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
