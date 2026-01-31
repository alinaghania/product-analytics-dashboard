"use client"

import type React from "react"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useState } from "react"

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // IMPORTANT: Disable all auto-refresh as per requirements
            refetchOnWindowFocus: false,
            refetchOnMount: false,
            refetchOnReconnect: false,
            refetchInterval: false,
            retry: false,
            staleTime: Number.POSITIVE_INFINITY,
          },
        },
      }),
  )

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
