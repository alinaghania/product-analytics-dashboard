/**
 * Set Firebase custom claim { admin: true } for the UID in .env
 *
 * This script grants admin access to the Firestore database for the analytics dashboard.
 * After running this script, the user must sign out and sign back in for the claim to take effect.
 *
 * Prerequisites:
 *   1. Add ADMIN_UID or NEXT_PUBLIC_ADMIN_UIDS to your .env.local file
 *   2. Add SERVICE_ACCOUNT_PATH to your .env.local pointing to your Firebase service account JSON
 *
 * Usage:
 *   npm i firebase-admin dotenv
 *   node firebase/setAdmin.js
 *
 * After running:
 *   1. Deploy rules: firebase deploy --only firestore:rules
 *   2. User must sign out of the dashboard
 *   3. User must sign back in to get the new claim
 */

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");
const dotenv = require("dotenv");

const envPath = fs.existsSync(".env.local") ? ".env.local" : ".env";
dotenv.config({ path: envPath });

const uidRaw = process.env.ADMIN_UID || process.env.NEXT_PUBLIC_ADMIN_UIDS;
const uid = uidRaw ? uidRaw.split(",").map((s) => s.trim()).filter(Boolean)[0] : "";
const serviceAccountPath = process.env.SERVICE_ACCOUNT_PATH;

if (!uid) {
  console.error("❌ Missing ADMIN_UID or NEXT_PUBLIC_ADMIN_UIDS in .env(.local)");
  process.exit(1);
}

if (!serviceAccountPath) {
  console.error("❌ Missing SERVICE_ACCOUNT_PATH in .env(.local)");
  process.exit(1);
}

const absPath = path.isAbsolute(serviceAccountPath)
  ? serviceAccountPath
  : path.join(process.cwd(), serviceAccountPath);

if (!fs.existsSync(absPath)) {
  console.error("❌ Service account JSON not found at:", absPath);
  process.exit(1);
}

const serviceAccount = require(absPath);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

admin
  .auth()
  .setCustomUserClaims(uid, { admin: true })
  .then(() => admin.auth().getUser(uid))
  .then((user) => {
    console.log("✅ Admin claim set for:", user.uid);
    console.log("Custom claims now:", user.customClaims || {});
    process.exit(0);
  })
  .catch((e) => {
    console.error("❌ Failed to set admin claim:", e);
    process.exit(1);
  });
