#!/usr/bin/env node
/**
 * scripts/normalize-issues.js
 *
 * Usage:
 *   node scripts/normalize-issues.js /path/to/service-account.json
 *
 * This script scans the `issues` collection and renames fields to match the
 * frontend's expected schema (desc -> description, sev -> severity).
 */

const admin = require('firebase-admin');
const fs = require('fs');

async function main() {
  const [,, saPath] = process.argv;
  if (!saPath) { console.error('Usage: node scripts/normalize-issues.js /path/to/service-account.json'); process.exit(2); }
  if (!fs.existsSync(saPath)) { console.error('Service account file not found:', saPath); process.exit(3); }
  const sa = require(saPath);
  admin.initializeApp({ credential: admin.credential.cert(sa) });
  const db = admin.firestore();

  const snap = await db.collection('issues').get();
  console.log(`Found ${snap.size} documents in issues`);
  let updated = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    const updates = {};
    if ('desc' in data && !('description' in data)) updates.description = data.desc;
    if ('sev' in data && !('severity' in data)) updates.severity = data.sev;
    // Convert string numbers to actual numbers where needed
    if (data.votes && typeof data.votes === 'string') updates.votes = Number(data.votes) || 0;
    if (data.resolve_votes && typeof data.resolve_votes === 'string') updates.resolve_votes = Number(data.resolve_votes) || 0;
    if (Object.keys(updates).length) {
      await doc.ref.update(updates);
      updated++;
      if (updated % 50 === 0) console.log(`Updated ${updated} documents...`);
    }
  }
  console.log(`Done. Updated ${updated} documents.`);
  process.exit(0);
}

main().catch(err=>{ console.error(err); process.exit(1); });
