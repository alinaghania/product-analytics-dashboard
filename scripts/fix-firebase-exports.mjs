import fs from "node:fs"
import path from "node:path"

const cwd = process.cwd()
const firebaseRoot = path.join(cwd, "node_modules", "firebase")
const targets = [
  {
    file: path.join(firebaseRoot, "app", "dist", "index.mjs"),
    source: 'export * from "./esm/index.esm.js"\n',
  },
  {
    file: path.join(firebaseRoot, "auth", "dist", "index.mjs"),
    source: 'export * from "./esm/index.esm.js"\n',
  },
  {
    file: path.join(firebaseRoot, "firestore", "dist", "index.mjs"),
    source: 'export * from "./esm/index.esm.js"\n',
  },
  {
    file: path.join(cwd, "node_modules", "@firebase", "firestore", "dist", "index.node.mjs"),
    source: 'export * from "./index.esm.js"\n',
  },
  {
    file: path.join(cwd, "node_modules", "@firebase", "firestore", "dist", "lite", "index.node.mjs"),
    source: 'export * from "./index.browser.esm.js"\n',
  },
]

let wrote = 0
for (const target of targets) {
  const file = target.file
  const source = target.source
  try {
    const dir = path.dirname(file)
    if (!fs.existsSync(dir)) continue
    const existing = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : ""
    if (existing === source) continue
    fs.writeFileSync(file, source, "utf8")
    wrote += 1
  } catch (err) {
    console.warn("[fix-firebase-exports] Skipped", file, String(err))
  }
}

if (wrote > 0) {
  console.log(`[fix-firebase-exports] Created ${wrote} missing index.mjs file(s).`)
}
