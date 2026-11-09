"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { forgetPage } from "@/lib/data-freshness"

// Mounted once in the dashboard layout: what the server cache answered a page
// (lib/data-freshness.ts) is kept while the admin stays on it, then dropped.
export function PageCacheScope() {
  const pathname = usePathname()
  useEffect(() => () => forgetPage(pathname), [pathname])
  return null
}
