/**
 * Human-readable labels for the onboarding selections stored in
 * `users/{uid}.registrationData`.
 *
 * Endora's mobile onboarding (lotus-mobile/src/onboarding) persists each choice
 * as a raw machine code (e.g. `suivre_evolution`, `endo_confirmed`). These maps
 * mirror the app's English i18n (lotus-mobile/src/locales/onboarding/en.json) so
 * the dashboard shows the same wording the user saw, keyed by the stored code.
 *
 * Generated from en.json + the step configs (universal.ts, troncCommunFin.ts,
 * sharedSteps.ts, cycleBloc.ts, cycleSuivi.ts, endoDiagnosed.ts). Codes that
 * aren't in a map (older legacy values, French free-text, branch-specific
 * symptoms) fall back to `labelize()`, which humanizes snake_case codes and
 * leaves already-readable text untouched.
 */

/**
 * U4_SOURCE — acquisitionSource (single select): "How did you hear about Endora?"
 * Mirrors lotus-mobile/src/locales/onboarding/en.json (U4_SOURCE.options).
 */
export const ACQUISITION_SOURCE_LABELS: Record<string, string> = {
  appstore: "App Store",
  google: "Google search",
  friends: "Friends or family",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  youtube: "YouTube or TV",
  influencer: "Influencer or celebrity",
  medical: "Healthcare professional",
  other: "Other",
  prefer_not: "Prefer not to say",
}

// ── V4 intent / preference selections ("what people want") ──────────────────

/** U5 — primaryObjective (single select) */
export const PRIMARY_OBJECTIVE_LABELS: Record<string, string> = {
  suspect: "Better understand what I experience",
  diagnosed: "Track my endo / adeno / PCOS",
  treatment: "Track my treatment / post-surgery",
  fertility: "Baby project",
  cycle: "Track my bleeding / cycle",
  menopause: "Perimenopause / menopause",
}

/** U5b — situationsConcerned (the parcours / situation chosen) */
export const SITUATION_LABELS: Record<string, string> = {
  endo_confirmed: "Diagnosed endometriosis",
  adeno_confirmed: "Diagnosed adenomyosis",
  endo_adeno: "Diagnosed endo + adenomyosis",
  endo_suspected: "Suspected endometriosis / symptoms",
  cycle_suivi: "Track my periods / cycle",
  sopk_confirmed: "Diagnosed PCOS",
  sopk_endo: "Diagnosed PCOS + endometriosis",
  baby_project: "Baby project / IVF",
  baby_endo: "Baby project + endometriosis",
  baby_sopk: "Baby project + PCOS",
  fibro_confirmed: "Diagnosed fibromyalgia",
  menopause_situation: "Perimenopause / menopause",
  menopause_endo: "Menopause + endometriosis",
  congestion_pelvienne: "Diagnosed pelvic congestion",
}

/** TCF_EXPECTATIONS — appExpectationsV2 (what they expect from Endora) */
export const APP_EXPECTATIONS_V2_LABELS: Record<string, string> = {
  suivre_evolution: "Better track the evolution of my symptoms",
  identifier_aliments: "Identify foods that may worsen my symptoms",
  comprendre_corps: "Better understand my body",
  conseils_personnalises: "Receive personalized advice to improve my daily life",
  apprendre_pathologie: "Learn more about my condition and my body",
  comprendre_facteurs: "Understand factors that worsen symptoms (sleep, activity, cycle)",
}

/** *_REMINDERS — reminderPreferences */
export const REMINDER_PREFERENCES_LABELS: Record<string, string> = {
  personalized_advice: "Yes — to receive personalized advice",
  symptom_evolution: "Yes — to understand symptom evolution",
  change_alerts: "Yes — to be alerted on change / worsening",
  understand_body: "Yes — to understand my body, cycle & condition",
  none: "No, not right now",
}

/** SH_TRACKING_PRIORITIES / ED14 / SC10 — trackingPriorities (what they want to track) */
export const TRACKING_PRIORITIES_LABELS: Record<string, string> = {
  symptoms: "Symptoms (pain, fatigue, digestion...)",
  cycle: "Cycle (periods, ovulation, variations)",
  sleep: "Sleep (duration, quality)",
  food_hydration: "Diet & hydration",
  activity: "Physical activity",
  mood_energy: "Mood / energy",
  intimate_health: "Health & intimate life",
  treatments: "Treatments / medications",
  solutions: "Use of solutions (TENS, heat, etc.)",
  recovery: "Recovery (after flare or procedure)",
}

/** SC2 — cycleTrackingGoals */
export const CYCLE_TRACKING_GOALS_LABELS: Record<string, string> = {
  period_arrival: "Know when my periods arrive",
  premenstrual_symptoms: "Understand what comes back before my periods",
  regularity: "See if my cycles are regular or not",
  treatment_effect: "Track the effect of a treatment / contraception",
  fertile_days: "Spot my fertile days / ovulation",
  bleeding_spotting: "Track my bleeding / spotting",
  understand_symptoms: "Better understand my symptoms",
  appointment_record: "Keep a record for an appointment",
  know_cycle: "Just better know my cycle",
}

/** SHARED_TIMING — symptomTiming (when symptoms appear) */
export const SYMPTOM_TIMING_LABELS: Record<string, string> = {
  before_periods: "A few days before my periods",
  during_periods: "During my periods",
  after_periods: "Just after my periods",
  around_ovulation: "Around ovulation",
  all_month: "Throughout the month",
  no_cycle_link: "No clear link to my cycle",
  bowel_movement: "When I have a bowel movement",
  urinate_bladder: "When I urinate / bladder is full",
  intercourse: "During or after intercourse",
  bloating: "When I am bloated",
  after_meals: "After meals",
  stress: "During stressful periods",
  lack_of_sleep: "When I lack sleep",
  movement_position: "When I move or change position",
  no_clear_factor: "No clear factor",
  dont_know: "I don't know",
}

/** ED6 — mainSymptoms (symptoms that bother them most) */
export const MAIN_SYMPTOMS_LABELS: Record<string, string> = {
  painful_periods: "Significant period pain",
  heavy_periods: "Heavy periods",
  long_periods: "Long periods",
  irregular_cycle: "Irregular cycle",
  intermenstrual_bleeding: "Bleeding between periods",
  chronic_pelvic: "Pelvic pain outside of periods",
  back_pain: "Lower back pain",
  leg_pain: "Leg pain",
  ovulation_pain: "Pain during ovulation",
  chronic_daily_pain: "Chronic pain (almost daily)",
  dyspareunia: "Painful intercourse",
  post_coital_pain: "Pain after intercourse",
  low_libido: "Reduced libido",
  bloating: "Bloating / swollen belly",
  dyschezia: "Pain when having a bowel movement",
  bowel_issues: "Constipation / diarrhea",
  nausea: "Nausea",
  dysuria: "Pain when urinating",
  frequency: "Frequent need to urinate",
  pelvic_pressure: "Feeling of pelvic pressure",
  fatigue: "Significant fatigue",
  acne: "Acne",
  weight_gain: "Weight gain",
  hair_loss: "Hair loss",
  mood_anxiety: "Mood swings / anxiety",
  sleep_issues: "Sleep issues",
}

/** ED9 — whatWeighsMost (what weighs most on daily life) */
export const WHAT_WEIGHS_MOST_LABELS: Record<string, string> = {
  painful_periods: "Period pain",
  pelvic_pain: "Pelvic pain outside of periods",
  ovulation_pain: "Pain during ovulation",
  back_pain: "Lower back pain",
  leg_pain: "Leg pain",
  diffuse_pain: "Diffuse or chronic pain",
  intense_flares: "Very intense pain flares",
  heavy_periods: "Heavy periods",
  long_periods: "Long periods",
  intermenstrual_bleeding: "Bleeding between periods",
  irregular_cycle: "Irregular cycle",
  no_periods: "Absence of periods",
  unpredictable_periods: "Unpredictable periods",
  bloating: "Bloating / swollen belly",
  belly_heaviness: "Feeling of heaviness in the belly",
  pelvic_pressure: "Feeling of pressure in the lower abdomen",
  digestive_pain: "Digestive pain",
  dyschezia: "Pain when having a bowel movement",
  constipation: "Constipation",
  diarrhea: "Diarrhea",
  alternating_bowel: "Alternating constipation / diarrhea",
  nausea: "Nausea",
  dysuria: "Pain when urinating",
  urinary_frequency: "Frequent urge to urinate",
  bladder_pressure: "Feeling of pressure on the bladder",
  recurrent_urinary: "Recurrent urinary discomfort",
  dyspareunia: "Pain during intercourse",
  post_coital_pain: "Pain after intercourse",
  low_libido: "Reduced desire",
  fear_pain_intercourse: "Apprehension about intercourse due to pain",
  fatigue: "Significant fatigue",
  post_period_fatigue: "Fatigue after periods",
  post_flare_fatigue: "Fatigue after a flare-up",
  work_impact: "Difficulty working or studying",
  social_impact: "Impact on my social life",
  need_to_slow_down: "Need to slow down daily",
  mood_swings: "Mood swings / irritability",
  anxiety: "Anxiety / mental load",
  sleep_issues: "Sleep issues",
  acne: "Acne / oilier skin",
  weight_gain: "Weight gain",
  hair_loss: "Hair loss / thinner hair",
  hirsutism: "Excessive hair growth",
  fertility_difficulty: "Difficulty getting pregnant",
  baby_project: "The baby project / fertility",
  ovulation_tracking: "Tracking ovulation",
  fertility_uncertainty: "Uncertainty about my fertility",
  end_of_day_pain: "Pain that worsens at the end of the day",
  standing_pain: "Pain that worsens when standing",
  lying_relief: "Pain relieved by lying down",
  pelvic_heaviness: "Feeling of pelvic heaviness",
}

// ── Health-profile selections (mostly V4 codes, some legacy text) ───────────

/** ED1 — endoTypes / endometriosisTypes (V4 codes; legacy docs store FR/EN text directly) */
export const ENDO_TYPES_LABELS: Record<string, string> = {
  superficial: "Superficial (peritoneal)",
  ovarian: "Ovarian (endometrioma)",
  deep: "Deep (infiltrating)",
  multiple: "Multiple types",
  not_specified: "Not specified",
  dont_know: "I don't know",
}

/** hasEndometriosis */
export const HAS_ENDOMETRIOSIS_LABELS: Record<string, string> = {
  yes: "Yes",
  suspected: "Suspected",
  no: "No",
}

/**
 * Legacy free-text normalizers (FR → EN) for fields that were never coded.
 * These mirror the maps that previously lived inline on the onboarding page.
 */
export const LIFE_STAGE_LABELS: Record<string, string> = {
  "Gestion endométriose/OPK": "Endometriosis/PCOS management",
  "Suivi des règles": "Period tracking",
  "Suivi de la contraception": "Birth control monitoring",
  "Planification de grossesse": "Pregnancy planning",
  "Suivi de la ménopause": "Menopause tracking",
}

export const PERIOD_FREQUENCY_LABELS: Record<string, string> = {
  "Tous les mois": "Every month",
  Irrégulier: "Irregular",
  "Toutes les 3 semaines": "Every 3 weeks",
  "Toutes les 2 semaines": "Every 2 weeks",
  "Toutes les 5 semaines": "Every 5 weeks",
}

// ── Helper ──────────────────────────────────────────────────────────────────

/** A pure lowercase snake_case / single-token machine code, e.g. `food_hydration`. */
const SNAKE_CASE_CODE = /^[a-z0-9]+(?:_[a-z0-9]+)*$/

/**
 * Resolve a stored code to a display label.
 *  1. Exact match in `map` → the app's i18n label.
 *  2. A snake_case machine code with no mapping → humanized ("food_hydration" → "Food hydration").
 *  3. Anything else (already-readable FR/EN text) → returned unchanged.
 */
export function labelize(map: Record<string, string>, code: string): string {
  if (map[code]) return map[code]
  if (SNAKE_CASE_CODE.test(code)) {
    return code.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())
  }
  return code
}
