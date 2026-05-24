// Builds a context string describing what each frame likely shows,
// then constructs a detailed coaching prompt.
function buildPrompt(frameLabels) {
  const frameContext = frameLabels
    .map((label, i) => `  Frame ${i + 1}: ${label}`)
    .join('\n');

  return `You are a PGA-certified golf instructor with 25+ years of coaching experience. \
You are analyzing ${frameLabels.length} sequential frames extracted from a golfer's swing video.

FRAME SEQUENCE:
${frameContext}

INSTRUCTIONS:
- Be highly specific. Reference actual frame numbers and what you observe (body angles, club position, alignment).
- If a phase is partially visible or unclear, say so, then give the most relevant guidance you can.
- Identify the 2 most impactful changes this golfer should make — the ones that will cascade into the biggest improvement.
- Also note genuine strengths so they know what NOT to change.

TECHNICAL STANDARDS TO EVALUATE AGAINST:

STANCE & SETUP: Foot width shoulder-width for irons (slightly wider for driver). Weight 50/50 for \
irons, slight tilt away for woods. Forward hip hinge ~30–45°, soft knee flex. Arms hanging relaxed \
directly under shoulders. Feet/hips/shoulders parallel to target line. Ball position center for \
short irons, progressing toward lead heel for longer clubs.

GRIP: Lead hand grips through base of fingers (not palm). V between lead thumb/forefinger points \
toward trail shoulder. Trail hand covers lead thumb; trail V matches lead. Pressure 4–6/10 — firm \
in last three fingers of lead hand, relaxed everywhere else. Watch for overly strong (hooked) or \
weak (faded/sliced) grip positions.

BACKSWING: First 12 inches: club tracks inside, arm triangle preserved. Hip turn ~45°. Shoulder \
turn ~90° (lead shoulder under chin). Lead arm relatively straight. Weight loads into trail hip — \
no lateral sway. Wrist hinge completes by hands reaching hip height. At the top: club shaft \
ideally parallel to ground and pointing at target. Check for over-swing, laid-off, or across-the-line positions.

DOWNSWING & TRANSITION: Lower body initiates — hips bump toward target then rotate BEFORE \
shoulders fire. Trail elbow drops toward trail hip (not "over the top"). Wrist lag preserved deep \
into downswing. Shoulders stay closed while hips open (X-factor stretch). Watch for casting, \
early extension, and over-the-top path.

IMPACT: Hands ahead of ball — forward shaft lean is critical for ball striking. Hips open 30–45°. \
80%+ weight on lead foot. Head remains behind ball. Trail heel elevating. For irons: ball-then-turf \
contact (divot after ball). Clubface square to path at moment of contact.

FOLLOW-THROUGH: Full arm extension post-impact (no chicken-wing). Club path toward target. Chest \
faces target. Full weight on lead side. Balanced finish with trail toe barely touching ground and \
belt buckle facing target (or slightly left for right-handers).

RETURN ONLY VALID JSON — no markdown fences, no extra text:
{
  "summary": "2–3 sentences. Be specific about what you observe and the single biggest opportunity.",
  "skill_level": "Beginner|Intermediate|Advanced|Competitive",
  "strengths": [
    "Specific strength 1 — reference the relevant frame(s) and what you see",
    "Specific strength 2 — reference the relevant frame(s) and what you see"
  ],
  "priority_improvements": [
    "Most impactful fix: explain the fault, why it matters, and the cue to correct it",
    "Second most impactful fix: same detail"
  ],
  "sections": {
    "stance":    { "rating": "Good|Average|Needs Work", "observations": "What you see in the setup frames", "feedback": "Technical coaching explanation referencing specific frames", "tips": ["Actionable tip 1", "Actionable tip 2"], "drill": "One specific drill to improve this element" },
    "grip":      { "rating": "Good|Average|Needs Work", "observations": "...", "feedback": "...", "tips": ["...", "..."], "drill": "..." },
    "backswing": { "rating": "Good|Average|Needs Work", "observations": "...", "feedback": "...", "tips": ["...", "..."], "drill": "..." },
    "downswing": { "rating": "Good|Average|Needs Work", "observations": "...", "feedback": "...", "tips": ["...", "..."], "drill": "..." },
    "impact":    { "rating": "Good|Average|Needs Work", "observations": "...", "feedback": "...", "tips": ["...", "..."], "drill": "..." },
    "follow":    { "rating": "Good|Average|Needs Work", "observations": "...", "feedback": "...", "tips": ["...", "..."], "drill": "..." }
  }
}`;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not configured on the server.' });
  }

  const { frames, frameLabels } = req.body || {};
  if (!Array.isArray(frames) || frames.length === 0) {
    return res.status(400).json({ error: 'No frames provided.' });
  }

  const labels = Array.isArray(frameLabels) && frameLabels.length === frames.length
    ? frameLabels
    : frames.map((_, i) => `Frame ${i + 1}`);

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
        max_tokens: 3500,
        messages: [{
          role: 'user',
          content: [...imageContent, { type: 'text', text: buildPrompt(labels) }],
        }],
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
    bodyParser: { sizeLimit: '16mb' },
  },
};
