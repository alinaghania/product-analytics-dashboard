"use client"

import { useMemo, useState } from "react"
import { format, parseISO } from "date-fns"
import { fr } from "date-fns/locale"
import { Calendar, Info, RefreshCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TooltipProvider } from "@/components/ui/tooltip"
import { agree, plural } from "@/lib/format"
import { buildInsights, type Insight, type MomentKey } from "@/lib/onboarding-journal/insights"
import { JOURNAL_SINCE_VERSION, langLabel, platformLabel, versionLabel } from "@/lib/onboarding-journal/labels"
import { buildMoments } from "@/lib/onboarding-journal/moments"
import {
  filterChoices,
  hasAccount,
  hasSignUp,
  screenStats,
  selectCohort,
  summarize,
  type JourneyFilters,
} from "@/lib/onboarding-journal/report"
import type { OnboardingDataset } from "@/lib/onboarding-journal/types"
import { cn } from "@/lib/utils"
import { AnswersTab } from "./answers-tab"
import { MomentsTab } from "./moments-tab"
import { OverviewTab } from "./overview-tab"
import { EmptyState, Hint } from "./primitives"
import { RegistrationProfile } from "./registration-profile"
import { ALL_SCOPE, TRUNK_SCOPE, type ScopeKey } from "./scopes"
import { ScreensTab } from "./screens-tab"
import { SegmentsTab } from "./segments-tab"
import { SessionsTab } from "./sessions-tab"

/** Journeys started over the last N days, today included. */
export type PeriodDays = 7 | 30 | 90

const PERIODS: PeriodDays[] = [7, 30, 90]

type TabKey = "overview" | "screens" | "moments" | "answers" | "segments" | "sessions" | "profile"

/** Tabs computed from the journal; the last one reads the user profiles instead. */
const JOURNAL_TABS: Array<{ key: TabKey; label: string }> = [
  { key: "overview", label: "Vue d'ensemble" },
  { key: "screens", label: "Écran par écran" },
  { key: "moments", label: "Moments clés" },
  { key: "answers", label: "Réponses" },
  { key: "segments", label: "Segments" },
  { key: "sessions", label: "Sessions" },
]

const FLOW_LABELS: Record<string, string> = {
  onboarding: "Onboarding (nouvelles utilisatrices)",
  reonboarding: "Ré-onboarding (utilisatrices existantes)",
}

/** Radix Select has no empty value: this one stands for "no filter". */
const ANY = "any"

function FilterSelect({
  label,
  anyLabel,
  value,
  choices,
  labelOf = (choice) => choice,
  onChange,
}: {
  label: string
  /** Wording of "no filter"; absent when one value must always be picked. */
  anyLabel?: string
  value: string | undefined
  choices: string[]
  labelOf?: (choice: string) => string
  onChange: (value: string | undefined) => void
}) {
  return (
    <Select value={value ?? ANY} onValueChange={(next) => onChange(next === ANY ? undefined : next)}>
      <SelectTrigger aria-label={label} className="h-9 w-auto gap-2 bg-card text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {anyLabel && <SelectItem value={ANY}>{anyLabel}</SelectItem>}
        {choices.map((choice) => (
          <SelectItem key={choice} value={choice}>
            {labelOf(choice)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

const formatDay = (day: string, pattern: string) => format(parseISO(day), pattern, { locale: fr })

/**
 * The Onboarding page below its header: period and filters, then one tab per
 * way of looking at the journal. Everything is computed here from the
 * journeys of the dataset, so a filter never calls the server.
 */
export function OnboardingJournal({
  dataset,
  baselineDataset,
  isRefreshing,
  error,
  baselineError,
  period,
  onPeriodChange,
  compare,
  onCompareChange,
}: {
  /** Journeys of the period; undefined until the first answer of the server. */
  dataset: OnboardingDataset | undefined
  /** Journeys of the period just before, when the comparison is on and loaded. */
  baselineDataset: OnboardingDataset | undefined
  /** New figures are on their way: the ones on display are kept, dimmed. */
  isRefreshing: boolean
  error: Error | null
  /** The comparison is on and the period just before could not be loaded. */
  baselineError: Error | null
  period: PeriodDays
  onPeriodChange: (period: PeriodDays) => void
  compare: boolean
  onCompareChange: (compare: boolean) => void
}) {
  const [tab, setTab] = useState<TabKey>("overview")
  const [filters, setFilters] = useState<JourneyFilters>({ flow: "onboarding" })
  const [scopeKey, setScopeKey] = useState<ScopeKey>(TRUNK_SCOPE)
  const [openScreenId, setOpenScreenId] = useState<string | null>(null)
  const [momentFocus, setMomentFocus] = useState<MomentKey | null>(null)

  const cohort = useMemo(() => (dataset ? selectCohort(dataset, filters) : null), [dataset, filters])
  const baselineCohort = useMemo(
    () => (compare && baselineDataset ? selectCohort(baselineDataset, filters) : null),
    [compare, baselineDataset, filters],
  )
  const overview = useMemo(() => {
    if (!dataset || !cohort) return null
    const moments = buildMoments(cohort.journeys, dataset)
    return {
      summary: summarize(cohort.journeys, dataset, filters.flow),
      moments,
      insights: buildInsights(screenStats(cohort.journeys, { kind: "all" }), moments, dataset),
    }
  }, [dataset, cohort, filters.flow])
  const baselineSummary = useMemo(
    () => (baselineDataset && baselineCohort ? summarize(baselineCohort.journeys, baselineDataset, filters.flow) : null),
    [baselineDataset, baselineCohort, filters.flow],
  )

  const openInsight = (insight: Insight) => {
    if (insight.screenId) {
      // The figures of an insight are those of all parcours together: so are the ones of the panel it opens.
      setScopeKey(ALL_SCOPE)
      setOpenScreenId(insight.screenId)
      setTab("screens")
    } else if (insight.moment) {
      setMomentFocus(insight.moment)
      setTab("moments")
    }
  }

  const changeTab = (next: string) => {
    setMomentFocus(null)
    setTab(next as TabKey)
  }

  const flows = dataset ? filterChoices(dataset, "flow") : []
  const excluded = cohort?.excluded.length ?? 0
  // What the statistics leave out with them: said in the hint, so that nobody looks for it in the figures.
  const excludedAccounts = cohort?.excluded.filter(hasAccount).length ?? 0
  const excludedSubscribed = cohort?.excluded.filter((journey) => journey.outcome === "subscribed").length ?? 0
  const excludedOutcomes =
    excludedAccounts > 0
      ? ` Parmi elles : ${plural(excludedAccounts, "compte créé", "comptes créés")}${excludedSubscribed > 0 ? `, dont ${plural(excludedSubscribed, "abonnement")}` : ""}.`
      : ""

  return (
    <TooltipProvider delayDuration={150}>
      <Tabs value={tab} onValueChange={changeTab} className="flex-1 space-y-6 p-4 md:p-6">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
              {PERIODS.map((days) => (
                <Button
                  key={days}
                  variant={period === days ? "secondary" : "ghost"}
                  size="sm"
                  className="h-7 text-xs"
                  aria-pressed={period === days}
                  onClick={() => onPeriodChange(days)}
                >
                  {days} jours
                </Button>
              ))}
            </div>
            {dataset && (
              <span className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs text-foreground">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                {formatDay(dataset.from, "d MMM")} – {formatDay(dataset.to, "d MMM yyyy")}
              </span>
            )}
            {dataset && (
              <>
                {/* Only when existing users were sent through the onboarding again. */}
                {flows.some((flow) => flow !== filters.flow) && (
                  <FilterSelect
                    label="Onboarding ou ré-onboarding"
                    value={filters.flow}
                    choices={flows}
                    labelOf={(flow) => FLOW_LABELS[flow] ?? flow}
                    onChange={(flow) => setFilters({ ...filters, flow: flow ?? "onboarding" })}
                  />
                )}
                <FilterSelect
                  label="Version de l'app"
                  anyLabel="Toutes les versions"
                  value={filters.version}
                  choices={filterChoices(dataset, "appVersion")}
                  labelOf={versionLabel}
                  onChange={(version) => setFilters({ ...filters, version })}
                />
                <FilterSelect
                  label="Plateforme"
                  anyLabel="iOS et Android"
                  value={filters.platform}
                  choices={filterChoices(dataset, "platform")}
                  labelOf={platformLabel}
                  onChange={(platform) => setFilters({ ...filters, platform })}
                />
                <FilterSelect
                  label="Langue"
                  anyLabel="Toutes les langues"
                  value={filters.lang}
                  choices={filterChoices(dataset, "lang")}
                  labelOf={langLabel}
                  onChange={(lang) => setFilters({ ...filters, lang })}
                />
              </>
            )}
            <Hint text="La période en cours contient des sessions récentes qui peuvent encore créer un compte ou s'abonner : ses taux montent encore un peu, ceux de la période précédente sont définitifs.">
              <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <Switch checked={compare} onCheckedChange={onCompareChange} className="scale-75" />
                Comparer aux {period} jours précédents
              </label>
            </Hint>
          </div>

          {cohort && (
            <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
              <span>
                <span className="font-medium text-foreground">{plural(cohort.journeys.length, "session")}</span>{" "}
                {agree(cohort.journeys.length, "suivie depuis son premier écran", "suivies depuis leur premier écran")}
              </span>
              {excluded > 0 && (
                <Hint
                  text={`Sessions dont le journal ne couvre pas tout le parcours (onboarding repris en cours de route, commencé avant la version ${JOURNAL_SINCE_VERSION}, ou premiers événements perdus). Elles fausseraient le tunnel : elles ne comptent dans aucun chiffre, mais restent visibles dans l'onglet Sessions.${excludedOutcomes}`}
                >
                  <button type="button" className="inline-flex cursor-default items-center gap-1 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    · {excluded} hors statistiques
                    <Info className="h-3 w-3" aria-hidden />
                  </button>
                </Hint>
              )}
              {compare && baselineCohort && <span>· {plural(baselineCohort.journeys.length, "session")} sur la période précédente</span>}
              {baselineError && <span>· la période précédente n'a pas pu être chargée ({baselineError.message})</span>}
            </p>
          )}

          <TabsList className="h-auto flex-wrap justify-start">
            {JOURNAL_TABS.map(({ key, label }) => (
              <TabsTrigger key={key} value={key}>
                {label}
              </TabsTrigger>
            ))}
            <TabsTrigger value="profile">Profil des inscrites</TabsTrigger>
          </TabsList>
        </div>

        {tab === "profile" ? null : error ? (
          <EmptyState>Le journal d'onboarding n'a pas pu être chargé : {error.message}</EmptyState>
        ) : !dataset || !cohort || !overview ? (
          <div className="flex min-h-[320px] items-center justify-center">
            <RefreshCcw className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Chargement" />
          </div>
        ) : (
          <div className={cn("transition-opacity", isRefreshing && "opacity-60")}>
            {/* The Sessions tab still lists the journeys left out of the statistics. */}
            {cohort.journeys.length === 0 && tab !== "sessions" ? (
              <EmptyState>
                Aucune session d'onboarding sur cette période avec ces filtres. Le journal existe depuis la version {JOURNAL_SINCE_VERSION} de
                l'app.
              </EmptyState>
            ) : (
              <>
                <TabsContent value="overview" className="mt-0">
                  <OverviewTab summary={overview.summary} baseline={baselineSummary} insights={overview.insights} onOpenInsight={openInsight} />
                </TabsContent>
                <TabsContent value="screens" className="mt-0">
                  <ScreensTab
                    journeys={cohort.journeys}
                    baselineJourneys={baselineCohort?.journeys}
                    dataset={dataset}
                    scopeKey={scopeKey}
                    onScopeChange={setScopeKey}
                    openScreenId={openScreenId}
                    onOpenScreen={setOpenScreenId}
                  />
                </TabsContent>
                <TabsContent value="moments" className="mt-0">
                  <MomentsTab moments={overview.moments} dataset={dataset} signUp={hasSignUp(filters.flow)} focus={momentFocus} />
                </TabsContent>
                <TabsContent value="answers" className="mt-0">
                  <AnswersTab journeys={cohort.journeys} dataset={dataset} />
                </TabsContent>
                <TabsContent value="segments" className="mt-0">
                  <SegmentsTab journeys={cohort.journeys} dataset={dataset} />
                </TabsContent>
                <TabsContent value="sessions" className="mt-0">
                  <SessionsTab journeys={cohort.journeys} excluded={cohort.excluded} flow={filters.flow} dataset={dataset} />
                </TabsContent>
              </>
            )}
          </div>
        )}

        {/* Not from the journal: shown even when the journal is empty or could not be loaded. */}
        <TabsContent value="profile" className="mt-0">
          <RegistrationProfile />
        </TabsContent>
      </Tabs>
    </TooltipProvider>
  )
}
