import type { PermissionKind } from "./types"

// Wording of the Onboarding page for the codes found in the journal. Safe to
// import from the browser (the screens' own texts come with the dataset).

/** Pseudo-step of the sign-up screen, logged by the app's RegisterScreen. */
export const REGISTER_STEP_ID = "REGISTER"

/** First version of the mobile app that writes the journal. */
export const JOURNAL_SINCE_VERSION = "0.1.12"

/** What the digest puts in place of a platform, version or language it could not read. */
export const UNKNOWN = "unknown"

/** Parcours (`registrationBranch`) chosen on "Quelle situation te correspond le mieux ?". */
const BRANCH_LABELS: Record<string, string> = {
  endoDiagnosed: "Endométriose diagnostiquée",
  adenoDiagnosed: "Adénomyose diagnostiquée",
  endoAdeno: "Endométriose + adénomyose",
  endoSuspected: "Endométriose suspectée",
  cycleSuivi: "Suivi du cycle",
  sopkDiagnosed: "SOPK diagnostiqué",
  sopkEndo: "SOPK + endométriose",
  babyProject: "Projet bébé",
  fibroDiagnosed: "Fibromyalgie",
  menopauseV4: "Ménopause",
  menopauseEndo: "Ménopause + endométriose",
  congestionPelvienne: "Congestion pelvienne",
}

const STEP_TYPE_LABELS: Record<string, string> = {
  personalizedMessage: "Message",
  languageSelector: "Langue",
  textInput: "Texte libre",
  consent: "Consentement",
  birthYearWheel: "Année",
  yearPicker: "Année",
  datePicker: "Date",
  singleSelectExpand: "Choix unique",
  multiSelectExpand: "Choix multiple",
  gridSelect: "Choix",
  productTour: "Présentation",
  preNotification: "Notifications",
  healthPermission: "Données santé",
  program: "Programme",
  register: "Inscription",
}

/** How a screen was left (`via` of step_leave). */
const EXIT_LABELS: Record<string, string> = {
  next: "Suivant",
  back: "Retour arrière",
  skip: "Passer",
  complete: "Validé",
  auto: "Avance automatique",
  replace: "Avance automatique",
  blur: "Écran quitté",
  unmount: "Sortie de l'onboarding",
  [UNKNOWN]: "Inconnu",
}

const REGISTER_METHOD_LABELS: Record<string, string> = {
  apple: "Apple",
  google: "Google",
  email: "E-mail",
  existing_session: "Déjà connectée",
}

/** `detail` of register_error: the app's own codes, or a raw Firebase Auth code. */
const REGISTER_ERROR_LABELS: Record<string, string> = {
  missing_fields: "Champs manquants",
  invalid_email: "E-mail invalide",
  weak_password: "Mot de passe trop court",
  password_mismatch: "Mots de passe différents",
  email_change_failed: "Changement d'e-mail impossible",
  save_failed: "Enregistrement du compte échoué",
  signInFailed: "Connexion impossible",
  accountConflict: "Un compte existe déjà avec cet e-mail",
  alreadyInProgress: "Connexion déjà en cours",
  notReady: "Service indisponible",
  platformUnavailable: "Méthode indisponible sur l'appareil",
  exception: "Erreur technique",
  other: "Autre erreur",
  [UNKNOWN]: "Erreur inconnue",
  "auth/email-already-in-use": "E-mail déjà utilisé",
  "auth/network-request-failed": "Pas de réseau",
  "auth/too-many-requests": "Trop de tentatives",
}

const PAYWALL_RESULT_LABELS: Record<string, string> = {
  purchased: "Abonnement pris",
  restored: "Achat restauré",
  cancelled: "Paywall fermé",
  already_premium: "Déjà premium",
  not_presented: "Non présenté",
  error: "Erreur",
}

const PERMISSION_RESULT_LABELS: Record<string, string> = {
  granted: "Acceptée",
  denied: "Refusée dans la fenêtre du système",
  skipped: "« Pas maintenant »",
  already_granted: "Déjà accordée",
}

// Health data: iOS never tells what was chosen in its sheet. There, "granted"
// only says the sheet was shown, and "denied" that the request did not go
// through; "skipped" is also what the app logs when it skips the screen
// because the phone has no health data to share.
const HEALTH_RESULT_LABELS: Record<string, string> = {
  denied: "Non accordée",
  skipped: "Écran passé",
}

const CONSENT_LABELS: Record<string, string> = {
  healthData: "Données de santé",
  termsAndPrivacy: "CGU et confidentialité",
  marketing: "E-mails d'offres",
  aiDataSharing: "Partage avec l'IA",
  cloudBackup: "Sauvegarde des documents dans le cloud",
  secondaryUse: "Réutilisation des données",
}

const CONSENT_LINK_LABELS: Record<string, string> = {
  privacy: "Politique de confidentialité",
  terms: "CGU",
}

const PLATFORM_LABELS: Record<string, string> = { ios: "iOS", android: "Android", [UNKNOWN]: "Plateforme inconnue" }
const LANG_LABELS: Record<string, string> = { fr: "Français", en: "Anglais", [UNKNOWN]: "Langue inconnue" }

const labelFrom = (labels: Record<string, string>) => (code: string) => labels[code] ?? code

export const branchLabel = labelFrom(BRANCH_LABELS)
export const stepTypeLabel = labelFrom(STEP_TYPE_LABELS)
export const exitLabel = labelFrom(EXIT_LABELS)
export const registerMethodLabel = labelFrom(REGISTER_METHOD_LABELS)
export const paywallResultLabel = labelFrom(PAYWALL_RESULT_LABELS)
export const consentLabel = labelFrom(CONSENT_LABELS)
export const consentLinkLabel = labelFrom(CONSENT_LINK_LABELS)
export const platformLabel = labelFrom(PLATFORM_LABELS)
export const langLabel = labelFrom(LANG_LABELS)

export const versionLabel = (version: string): string => (version === UNKNOWN ? "Version inconnue" : `Version ${version}`)

/** Result of a permission screen, in the words that hold for that permission. */
export const permissionResultLabel = (result: string, kind: PermissionKind): string =>
  (kind === "health" ? HEALTH_RESULT_LABELS[result] : undefined) ?? PERMISSION_RESULT_LABELS[result] ?? result

/** A sign-up error as the digest keeps it, "<method>:<code>", in words: "Champs manquants (E-mail)". */
export function registerErrorLabel(error: string): string {
  const separator = error.indexOf(":")
  const method = error.slice(0, separator)
  const code = error.slice(separator + 1)
  return `${REGISTER_ERROR_LABELS[code] ?? code} (${registerMethodLabel(method)})`
}

/**
 * System version of a phone. The app logs React Native's `Platform.Version`:
 * the iOS version ("27.2.1"), but on Android the API level ("34").
 */
export function osLabel(platform: string, osVersion: string | undefined, precision: "major" | "full" = "full"): string {
  if (!osVersion) return platformLabel(platform)
  if (platform === "android") return `Android API ${osVersion}`
  return `${platformLabel(platform)} ${precision === "major" ? osVersion.split(".")[0] : osVersion}`
}
