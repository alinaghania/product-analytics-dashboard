import * as fs from "fs"
import * as path from "path"

// The fields of a Google service-account JSON key that the dashboard reads.
export interface ServiceAccountKey {
  project_id?: string
  client_email: string
  private_key: string
}

// The service-account key, when one is configured: FIREBASE_SERVICE_ACCOUNT
// (inline JSON) first, then SERVICE_ACCOUNT_PATH (a file, local dev). Returns
// null when neither is set — on Cloud Run the dashboard runs keyless.
export function readServiceAccountKey(): ServiceAccountKey | null {
  const inlineJson = process.env.FIREBASE_SERVICE_ACCOUNT
  if (inlineJson) {
    try {
      return JSON.parse(inlineJson)
    } catch {
      throw new Error("Failed to parse FIREBASE_SERVICE_ACCOUNT env var as JSON")
    }
  }

  const filePath = process.env.SERVICE_ACCOUNT_PATH
  if (filePath) {
    const resolved = path.resolve(filePath)
    if (!fs.existsSync(resolved)) {
      throw new Error(`Service account file not found: ${resolved}`)
    }
    return JSON.parse(fs.readFileSync(resolved, "utf-8"))
  }

  return null
}

// Cloud Run sets K_SERVICE in every container. Application Default Credentials
// are only trusted there (they come from the service's runtime identity): on a
// laptop, ADC may belong to an unrelated account and project, which would
// silently query the wrong database.
export function isCloudRun(): boolean {
  return Boolean(process.env.K_SERVICE)
}
