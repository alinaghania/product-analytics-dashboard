import { Info } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface ChartInfoTooltipProps {
  definition: string
  howToRead: string
  limitation?: string
}

export function ChartInfoTooltip({ definition, howToRead, limitation }: ChartInfoTooltipProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button className="ml-2 inline-flex items-center justify-center rounded-full p-1 hover:bg-muted">
            <Info className="h-4 w-4 text-muted-foreground" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs space-y-2 text-sm" side="right">
          <div>
            <p className="font-semibold">Definition:</p>
            <p className="text-muted-foreground">{definition}</p>
          </div>
          <div>
            <p className="font-semibold">How to read:</p>
            <p className="text-muted-foreground">{howToRead}</p>
          </div>
          {limitation && (
            <div>
              <p className="font-semibold">Limitation:</p>
              <p className="text-muted-foreground">{limitation}</p>
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
