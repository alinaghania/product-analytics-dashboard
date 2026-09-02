"use client"

import { useMemo, useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { format as formatDate } from "date-fns"
import { fr } from "date-fns/locale"
import { Header } from "@/components/dashboard/header"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { ChartCard } from "@/components/dashboard/chart-card"
import { InfoTooltip } from "@/components/dashboard/info-tooltip"
import { BarChart } from "@/components/charts/bar-chart"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Slider } from "@/components/ui/slider"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Calculator, CheckCircle2, Download, XCircle } from "lucide-react"
import { fetchRevenueCatMetrics } from "@/lib/api-client"
import { computeCampaign, roasVerdict, SCENARIOS, type CampaignInputs } from "@/lib/campaign-calculator"
import { formatCurrency, formatMultiplier, formatNumber, formatPercent, parseLocaleNumber } from "@/lib/format"
import { cn } from "@/lib/utils"

interface FormState {
  influencerName: string
  platform: string
  videoCount: string
  views: string
  costMode: CampaignInputs["costMode"]
  cpm: string
  fixedPrice: string
  viewToInstallPct: string
  installToPaidPct: string
  arpu: string
}

const DEFAULTS: FormState = {
  influencerName: "",
  platform: "",
  videoCount: "",
  views: "10000",
  costMode: "cpm",
  cpm: "5",
  fixedPrice: "",
  viewToInstallPct: "0,20",
  // Fourchette basse des données réelles (RevenueCat, relevé 2026-08-30) :
  // conversion 30 j — juin 3,12 %, juillet 4,43 % ; ARPU par payante = LTV
  // réalisée 3 mois des cohortes complètes (mars-mai : 20,58 € brut) × ratio
  // net réel proceeds/brut (65,9 %) ≈ 13,56 €. Le bouton RevenueCat remplace
  // ces valeurs par les données fraîches.
  installToPaidPct: "3",
  arpu: "13,50",
}

function parseForm(form: FormState): CampaignInputs {
  // Negative values make no sense for any campaign field.
  const num = (s: string) => Math.max(0, parseLocaleNumber(s) ?? 0)
  return {
    views: num(form.views),
    costMode: form.costMode,
    // The inactive cost field is zeroed so editing it can't flag results as stale.
    cpm: form.costMode === "cpm" ? num(form.cpm) : 0,
    fixedPrice: form.costMode === "fixed" ? num(form.fixedPrice) : 0,
    viewToInstallPct: num(form.viewToInstallPct),
    installToPaidPct: num(form.installToPaidPct),
    arpu: num(form.arpu),
  }
}

/** € with adaptive precision: cents matter below 100 €, not above. */
function euros(value: number | null | undefined): string {
  return formatCurrency(value, value != null && Math.abs(value) >= 100 ? 0 : 2)
}

/** Counts (installs, paying users): one decimal when small, integer otherwise. */
function count(value: number | null | undefined): string {
  return formatNumber(value, value != null && Math.abs(value) < 10 ? 1 : 0)
}

/** Flags non-empty input the parser rejects — otherwise it would silently compute as 0. */
function invalidClass(raw: string): string | undefined {
  return raw.trim() !== "" && parseLocaleNumber(raw) === null ? "border-destructive" : undefined
}

const TIMEFRAME_LABELS: Record<string, string> = {
  "0_days": "le jour même",
  "3_days": "3 jours",
  "7_days": "7 jours",
  "14_days": "14 jours",
  "30_days": "30 jours",
  "3_months": "3 mois",
  "6_months": "6 mois",
  "12_months": "12 mois",
  "18_months": "18 mois",
  "24_months": "24 mois",
  unbounded: "sans limite de temps",
}

const VERDICT_BADGE_CLASS = {
  danger: "border-destructive/40 bg-destructive/15 text-destructive",
  warning: "border-warning/40 bg-warning/15 text-warning",
  success: "border-success/40 bg-success/15 text-success",
} as const

// A <span>, not a <label>: callers nest InfoTooltip's <button> inside, which
// is invalid inside a <label>, and none of these labels are input-associated.
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
      {children}
    </span>
  )
}

/** Slider + linked numeric input for a bounded percentage assumption. */
function RateField({
  label,
  tooltip,
  caption,
  value,
  max,
  step,
  onChange,
}: {
  label: string
  tooltip: { title: string; description: string }
  caption: string
  value: string
  max: number
  step: number
  onChange: (value: string) => void
}) {
  const parsed = parseLocaleNumber(value)
  return (
    <div className="space-y-2">
      <FieldLabel>
        {label}
        <InfoTooltip title={tooltip.title} description={tooltip.description} />
      </FieldLabel>
      <div className="flex items-center gap-3">
        <Slider
          aria-label={label}
          value={[Math.min(Math.max(parsed ?? 0, 0), max)]}
          min={0}
          max={max}
          step={step}
          onValueChange={([v]) => onChange(v.toFixed(2).replace(".", ","))}
        />
        <div className="flex shrink-0 items-center gap-1">
          <Input
            inputMode="decimal"
            aria-label={label}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={cn("h-9 w-20 bg-card text-right", invalidClass(value))}
          />
          <span className="text-sm text-muted-foreground">%</span>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{caption}</p>
    </div>
  )
}

interface ThresholdRowProps {
  label: string
  tooltip: { title: string; description: string }
  value: string
  status?: boolean | null
  caption?: string
}

function ThresholdRow({ label, tooltip, value, status, caption }: ThresholdRowProps) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <FieldLabel>
        {label}
        <InfoTooltip title={tooltip.title} description={tooltip.description} />
      </FieldLabel>
      <div className="text-right">
        <p className="text-sm font-semibold text-foreground">{value}</p>
        {caption && (
          <p
            className={cn(
              "mt-0.5 flex items-center justify-end gap-1 text-xs",
              status === true && "text-success",
              status === false && "text-destructive",
              status == null && "text-muted-foreground",
            )}
          >
            {status === true && <CheckCircle2 className="h-3 w-3" />}
            {status === false && <XCircle className="h-3 w-3" />}
            {caption}
          </p>
        )}
      </div>
    </div>
  )
}

export default function CampagneInfluenceurPage() {
  const [form, setForm] = useState<FormState>(DEFAULTS)
  const [scenarioRates, setScenarioRates] = useState<string[]>(() => SCENARIOS.map((s) => s.defaultRatePct))

  // Results come from a snapshot taken when the user clicks « Valider », not
  // live from the form — same manual-refresh philosophy as the data pages.
  const [submitted, setSubmitted] = useState<CampaignInputs | null>(null)

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  // Pre-fills the assumptions with fresh RevenueCat data: the new → paying
  // conversion rate (last month) and the ARPPU net (realized LTV per paying
  // customer over complete cohorts) — each field keeps its value otherwise.
  const rcMutation = useMutation({
    mutationFn: () => fetchRevenueCatMetrics(),
    onSuccess: (data) => {
      setForm((f) => ({
        ...f,
        installToPaidPct:
          data.installToPaidPct != null
            ? data.installToPaidPct.toFixed(2).replace(".", ",")
            : f.installToPaidPct,
        arpu: data.arppu != null ? data.arppu.toFixed(2).replace(".", ",") : f.arpu,
      }))
    },
  })

  const arpu = parseLocaleNumber(form.arpu)
  const currentInputs = useMemo(() => parseForm(form), [form])
  const isStale = submitted !== null && JSON.stringify(currentInputs) !== JSON.stringify(submitted)

  const results = useMemo(() => (submitted ? computeCampaign(submitted) : null), [submitted])
  const verdict = useMemo(() => (results ? roasVerdict(results.roas) : null), [results])

  const scenarios = useMemo(
    () =>
      submitted === null
        ? []
        : scenarioRates.map((rate, i) => ({
            label: SCENARIOS[i].label,
            results: computeCampaign({ ...submitted, viewToInstallPct: parseLocaleNumber(rate) ?? 0 }),
          })),
    [submitted, scenarioRates],
  )

  const chartData = useMemo(
    () =>
      scenarios.map((s) => ({
        scenario: s.label,
        revenue: Math.round(s.results.revenue * 100) / 100,
        cost: Math.round(s.results.cost * 100) / 100,
      })),
    [scenarios],
  )

  return (
    <div className="flex flex-col">
      <Header
        title="Rentabilité campagne influenceur"
        description="Simulateur — calculs 100 % locaux, rien n'est enregistré"
      />
      <div className="flex-1 space-y-6 p-6">
        {/* Inputs */}
        <div className="grid gap-6 lg:grid-cols-2">
          <ChartCard title="Campagne" description="Données de la campagne à évaluer">
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1">
                  <FieldLabel>Influenceur</FieldLabel>
                  <Input
                    value={form.influencerName}
                    onChange={(e) => set("influencerName", e.target.value)}
                    placeholder="Nom"
                    className="h-9 bg-card"
                  />
                </div>
                <div className="space-y-1">
                  <FieldLabel>Plateforme</FieldLabel>
                  <Input
                    value={form.platform}
                    onChange={(e) => set("platform", e.target.value)}
                    placeholder="TikTok, Instagram…"
                    className="h-9 bg-card"
                  />
                </div>
                <div className="space-y-1">
                  <FieldLabel>Nb de vidéos</FieldLabel>
                  <Input
                    value={form.videoCount}
                    onChange={(e) => set("videoCount", e.target.value)}
                    placeholder="1"
                    className="h-9 bg-card"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <FieldLabel>
                  Nombre de vues estimé
                  <InfoTooltip
                    title="Nombre de vues estimé"
                    description="Utiliser la médiane des vues des 10 dernières vidéos de l'influenceur, idéalement des vidéos sponsorisées."
                  />
                </FieldLabel>
                <Input
                  inputMode="numeric"
                  value={form.views}
                  onChange={(e) => set("views", e.target.value)}
                  className={cn("h-9 bg-card", invalidClass(form.views))}
                />
                <p className="text-xs text-muted-foreground">
                  Total attendu sur l'ensemble des vidéos de la campagne
                </p>
              </div>

              <div className="space-y-2">
                <FieldLabel>Mode de coût</FieldLabel>
                <ToggleGroup
                  type="single"
                  value={form.costMode}
                  onValueChange={(v) => v && set("costMode", v as FormState["costMode"])}
                  className="justify-start"
                >
                  <ToggleGroupItem value="cpm">CPM</ToggleGroupItem>
                  <ToggleGroupItem value="fixed">Prix fixe</ToggleGroupItem>
                </ToggleGroup>
                {form.costMode === "cpm" ? (
                  <div className="space-y-1">
                    <FieldLabel>
                      CPM (€ / 1000 vues)
                      <InfoTooltip
                        title="CPM"
                        description="Prix payé pour 1000 vues. Coût de la campagne = vues / 1000 × CPM."
                      />
                    </FieldLabel>
                    <Input
                      inputMode="decimal"
                      value={form.cpm}
                      onChange={(e) => set("cpm", e.target.value)}
                      className={cn("h-9 bg-card", invalidClass(form.cpm))}
                    />
                  </div>
                ) : (
                  <div className="space-y-1">
                    <FieldLabel>
                      Prix demandé (€)
                      <InfoTooltip
                        title="Prix demandé"
                        description="Prix forfaitaire demandé par l'influenceur pour la campagne."
                      />
                    </FieldLabel>
                    <Input
                      inputMode="decimal"
                      value={form.fixedPrice}
                      onChange={(e) => set("fixedPrice", e.target.value)}
                      className={cn("h-9 bg-card", invalidClass(form.fixedPrice))}
                    />
                    <p className="text-xs text-muted-foreground">
                      CPM effectif : {formatCurrency(currentInputs.views > 0 ? (currentInputs.fixedPrice * 1000) / currentInputs.views : null, 2)}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </ChartCard>

          <ChartCard title="Hypothèses de conversion" description="Métriques ajustables du calcul">
            <div className="space-y-5">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => rcMutation.mutate()}
                    disabled={rcMutation.isPending}
                  >
                    <Download className="mr-2 h-3.5 w-3.5" />
                    {rcMutation.isPending ? "Récupération…" : "Récupérer depuis RevenueCat"}
                  </Button>
                  {rcMutation.data && (
                    <span className="text-xs text-muted-foreground">
                      Données RevenueCat —{" "}
                      {formatDate(new Date(`${rcMutation.data.startDate}T00:00:00`), "MMMM yyyy", {
                        locale: fr,
                      })}
                    </span>
                  )}
                </div>
                {rcMutation.data && rcMutation.data.installToPaidPct != null && (
                  <p className="text-xs text-muted-foreground">
                    {formatNumber(rcMutation.data.newCustomers)} nouvelles utilisatrices →{" "}
                    {formatNumber(rcMutation.data.payingCustomers)} payantes sous{" "}
                    {TIMEFRAME_LABELS[rcMutation.data.conversionTimeframe] ??
                      rcMutation.data.conversionTimeframe}{" "}
                    : {formatPercent(rcMutation.data.installToPaidPct)}
                  </p>
                )}
                {rcMutation.data && rcMutation.data.arppu != null && (
                  <p className="text-xs text-muted-foreground">
                    LTV réalisée / payante (
                    {TIMEFRAME_LABELS[rcMutation.data.arppuLifetime] ?? rcMutation.data.arppuLifetime},{" "}
                    {formatNumber(rcMutation.data.arppuPayingCustomers)} payantes, cohortes complètes) :{" "}
                    {rcMutation.data.netRatio != null
                      ? `${formatCurrency(rcMutation.data.arppuGross, 2)} brut → ${formatCurrency(rcMutation.data.arppu, 2)} net`
                      : `${formatCurrency(rcMutation.data.arppu, 2)} (brut)`}
                  </p>
                )}
                {rcMutation.data?.warning && (
                  <p className="text-xs text-warning">
                    {rcMutation.data.warning} — complétez manuellement si besoin.
                  </p>
                )}
                {rcMutation.isError && (
                  <p className="text-xs text-destructive">
                    Échec RevenueCat : {(rcMutation.error as Error).message}
                  </p>
                )}
              </div>
              <Separator />
              <RateField
                label="Taux vue → installation"
                tooltip={{
                  title: "Taux vue → installation",
                  description:
                    "Part des vues qui deviennent une installation. Installations = vues × ce taux.",
                }}
                caption="Défaut central : 0,20 % (prudent 0,10 %, très bon 0,50 %, exceptionnel 1,00 %)"
                value={form.viewToInstallPct}
                max={2}
                step={0.01}
                onChange={(v) => set("viewToInstallPct", v)}
              />
              <Separator />
              <RateField
                label="Taux installation → payante"
                tooltip={{
                  title: "Taux de conversion payant",
                  description:
                    "Part des installations qui deviennent des utilisatrices payantes. Utilisatrices payantes = installations × ce taux.",
                }}
                caption="Fourchette basse observée : 3 % (RevenueCat, 30 j — juin 3,1 %, juillet 4,4 %)"
                value={form.installToPaidPct}
                max={10}
                step={0.1}
                onChange={(v) => set("installToPaidPct", v)}
              />
              <Separator />
              <div className="space-y-1">
                <FieldLabel>
                  ARPU net par utilisatrice payante (€)
                  <InfoTooltip
                    title="ARPU net par payante (ARPPU)"
                    description="Revenu net généré par une utilisatrice payante sur un horizon fixe. Bonne pratique : LTV réalisée par payante (chart RevenueCat « Realized LTV per Paying Customer », fenêtre 3 mois, remboursements déduits), ramenée en net de commission stores et TVA via le ratio réel proceeds/brut. Ne pas utiliser un ARPU dilué par les utilisatrices gratuites."
                  />
                </FieldLabel>
                <Input
                  inputMode="decimal"
                  aria-label="ARPU net par utilisatrice payante"
                  value={form.arpu}
                  onChange={(e) => set("arpu", e.target.value)}
                  className={cn("h-9 w-32 bg-card", invalidClass(form.arpu))}
                />
                <p className="text-xs text-muted-foreground">
                  Fourchette basse observée : LTV 3 mois ≈ 20,6 € brut × 66 % net ≈ 13,50 € (cohortes
                  complètes mars-mai)
                </p>
              </div>
            </div>
          </ChartCard>
        </div>

        {/* Validate */}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="lg"
            onClick={() => setSubmitted(currentInputs)}
            disabled={arpu === null || arpu < 0}
          >
            <Calculator className="mr-2 h-4 w-4" />
            {submitted ? "Recalculer" : "Valider"}
          </Button>
          {arpu === null || arpu < 0 ? (
            <p className="text-sm text-destructive">
              Renseignez un ARPU net par utilisatrice payante valide pour lancer le calcul.
            </p>
          ) : submitted === null ? (
            <p className="text-sm text-muted-foreground">
              Renseignez les données puis validez pour afficher les résultats.
            </p>
          ) : null}
          {isStale && (
            <p role="status" className="text-sm text-warning">
              Les données ont changé — cliquez sur « Recalculer » pour mettre à jour les résultats.
            </p>
          )}
        </div>

        {results && submitted && (
          // Dimmed when the form no longer matches the submitted snapshot, so
          // frozen verdicts aren't mistaken for live ones.
          <div className={cn("space-y-6", isStale && "opacity-60")}>
            {/* KPIs */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <KpiCard
                label="Coût de la campagne"
                value={euros(results.cost)}
                tooltipTitle="Coût de la campagne"
                tooltipDescription="Vues / 1000 × CPM (ou prix fixe demandé)."
              />
              <KpiCard
                label="Installations"
                value={count(results.installs)}
                variant="info"
                tooltipTitle="Installations estimées"
                tooltipDescription="Vues × taux vue → installation."
              />
              <KpiCard
                label="Utilisatrices payantes"
                value={count(results.payingUsers)}
                variant="info"
                tooltipTitle="Utilisatrices payantes"
                tooltipDescription="Installations × taux installation → payante."
              />
              <KpiCard
                label="Revenus générés"
                value={euros(results.revenue)}
                tooltipTitle="Revenus générés"
                tooltipDescription="Utilisatrices payantes × ARPU net."
              />
              <KpiCard
                label="Profit"
                value={euros(results.profit)}
                variant={results.profit >= 0 ? "success" : "danger"}
                tooltipTitle="Profit"
                tooltipDescription="Revenus générés − coût de la campagne."
              />
              <KpiCard
                label="ROAS"
                value={formatMultiplier(results.roas)}
                variant={verdict ? verdict.variant : "default"}
                tooltipTitle="ROAS"
                tooltipDescription="Revenus générés / coût de la campagne. Rentable à partir de 1."
              />
            </div>

            {/* Verdict */}
            {verdict && (
              <Alert className="border-border bg-card">
                <AlertDescription className="flex flex-wrap items-center gap-3">
                  <Badge variant="outline" className={VERDICT_BADGE_CLASS[verdict.variant]}>
                    {verdict.label}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    ROAS de {formatMultiplier(results.roas)} : {verdict.description}
                  </span>
                </AlertDescription>
              </Alert>
            )}

            {/* Thresholds + chart */}
            <div className="grid gap-6 lg:grid-cols-2">
              <ChartCard title="Seuils de rentabilité" description="Coûts unitaires et limites à ne pas dépasser">
                <div className="flex flex-col">
                  <ThresholdRow
                    label="CPI (coût par installation)"
                    tooltip={{ title: "CPI", description: "Coût de la campagne / nombre d'installations." }}
                    value={formatCurrency(results.cpi, 2)}
                    status={results.cpiIsProfitable}
                    caption={
                      results.cpiIsProfitable == null
                        ? "Doit rester ≤ valeur max d'une installation"
                        : results.cpiIsProfitable
                          ? `≤ ${formatCurrency(results.breakevenCpi, 2)} (valeur max) : OK`
                          : `> ${formatCurrency(results.breakevenCpi, 2)} (valeur max) : trop cher`
                    }
                  />
                  <Separator />
                  <ThresholdRow
                    label="CAC payant"
                    tooltip={{
                      title: "CAC payant",
                      description: "Coût de la campagne / nombre d'utilisatrices payantes.",
                    }}
                    value={formatCurrency(results.cacPaying, 2)}
                  />
                  <Separator />
                  <ThresholdRow
                    label="Valeur max d'une installation"
                    tooltip={{
                      title: "Valeur maximale d'une installation",
                      description:
                        "Taux payant × ARPU net. Le CPI doit être inférieur ou égal à cette valeur pour atteindre le seuil de rentabilité.",
                    }}
                    value={formatCurrency(results.breakevenCpi, 2)}
                  />
                  <Separator />
                  <ThresholdRow
                    label="CPM max rentable"
                    tooltip={{
                      title: "CPM maximal rentable",
                      description: "1000 × taux vue → installation × taux payant × ARPU net.",
                    }}
                    value={formatCurrency(results.maxProfitableCpm, 2)}
                    status={
                      results.effectiveCpm == null ? null : results.effectiveCpm <= results.maxProfitableCpm
                    }
                    caption={
                      results.effectiveCpm == null
                        ? undefined
                        : `CPM actuel : ${formatCurrency(results.effectiveCpm, 2)}`
                    }
                  />
                  <Separator />
                  <ThresholdRow
                    label="Taux vue → install. nécessaire"
                    tooltip={{
                      title: "Taux vue → installation nécessaire",
                      description:
                        "CPM / (1000 × taux payant × ARPU net) : taux minimal pour que la campagne soit rentable.",
                    }}
                    value={formatPercent(results.requiredViewToInstallPct)}
                    status={
                      results.requiredViewToInstallPct == null
                        ? null
                        : submitted.viewToInstallPct >= results.requiredViewToInstallPct
                    }
                    caption={
                      results.requiredViewToInstallPct == null
                        ? undefined
                        : `Taux actuel : ${formatPercent(submitted.viewToInstallPct)}`
                    }
                  />
                  <Separator />
                  <ThresholdRow
                    label="Installations nécessaires"
                    tooltip={{
                      title: "Installations nécessaires",
                      description: "Vues × taux vue → installation nécessaire pour atteindre la rentabilité.",
                    }}
                    value={formatNumber(results.requiredInstalls)}
                  />
                </div>
              </ChartCard>

              <ChartCard
                title="Revenus vs coût par scénario"
                description="La campagne est rentable quand la barre des revenus dépasse celle du coût"
              >
                <BarChart
                  data={chartData}
                  xKey="scenario"
                  yKey="revenue"
                  compareKey="cost"
                  mainLabel="Revenus"
                  compareLabel="Coût"
                  color="#3B82F6"
                  compareColor="#FFB020"
                />
              </ChartCard>
            </div>

            {/* Scenario table */}
            <ChartCard
              title="Scénarios de taux vue → installation"
              description="Le coût est identique dans tous les scénarios — seuls les taux (éditables) changent"
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Indicateur</TableHead>
                    {scenarios.map((s, i) => (
                      <TableHead key={s.label} className="text-right">
                        <div className="flex flex-col items-end gap-1 py-1">
                          <span>{s.label}</span>
                          <div className="flex items-center gap-1">
                            <Input
                              inputMode="decimal"
                              aria-label={`Taux vue → installation ${s.label}`}
                              value={scenarioRates[i]}
                              onChange={(e) =>
                                setScenarioRates((rates) => rates.map((r, j) => (j === i ? e.target.value : r)))
                              }
                              className={cn("h-7 w-16 bg-card text-right text-xs", invalidClass(scenarioRates[i]))}
                            />
                            <span className="text-xs text-muted-foreground">%</span>
                          </div>
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="text-muted-foreground">Installations</TableCell>
                    {scenarios.map((s) => (
                      <TableCell key={s.label} className="text-right font-medium">
                        {count(s.results.installs)}
                      </TableCell>
                    ))}
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground">Utilisatrices payantes</TableCell>
                    {scenarios.map((s) => (
                      <TableCell key={s.label} className="text-right font-medium">
                        {count(s.results.payingUsers)}
                      </TableCell>
                    ))}
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground">Revenus</TableCell>
                    {scenarios.map((s) => (
                      <TableCell key={s.label} className="text-right font-medium">
                        {euros(s.results.revenue)}
                      </TableCell>
                    ))}
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground">Coût</TableCell>
                    {scenarios.map((s) => (
                      <TableCell key={s.label} className="text-right font-medium">
                        {euros(s.results.cost)}
                      </TableCell>
                    ))}
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground">Profit</TableCell>
                    {scenarios.map((s) => (
                      <TableCell
                        key={s.label}
                        className={cn(
                          "text-right font-medium",
                          s.results.profit >= 0 ? "text-success" : "text-destructive",
                        )}
                      >
                        {euros(s.results.profit)}
                      </TableCell>
                    ))}
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground">ROAS</TableCell>
                    {scenarios.map((s) => {
                      const v = roasVerdict(s.results.roas)
                      return (
                        <TableCell
                          key={s.label}
                          className={cn(
                            "text-right font-medium",
                            v?.variant === "success" && "text-success",
                            v?.variant === "warning" && "text-warning",
                            v?.variant === "danger" && "text-destructive",
                          )}
                        >
                          {formatMultiplier(s.results.roas)}
                        </TableCell>
                      )
                    })}
                  </TableRow>
                </TableBody>
              </Table>
            </ChartCard>
          </div>
        )}
      </div>
    </div>
  )
}
