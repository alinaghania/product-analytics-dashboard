"use client"

import { Fragment, type ReactNode } from "react"

// The agent answers in a tiny fixed markdown subset (bold + "- " bullets), so a
// 20-line renderer beats pulling in a markdown library.
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="font-semibold text-foreground">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  )
}

export function AgentAnswer({ text }: { text: string }) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean)
  const blocks: ReactNode[] = []
  let bullets: string[] = []
  const flush = () => {
    if (bullets.length) {
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="list-disc space-y-1 pl-5">
          {bullets.map((b, i) => (
            <li key={i}>{inline(b)}</li>
          ))}
        </ul>,
      )
      bullets = []
    }
  }
  for (const line of lines) {
    if (/^[-•*] /.test(line)) bullets.push(line.slice(2))
    else {
      flush()
      blocks.push(<p key={`p-${blocks.length}`}>{inline(line)}</p>)
    }
  }
  flush()
  return <div className="space-y-2 text-sm leading-relaxed text-foreground/90">{blocks}</div>
}
