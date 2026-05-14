#!/usr/bin/env node
/**
 * scripts/import-issues.js
 *
 * Usage:
 *   node scripts/import-issues.js /path/to/service-account.json data/issues.json
 *
 * The data file should be a JSON array of objects with fields matching the app schema:
 * [
 *   {
 *     "id": 123456,
 *     "type": "pothole",
 *     "sev": "high",
 *     "city": "Ottawa",
 *     "lat": 45.4,
 *     "lng": -75.7,
 *     "addr": "123 Rideau St",
 *     "desc": "Large pothole",
 *     "votes": 0,
 *     "resolve_votes": 0,
 *     "resolved": false,
 *     "created_at": "2026-05-14T12:00:00Z"
 *   }
 * ]
 */

const fs = require('fs');
const admin = require('firebase-admin');

async function main() {
  const [,, saPath, dataPath] = process.argv;
  if (!saPath || !dataPath) {
    console.error('Usage: node scripts/import-issues.js /path/to/service-account.json data/issues.json');
    process.exit(2);
  }
  if (!fs.existsSync(saPath)) { console.error('Service account file not found:', saPath); process.exit(3); }
  if (!fs.existsSync(dataPath)) { console.error('Data file not found:', dataPath); process.exit(4); }

  const sa = require(saPath);
  admin.initializeApp({ credential: admin.credential.cert(sa) });
  const db = admin.firestore();

  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  if (!Array.isArray(data)) { console.error('Data file must be a JSON array'); process.exit(5); }

  console.log(`Importing ${data.length} issues...`);
  let count = 0;
  for (const item of data) {
    try {
      const id = String(item.id || Date.now());
      const payload = Object.assign({}, item, {
        id: Number(id),
        votes: item.votes || 0,
        resolve_votes: item.resolve_votes || 0,
        resolved: !!item.resolved,
        created_at: item.created_at || new Date().toISOString(),
      });
      await db.collection('issues').doc(id).set(payload);
      count++;
      if (count % 50 === 0) console.log(`Imported ${count}...`);
    } catch (e) {
      console.error('Failed to import item', item && item.id, e.message || e);
    }
  }
  console.log(`Done. Imported ${count} issues.`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
