// netlify/functions/analyze.js
// Secure Claude API proxy — your API key never reaches the browser

exports.handler = async (event) => {
  // CORS headers — restrict to your domain in production
  const headers = {
    'Access-Control-Allow-Origin': '*', // change to 'https://yourdomain.netlify.app'
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { type, sev, addr, city, desc, lang } = JSON.parse(event.body || '{}');

    const isFr = lang === 'fr';
    const prompt = isFr
      ? `Tu es un analyste d'infrastructure routière municipale pour la région Ottawa-Gatineau, Canada.
Un citoyen a signalé: Type=${type}, Gravité=${sev}, Adresse="${addr}", Ville=${city}, Description="${desc}".
Réponds UNIQUEMENT avec ce JSON (sans markdown ni préambule):
{"analysis":"3 phrases: cause, urgence, impact sécurité","urgency":"ex: 1-3 jours","department":"département responsable","tags":["tag1","tag2","tag3"],"riskScore":0-100}`
      : `You are a municipal road infrastructure analyst for the Ottawa-Gatineau region, Canada.
A citizen reported: Type=${type}, Severity=${sev}, Location="${addr}", City=${city}, Description="${desc}".
Respond ONLY with this JSON (no markdown, no preamble):
{"analysis":"3 sentences: cause, urgency, safety impact","urgency":"e.g. 1-3 days","department":"responsible city dept","tags":["tag1","tag2","tag3"],"riskScore":0-100}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = await response.json();
    const raw = data.content?.map(b => b.text || '').join('') || '{}';
    const clean = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    return { statusCode: 200, headers, body: JSON.stringify(parsed) };

  } catch (err) {
    console.error('Analyze function error:', err);
    // Return a safe fallback so the UI doesn't break
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        analysis: 'Analysis unavailable. Please report this issue to 311 with photos and a detailed description.',
        urgency: 'Contact 311',
        department: 'City of Ottawa / Ville de Gatineau — 311',
        tags: ['Road Issue', '311 Report', 'Ottawa-Gatineau'],
        riskScore: 50,
      }),
    };
  }
};
