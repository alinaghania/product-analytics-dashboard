// Regenerates lib/onboarding-journal/catalog.json: for every onboarding screen
// of the mobile app, the text shown, its type and its options. The Onboarding
// page uses it to show "Comment souhaites-tu qu'Endora t'appelle ?" instead of
// "U3". Run it again whenever the app's onboarding changes; a screen missing
// from the catalog still shows up on the page, under its raw id.
//
//   node scripts/generate-onboarding-catalog.mjs <path to a lotus-mobile checkout>
//
// The screens are built by the app's own flow builders, so the dump runs under
// the mobile repo's Jest setup: scripts/onboarding-catalog/dump-catalog.test.ts
// is copied into the checkout for the run, then removed. Nothing else is
// touched there.
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const source = path.join(root, "scripts/onboarding-catalog/dump-catalog.test.ts")
const output = path.join(root, "lib/onboarding-journal/catalog.json")

const mobileArg = process.argv[2]
if (!mobileArg) {
  console.error("Usage: node scripts/generate-onboarding-catalog.mjs <path to a lotus-mobile checkout>")
  process.exit(1)
}
const mobile = path.resolve(mobileArg)
const testsDir = path.join(mobile, "src/onboarding/__tests__")
if (!fs.existsSync(path.join(mobile, "src/onboarding/flowConfig.ts")) || !fs.existsSync(testsDir)) {
  console.error(`Not a lotus-mobile checkout: ${mobile}`)
  process.exit(1)
}

// A git worktree of the app has no node_modules of its own: Jest is the one of
// the closest parent directory that has it.
function findJest(from) {
  for (let dir = from; ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, "node_modules/.bin/jest")
    if (fs.existsSync(candidate)) return candidate
    if (dir === path.dirname(dir)) return null
  }
}
const jest = findJest(mobile)
if (!jest) {
  console.error(`Jest not found from ${mobile}: run "npm ci" in the lotus-mobile checkout first.`)
  process.exit(1)
}

const copy = path.join(testsDir, "zzDumpOnboardingCatalog.test.ts")
// However the script ends, Ctrl-C included, the copy leaves the mobile checkout.
process.on("exit", () => fs.rmSync(copy, { force: true }))
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => process.exit(130))

fs.copyFileSync(source, copy)
const { status } = spawnSync(jest, [path.relative(mobile, copy)], {
  cwd: mobile,
  stdio: "inherit",
  env: { ...process.env, ONBOARDING_CATALOG_OUT: output },
})

if (status === 0) {
  const { steps } = JSON.parse(fs.readFileSync(output, "utf-8"))
  console.log(`${Object.keys(steps).length} screens written to ${path.relative(root, output)}`)
}
process.exit(status ?? 1)
