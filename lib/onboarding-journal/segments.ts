import { UNKNOWN, branchLabel, langLabel, osLabel, platformLabel } from "./labels"
import {
  AGE_BANDS,
  ageBand,
  answerLabel,
  finishedOnboarding,
  hasAccount,
  median,
  onboardingMs,
  type CohortJourney,
} from "./report"
import type { OnboardingDataset } from "./types"

// The same tunnel, cut by who the person is and what she uses: which groups
// finish the onboarding, create an account, subscribe.

export interface SegmentRow {
  label: string
  journeys: number
  completed: number
  registered: number
  subscribed: number
  /** Median foreground time to finish the onboarding, for those who finished. */
  medianCompletionMs: number | null
}

export interface SegmentDimension {
  key: string
  title: string
  /** What to keep in mind when reading the rows. */
  note?: string
  rows: SegmentRow[]
}

interface Dimension {
  key: string
  title: string
  note?: string
  /** Group of a journey; undefined = unknown for that journey. */
  groupOf: (journey: CohortJourney) => string | undefined
  /** Label of the journeys without a group. */
  unknown: string
  /** Fixed order of the groups; by size otherwise. */
  order?: string[]
}

/** Fields of the registration form: how the person heard about Endora, and her birth year. */
const SOURCE_FIELD = "acquisitionSource"
const BIRTH_YEAR_FIELD = "birthYear"

/** The screen that fills a field of the registration form, when the dataset has it. */
const screenIdOfField = (dataset: OnboardingDataset, field: string): string | undefined =>
  Object.keys(dataset.screens).find((id) => dataset.screens[id].field === field)

/**
 * What a journey answered for a field of the registration form, with the
 * screen it answered on. Once the journal has the visit of that screen, only
 * an answer validated there counts, as in the Answers tab: the form also keeps
 * a value that was picked and never validated. Without that visit (journal
 * that starts later, screen missing from the catalog), the form as last saved
 * is all there is.
 */
function formAnswer(journey: CohortJourney, dataset: OnboardingDataset, field: string): { value: unknown; screenId?: string } {
  const visit = journey.steps.find((step) => dataset.screens[step.id]?.field === field)
  return visit ? { value: visit.answer, screenId: visit.id } : { value: journey.answers[field], screenId: screenIdOfField(dataset, field) }
}

/** How the person heard about Endora, in the words of the option she picked. */
export function acquisitionSource(journey: CohortJourney, dataset: OnboardingDataset): string | undefined {
  const { value, screenId } = formAnswer(journey, dataset, SOURCE_FIELD)
  if (typeof value !== "string" || value === "") return undefined
  return screenId ? answerLabel(dataset, screenId, value) : value
}

/** Age band of the person, from the birth year she gave. */
export const ageGroup = (journey: CohortJourney, dataset: OnboardingDataset): string | undefined =>
  ageBand(formAnswer(journey, dataset, BIRTH_YEAR_FIELD).value, journey.startedAt)

const NO_ANSWER = "Sans réponse"
const LEFT_BEFORE_QUESTION = "« Sans réponse » : parties avant d'y répondre, ou question passée."

const SCREEN_SIZES = ["Compact (< 380 pt)", "Standard (380–419 pt)", "Grand (≥ 420 pt)"]
const FONT_SIZES = ["Réduite", "Standard", "Agrandie", "Très agrandie"]
const LAUNCHES = ["D'une traite", "En plusieurs fois"]

function screenSize(width: number | undefined): string | undefined {
  if (width === undefined) return undefined
  if (width < 380) return SCREEN_SIZES[0]
  return width < 420 ? SCREEN_SIZES[1] : SCREEN_SIZES[2]
}

function fontSize(scale: number | undefined): string | undefined {
  if (scale === undefined) return undefined
  if (scale < 0.95) return FONT_SIZES[0]
  if (scale <= 1.05) return FONT_SIZES[1]
  return scale <= 1.3 ? FONT_SIZES[2] : FONT_SIZES[3]
}

/** A platform, version or language the digest could read. */
const known = (value: string): string | undefined => (value === UNKNOWN ? undefined : value)

function dimensions(dataset: OnboardingDataset): Dimension[] {
  const sourceScreenId = screenIdOfField(dataset, SOURCE_FIELD)
  const sourceQuestion = sourceScreenId ? `Réponse à « ${dataset.screens[sourceScreenId].title} ». ` : ""
  return [
    {
      key: "branch",
      title: "Parcours",
      note: "« Sans parcours » : parties avant de le choisir.",
      groupOf: (journey) => (journey.branch ? branchLabel(journey.branch) : undefined),
      unknown: "Sans parcours",
    },
    {
      key: "source",
      title: "Source d'acquisition",
      note: `${sourceQuestion}${LEFT_BEFORE_QUESTION}`,
      groupOf: (journey) => acquisitionSource(journey, dataset),
      unknown: NO_ANSWER,
    },
    {
      key: "age",
      title: "Âge",
      note: `D'après l'année de naissance. ${LEFT_BEFORE_QUESTION}`,
      groupOf: (journey) => ageGroup(journey, dataset),
      unknown: NO_ANSWER,
      order: AGE_BANDS,
    },
    {
      key: "lang",
      title: "Langue",
      groupOf: (journey) => known(journey.lang) && langLabel(journey.lang),
      unknown: "Inconnue",
    },
    { key: "version", title: "Version de l'app", groupOf: (journey) => known(journey.appVersion), unknown: "Inconnue" },
    {
      key: "platform",
      title: "Plateforme",
      groupOf: (journey) => known(journey.platform) && platformLabel(journey.platform),
      unknown: "Inconnue",
    },
    {
      key: "os",
      title: "Version du système",
      note: "iOS : version majeure. Android : niveau d'API (34 = Android 14).",
      groupOf: (journey) => (journey.device.os ? osLabel(journey.platform, journey.device.os, "major") : undefined),
      unknown: "Inconnue",
    },
    {
      key: "screen",
      title: "Taille d'écran",
      note: "Largeur de l'écran en points : 375 pt pour un iPhone SE ou mini, 390 à 402 pt pour un iPhone standard, 430 pt et plus pour un Plus ou un Max.",
      groupOf: (journey) => screenSize(journey.device.width),
      unknown: "Inconnue",
      order: SCREEN_SIZES,
    },
    {
      key: "font",
      title: "Taille de police du téléphone",
      note: "Réglage d'accessibilité du téléphone : une police agrandie peut casser la mise en page d'un écran.",
      groupOf: (journey) => fontSize(journey.device.fontScale),
      unknown: "Inconnue",
      order: FONT_SIZES,
    },
    {
      key: "launches",
      title: "Parcours d'une traite ou en plusieurs fois",
      note: "« En plusieurs fois » : l'app a été rouverte au moins une fois pendant l'onboarding.",
      groupOf: (journey) => LAUNCHES[journey.launches > 1 ? 1 : 0],
      unknown: "Inconnu",
      order: LAUNCHES,
    },
  ]
}

function rowOf(label: string, journeys: CohortJourney[]): SegmentRow {
  const finished = journeys.filter(finishedOnboarding)
  return {
    label,
    journeys: journeys.length,
    completed: finished.length,
    registered: journeys.filter(hasAccount).length,
    subscribed: journeys.filter((journey) => journey.outcome === "subscribed").length,
    medianCompletionMs: median(finished.map(onboardingMs)),
  }
}

export function buildSegments(journeys: CohortJourney[], dataset: OnboardingDataset): SegmentDimension[] {
  return dimensions(dataset).map(({ key, title, note, groupOf, unknown, order }) => {
    const groups = new Map<string, CohortJourney[]>()
    for (const journey of journeys) {
      const label = groupOf(journey) ?? unknown
      const group = groups.get(label)
      if (group) group.push(journey)
      else groups.set(label, [journey])
    }
    // The unknown group last; otherwise the fixed order when there is one, else the biggest group first.
    const position = (label: string) => {
      if (label === unknown) return Number.MAX_SAFE_INTEGER
      return order ? order.indexOf(label) : 0
    }
    const rows = [...groups]
      .map(([label, members]) => rowOf(label, members))
      .sort((a, b) => position(a.label) - position(b.label) || b.journeys - a.journeys)
    return { key, title, note, rows }
  })
}
