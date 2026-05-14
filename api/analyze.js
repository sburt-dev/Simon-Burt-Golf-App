const PROMPT = `You are an expert PGA-level golf coach reviewing a sequence of 8 frames extracted from a golfer's swing video.

Analyze the swing carefully and return your response in the following JSON structure (and ONLY this JSON — no markdown fences, no extra text):

{
  "summary": "One or two sentence overall impression of the swing.",
  "sections": {
    "stance":    { "rating": "Good|Average|Needs Work", "feedback": "detailed paragraph", "tips": ["tip1","tip2"] },
    "grip":      { "rating": "Good|Average|Needs Work", "feedback": "detailed paragraph", "tips": ["tip1","tip2"] },
    "backswing": { "rating": "Good|Average|Needs Work", "feedback": "detailed paragraph", "tips": ["tip1","tip2"] },
    "downswing": { "rating": "Good|Average|Needs Work", "feedback": "detailed paragraph", "tips": ["tip1","tip2"] },
    "impact":    { "rating": "Good|Average|Needs Work", "feedback": "detailed paragraph", "tips": ["tip1","tip2"] },
    "follow":    { "rating": "Good|Average|Needs Work", "feedback": "detailed paragraph", "tips": ["tip1","tip2"] }
  }
}

Be specific and actionable. Reference what you can actually observe in the frames. If a phase isn't clearly visible, say so and give general guidance.`;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not configured on the server.' });
  }

  const { frames } = req.body || {};
  if (!Array.isArray(frames) || frames.length === 0) {
    return res.status(400).json({ error: 'No frames provided.' });
  }

  const imageContent = frames.map(dataURL => {
    const [header, b64] = dataURL.split(',');
    const mediaType = header.includes('jpeg') ? 'image/jpeg' : 'image/png';
    return { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } };
  });

  let anthropicRes;
  try {
    anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        messages: [{ role: 'user', content: [...imageContent, { type: 'text', text: PROMPT }] }],
      }),
    });
  } catch (err) {
    return res.status(502).json({ error: `Failed to reach Anthropic: ${err.message}` });
  }

  if (!anthropicRes.ok) {
    const body = await anthropicRes.json().catch(() => ({}));
    return res.status(anthropicRes.status).json({
      error: body.error?.message || `Anthropic API error ${anthropicRes.status}`,
    });
  }

  const data = await anthropicRes.json();
  const result = data.content?.[0]?.text ?? '';
  return res.status(200).json({ result });
};

module.exports.config = {
  api: {
    bodyParser: { sizeLimit: '12mb' },
  },
};
