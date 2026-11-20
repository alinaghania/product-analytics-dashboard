"use client"

import { useMemo, useState } from "react"
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query"
import { format, parseISO, subDays } from "date-fns"
import { Header } from "@/components/dashboard/header"
import { OnboardingJournal, type PeriodDays } from "@/components/onboarding/onboarding-journal"
import { REGISTRATION_PROFILE_QUERY_KEY } from "@/components/onboarding/registration-profile"
import { toDayKey } from "@/lib/analytics"
import { fetchOnboardingJournal } from "@/lib/api-client"
import type { DateRange } from "@/lib/types"

/** The `days` days that end on `lastDay` (yyyy-MM-dd), both ends included. */
function rangeEnding(lastDay: string, days: number): DateRange {
  return { from: format(subDays(parseISO(lastDay), days - 1), "yyyy-MM-dd"), to: lastDay }
}

const journalQuery = (range: DateRange) => ({
  queryKey: ["onboarding-journal", range.from, range.to],
  queryFn: () => fetchOnboardingJournal(range.from, range.to),
  refetchOnMount: true,
})

export default function OnboardingPage() {
  const [period, setPeriod] = useState<PeriodDays>(30)
  const [compare, setCompare] = useState(false)
  const queryClient = useQueryClient()

  // Journeys are grouped by the Europe/Paris day they started on.
  const range = useMemo(() => rangeEnding(toDayKey(new Date()), period), [period])
  const previousRange = useMemo(() => rangeEnding(format(subDays(parseISO(range.from), 1), "yyyy-MM-dd"), period), [range, period])

  const journal = useQuery({ ...journalQuery(range), placeholderData: keepPreviousData })
  const baseline = useQuery({ ...journalQuery(previousRange), enabled: compare })

  // Every refetch starts before the first await: that is what lets "Reload All" skip the server cache.
  const handleReloadAll = async () => {
    await Promise.all([
      journal.refetch(),
      compare ? baseline.refetch() : null,
      queryClient.refetchQueries({ queryKey: REGISTRATION_PROFILE_QUERY_KEY, type: "active" }),
    ])
  }

  return (
    <div className="flex flex-col">
      <Header
        title="Onboarding"
        description="Du premier écran à l'abonnement : où l'on perd des utilisatrices, et pourquoi"
        lastUpdated={journal.dataUpdatedAt ? new Date(journal.dataUpdatedAt) : undefined}
        onReloadAll={handleReloadAll}
      />
      <OnboardingJournal
        dataset={journal.data}
        // Not while the figures on display are still those of the period just left: the two would not match.
        baselineDataset={compare && !journal.isPlaceholderData ? baseline.data : undefined}
        isRefreshing={journal.isFetching || (compare && baseline.isFetching)}
        error={journal.error}
        baselineError={compare ? baseline.error : null}
        period={period}
        onPeriodChange={setPeriod}
        compare={compare}
        onCompareChange={setCompare}
      />
    </div>
  )
}
