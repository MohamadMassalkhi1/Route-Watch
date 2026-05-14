const admin = require('firebase-admin');

let db = null;

function initAdmin() {
  if (db) return db;
  if (!process.env.FIREBASE_ADMIN_JSON) throw new Error('FIREBASE_ADMIN_JSON not set');
  const sa = JSON.parse(process.env.FIREBASE_ADMIN_JSON);
  admin.initializeApp({ credential: admin.credential.cert(sa) });
  db = admin.firestore();
  return db;
}

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json' };
  try {
    const firestore = initAdmin();
    const method = event.httpMethod;
    const path = event.path || '';

    if (method === 'GET') {
      // GET /.netlify/functions/firestore-admin?op=list&limit=100
      const op = (event.queryStringParameters && event.queryStringParameters.op) || 'list';
      if (op === 'list') {
        const limit = parseInt(event.queryStringParameters.limit || '100', 10);
        const snap = await firestore.collection('issues').orderBy('created_at','desc').limit(limit).get();
        const issues = snap.docs.map(d => d.data());
        return { statusCode: 200, headers, body: JSON.stringify({ issues }) };
      }
    }

    if (method === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const op = body.op || (body.type ? 'create' : null);

      if (op === 'create') {
        const issue = body.issue;
        if (!issue) return { statusCode: 400, headers, body: JSON.stringify({ error: 'missing issue' }) };
        const id = String(issue.id || Date.now());
        const payload = Object.assign({}, issue, { id: Number(id), created_at: new Date().toISOString() });
        await firestore.collection('issues').doc(id).set(payload);
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, issue: payload }) };
      }

      if (op === 'incVotes') {
        const id = String(body.id);
        if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'missing id' }) };
        const ref = firestore.collection('issues').doc(id);
        await firestore.runTransaction(async t => {
          const doc = await t.get(ref);
          if (!doc.exists) throw new Error('not found');
          const next = (doc.data().votes || 0) + 1;
          t.update(ref, { votes: next });
        });
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
      }

      if (op === 'incResolve') {
        const id = String(body.id);
        const threshold = parseInt(body.threshold || process.env.RESOLVE_THRESHOLD || '50', 10);
        if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'missing id' }) };
        const ref = firestore.collection('issues').doc(id);
        await firestore.runTransaction(async t => {
          const doc = await t.get(ref);
          if (!doc.exists) throw new Error('not found');
          const data = doc.data();
          const next = (data.resolve_votes || 0) + 1;
          const updates = { resolve_votes: next };
          if (next >= threshold) updates.resolved = true;
          t.update(ref, updates);
        });
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
      }
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'unsupported' }) };
  } catch (err) {
    console.error('firestore-admin error', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message || String(err) }) };
  }
};
