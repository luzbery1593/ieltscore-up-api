const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const FormData = require('form-data');
const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// ── CORS ────────────────────────────────────────────────────
// Configure ALLOWED_ORIGINS in Railway as a comma-separated list, e.g.:
// ALLOWED_ORIGINS=https://ieltscoreup.com,https://www.ieltscoreup.com
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

if (allowedOrigins.length === 0) {
  console.warn('⚠️  ALLOWED_ORIGINS no está configurado — CORS permitirá cualquier origen. Configura esta variable en Railway antes de salir a producción.');
}

app.use(cors({
  origin: allowedOrigins.length === 0
    ? true
    : function (origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        callback(new Error('Not allowed by CORS'));
      }
}));

app.use(express.json({ limit: '2mb' }));

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// ── RATE LIMITING ──────────────────────────────────────────────
// General cap for every /api/ route (protects against abuse/scraping)
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again in a few minutes.' }
});

// Tighter cap specifically for endpoints that call Anthropic/OpenAI (real cost per call)
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many AI requests. Please wait a few minutes and try again.' }
});

app.use('/api/', generalLimiter);

// ── HELPERS ────────────────────────────────────────────────────
function logError(context, e) {
  console.error(`[${context}]`, e);
}

function sendError(res, context, e, status = 500) {
  logError(context, e);
  res.status(status).json({ error: 'Something went wrong. Please try again.' });
}

function parseAIJson(text) {
  return JSON.parse(text.trim().replace(/```json|```/g, '').trim());
}

function missingFields(body, fields) {
  return fields.filter(f => body[f] === undefined || body[f] === null || body[f] === '');
}

async function saveSession(payload) {
  const { error } = await supabase.from('sessions').insert(payload);
  if (error) logError('saveSession', error);
}

// ── HEALTH CHECK ──────────────────────────────────────────────
app.get('/', (req, res) => res.json({ status: 'IELTScoreUp API running' }));

// ── AUTH MIDDLEWARE ───────────────────────────────────────────
async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return res.status(401).json({ error: 'Invalid token' });
  req.user = data.user;
  next();
}

// ── WRITING EVALUATION (quality-critical → Sonnet) ─────────────
app.post('/api/writing/evaluate', requireAuth, aiLimiter, async (req, res) => {
  const { essay, prompt, taskType, testType } = req.body;
  const missing = missingFields(req.body, ['essay', 'prompt', 'taskType', 'testType']);
  if (missing.length) return res.status(400).json({ error: `Missing fields: ${missing.join(', ')}` });
  if (typeof essay !== 'string' || essay.trim().length < 20) {
    return res.status(400).json({ error: 'Essay is too short to evaluate' });
  }

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      system: `You are an expert IELTS examiner. Evaluate IELTS Writing ${taskType} (${testType}) and return ONLY JSON:
{
  "overall": "7.0",
  "task_achievement": "7.0",
  "coherence_cohesion": "6.5",
  "lexical_resource": "7.0",
  "grammatical_range": "6.5",
  "strengths": "2-3 specific sentences about what the student did well.",
  "improvements": "2-3 sentences with specific weaknesses from the essay.",
  "corrected_example": "Take one weak sentence and rewrite it better.",
  "next_steps": "2-3 actionable steps to improve."
}
Band scores: 1.0-9.0 in 0.5 increments. Be honest and specific.`,
      messages: [{ role: 'user', content: `Task: ${taskType} (${testType})\nPrompt: ${prompt}\nEssay:\n${essay}` }]
    });

    const result = parseAIJson(message.content[0].text);

    await saveSession({
      user_id: req.user.id,
      module: 'writing',
      subtype: `${taskType} ${testType}`,
      band: parseFloat(result.overall)
    });

    res.json(result);
  } catch (e) {
    sendError(res, 'writing/evaluate', e);
  }
});

// ── GENERATE WRITING PROMPT (content generation → Haiku) ──────
app.post('/api/writing/generate-prompt', requireAuth, aiLimiter, async (req, res) => {
  const { taskType, testType } = req.body;
  const missing = missingFields(req.body, ['taskType', 'testType']);
  if (missing.length) return res.status(400).json({ error: `Missing fields: ${missing.join(', ')}` });

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: `You are an IELTS examiner. Generate a realistic IELTS Writing ${taskType} prompt for ${testType}. Return ONLY JSON:
{
  "prompt": "Full prompt text exactly as it would appear in the exam",
  "time": "20 minutes",
  "minWords": 150
}
Make it varied — use different topics each time. Never repeat common examples.`,
      messages: [{ role: 'user', content: `Generate a new ${taskType} ${testType} writing prompt. Be creative and use a topic not commonly seen.` }]
    });

    const result = parseAIJson(message.content[0].text);
    res.json(result);
  } catch (e) {
    sendError(res, 'writing/generate-prompt', e);
  }
});

// ── GENERATE READING PASSAGE ──────────────────────────────────
const READING_TOPICS_AC = ['the evolution of urban farming','deep-sea mining and ocean ecosystems','the neuroscience of sleep','how biomimicry shapes modern engineering','the economics of circular economy','dark tourism and its ethics','quantum computing basics','how cartography shaped civilisation','the science of habit formation','rewilding and apex predators','satellite technology in agriculture','linguistic relativity theory','nanotechnology in medicine','the psychology of colour in architecture','ancient water management systems'];
const READING_TOPICS_GT = ['renting your first flat','applying for a driving licence','community volunteering','workplace health and safety','choosing health insurance','how libraries serve digital communities','starting a small business','consumer rights when returning goods','registering children for school','personal budgeting basics'];

app.post('/api/reading/generate', requireAuth, aiLimiter, async (req, res) => {
  const { testType, difficulty } = req.body;
  const missing = missingFields(req.body, ['testType']);
  if (missing.length) return res.status(400).json({ error: `Missing fields: ${missing.join(', ')}` });

  const topicList = testType === 'Academic' ? READING_TOPICS_AC : READING_TOPICS_GT;
  const topic = topicList[Math.floor(Math.random() * topicList.length)];

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1800,
      system: `You are an IELTS examiner. Generate an IELTS ${testType} Reading passage with questions. Return ONLY valid JSON, no markdown:
{"title":"Passage title","passage":"Passage of 380-420 words. Use HTML <p> tags. Start each paragraph with <span class='para-lbl'>A</span> <span class='para-lbl'>B</span> etc. Formal style with specific facts.","questions":[{"type":"tfng","text":"Statement","answer":"TRUE"},{"type":"mcq","text":"Question","options":["A. opt","B. opt","C. opt","D. opt"],"answer":"B. opt"},{"type":"fill","text":"Complete: The _____ was...","answer":"word"}]}
Include exactly 8 questions: 3 tfng, 3 mcq, 2 fill. All answers must come directly from the passage. Level: ${difficulty || 'B2'}.`,
      messages: [{ role: 'user', content: `Write a ${testType} reading passage about: ${topic}` }]
    });

    const result = parseAIJson(message.content[0].text);
    res.json(result);
  } catch (e) {
    sendError(res, 'reading/generate', e);
  }
});

// ── READING EXPLANATIONS (feedback → Sonnet) ───────────────────
app.post('/api/reading/explain', requireAuth, aiLimiter, async (req, res) => {
  const { passage, questions, userAnswers } = req.body;
  const missing = missingFields(req.body, ['passage', 'questions', 'userAnswers']);
  if (missing.length || !Array.isArray(questions) || !Array.isArray(userAnswers)) {
    return res.status(400).json({ error: 'passage, questions (array) and userAnswers (array) are required' });
  }

  try {
    const qText = questions.map((q, i) => {
      const ua = userAnswers[i];
      const isCorrect = q.type === 'fill'
        ? (ua || '').toLowerCase() === (q.answer || '').toLowerCase()
        : ua === q.answer;
      return `Q${i + 1}: ${q.text}\nCorrect: ${q.answer}\nStudent: ${ua}\nResult: ${isCorrect ? 'CORRECT' : 'WRONG'}`;
    }).join('\n\n');

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1200,
      system: `You are an IELTS Reading tutor. Explain each answer referencing the passage. Return ONLY JSON array:
[{"q": 1, "correct": true, "explanation": "2 sentences max referencing paragraph letter."}]`,
      messages: [{ role: 'user', content: `Passage:\n${passage}\n\nResults:\n${qText}` }]
    });

    const result = parseAIJson(message.content[0].text);

    const correct = userAnswers.filter((a, i) => {
      const q = questions[i];
      if (!q) return false;
      return q.type === 'fill' ? (a || '').toLowerCase() === (q.answer || '').toLowerCase() : a === q.answer;
    }).length;

    await saveSession({
      user_id: req.user.id,
      module: 'reading',
      score_raw: correct,
      score_total: questions.length
    });

    res.json(result);
  } catch (e) {
    sendError(res, 'reading/explain', e);
  }
});

// ── GENERATE LISTENING ────────────────────────────────────────
const LISTENING_TOPICS = {
  1: ['student booking a campus gym induction','customer calling to cancel a hotel reservation','new resident enquiring about council bin collection','caller registering for a community first-aid course','patient booking a follow-up appointment at a clinic'],
  2: ['tour guide welcoming visitors to a science museum','college orientation talk for new students','council officer presenting a new cycling lane scheme','park ranger describing a wildlife conservation area','library manager explaining new digital services'],
  3: ['two students planning a research project on food waste','tutor and student reviewing essay feedback','three students dividing tasks for a business case study','student and advisor discussing final year module choices','two classmates comparing fieldwork data on urban birds'],
  4: ['lecture on the history of ancient trade routes','talk on the neuroscience of decision-making','lecture on fast fashion and water pollution','academic presentation on vertical city design','talk on nanotechnology in modern medicine']
};

const LISTENING_SECTION_GUIDE = {
  1: 'Conversation between two people. Use [Name]: dialogue format. Include specific names, numbers, dates in the answers.',
  2: 'Monologue by one speaker. Include specific facts, numbers and sequences.',
  3: 'Conversation between 2-3 people in academic context. Use [Name]: dialogue format.',
  4: 'Academic lecture by one speaker. Formal register with technical vocabulary and examples.'
};

app.post('/api/listening/generate', requireAuth, aiLimiter, async (req, res) => {
  const section = parseInt(req.body.section, 10);
  if (![1, 2, 3, 4].includes(section)) {
    return res.status(400).json({ error: 'section must be 1, 2, 3 or 4' });
  }

  const scenarios = LISTENING_TOPICS[section];
  const scenario = scenarios[Math.floor(Math.random() * scenarios.length)];

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      system: `You are an IELTS Listening examiner writing a Section ${section} audio script. Return ONLY valid JSON, no markdown:
{"title":"Short title","description":"One sentence","badge":"e.g. Everyday conversation · 2 speakers","speakers":[{"name":"Name","accent":"british","gender":"female"}],"transcript":"${LISTENING_SECTION_GUIDE[section]} 220-260 words. Natural spoken English with contractions.","questions":[{"type":"fill","text":"The surname is _____.","answer":"exact word from transcript"},{"type":"mcq","text":"Question?","options":["A. option","B. option","C. option","D. option"],"answer":"A. option"}]}
Include exactly 5 questions (3 fill, 2 mcq). Every answer must come directly from the transcript.`,
      messages: [{ role: 'user', content: `Write a Section ${section} listening exercise about: ${scenario}` }]
    });

    const result = parseAIJson(message.content[0].text);
    res.json(result);
  } catch (e) {
    sendError(res, 'listening/generate', e);
  }
});

// ── SAVE LISTENING RESULTS (no AI call, just scoring + tracking) ─
app.post('/api/listening/results', requireAuth, async (req, res) => {
  const { questions, userAnswers } = req.body;
  const missing = missingFields(req.body, ['questions', 'userAnswers']);
  if (missing.length || !Array.isArray(questions) || !Array.isArray(userAnswers)) {
    return res.status(400).json({ error: 'questions (array) and userAnswers (array) are required' });
  }

  try {
    const correct = userAnswers.filter((a, i) => {
      const q = questions[i];
      if (!q) return false;
      return q.type === 'fill' ? (a || '').toLowerCase() === (q.answer || '').toLowerCase() : a === q.answer;
    }).length;

    await saveSession({
      user_id: req.user.id,
      module: 'listening',
      score_raw: correct,
      score_total: questions.length
    });

    res.json({ correct, total: questions.length });
  } catch (e) {
    sendError(res, 'listening/results', e);
  }
});

// ── TEXT TO SPEECH ────────────────────────────────────────────
app.post('/api/tts', requireAuth, aiLimiter, async (req, res) => {
  const { text, voice } = req.body;
  if (!text) return res.status(400).json({ error: 'No text provided' });

  const voiceMap = {
    british_female: 'nova',
    british_male: 'onyx',
    australian_female: 'shimmer',
    american_male: 'echo',
    american_female: 'alloy'
  };

  const selectedVoice = voiceMap[voice] || 'nova';

  try {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text.substring(0, 4096),
        voice: selectedVoice,
        speed: 0.92
      })
    });

    if (!response.ok) {
      logError('tts', await response.text());
      return res.status(500).json({ error: 'Audio generation failed' });
    }

    const audioBuffer = await response.arrayBuffer();
    res.set('Content-Type', 'audio/mpeg');
    res.set('Cache-Control', 'no-store');
    res.send(Buffer.from(audioBuffer));
  } catch (e) {
    sendError(res, 'tts', e);
  }
});

// ── SPEAKING EVALUATION (quality-critical → Sonnet) ────────────
app.post('/api/speaking/evaluate', requireAuth, aiLimiter, async (req, res) => {
  const { response, question, part } = req.body;
  const missing = missingFields(req.body, ['response', 'question', 'part']);
  if (missing.length) return res.status(400).json({ error: `Missing fields: ${missing.join(', ')}` });

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      system: `You are an expert IELTS Speaking examiner. Evaluate Part ${part} and return ONLY JSON:
{
  "overall": "6.5",
  "fluency_coherence": "6.5",
  "lexical_precision": "7.0",
  "grammatical_range": "6.0",
  "pronunciation_note": "6.5",
  "strengths": "2-3 specific sentences about what they did well.",
  "improvements": "2-3 sentences with specific issues from their response.",
  "example": "Rewrite part of their response showing better vocabulary and grammar.",
  "vocabulary": ["word or phrase 1", "word or phrase 2", "word or phrase 3", "word or phrase 4"],
  "next_steps": "2 actionable things to practise."
}
Be honest, specific, and reference their actual response.`,
      messages: [{ role: 'user', content: `Part ${part} question: ${question}\n\nStudent response:\n${response}` }]
    });

    const result = parseAIJson(message.content[0].text);

    await saveSession({
      user_id: req.user.id,
      module: 'speaking',
      subtype: `Part ${part}`,
      band: parseFloat(result.overall)
    });

    res.json(result);
  } catch (e) {
    sendError(res, 'speaking/evaluate', e);
  }
});

// ── GENERATE SPEAKING QUESTIONS (content generation → Haiku) ──
const SPEAKING_PART_DESCRIPTIONS = {
  1: 'Introduction and interview — personal questions about familiar topics (hometown, work, hobbies, daily routine)',
  2: 'Individual long turn — cue card with topic and 4 bullet points to speak about for 1-2 minutes',
  3: 'Two-way discussion — abstract questions related to the Part 2 topic'
};

app.post('/api/speaking/generate', requireAuth, aiLimiter, async (req, res) => {
  const part = parseInt(req.body.part, 10);
  if (![1, 2, 3].includes(part)) {
    return res.status(400).json({ error: 'part must be 1, 2 or 3' });
  }

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: `You are an IELTS examiner. Generate a Part ${part} speaking question. Return ONLY JSON.
${part === 1 ? '{"question": "Question text", "sub": "Follow-up or clarification"}' : ''}
${part === 2 ? '{"topic": "Describe a...", "bullets": ["point 1", "point 2", "point 3", "point 4"], "note": "You will have 1 minute to prepare..."}' : ''}
${part === 3 ? '{"question": "Abstract discussion question", "sub": "Optional follow-up"}' : ''}
Use fresh, varied topics. Never repeat common IELTS examples.`,
      messages: [{ role: 'user', content: `Generate a new Part ${part} speaking ${SPEAKING_PART_DESCRIPTIONS[part]}. Be creative.` }]
    });

    const result = parseAIJson(message.content[0].text);
    res.json(result);
  } catch (e) {
    sendError(res, 'speaking/generate', e);
  }
});

// ── GRAMMAR GENERATE (content generation → Haiku) ──────────────
app.post('/api/grammar/generate', requireAuth, aiLimiter, async (req, res) => {
  const { level, topic } = req.body;
  const missing = missingFields(req.body, ['level', 'topic']);
  if (missing.length) return res.status(400).json({ error: `Missing fields: ${missing.join(', ')}` });

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      system: `You are an IELTS Grammar expert. Generate 5 grammar exercises for ${level} level on the topic "${topic}". Return ONLY JSON array:
[
  {"type": "mcq", "point": "Grammar point name", "text": "Sentence with blank _____.", "options": ["A","B","C","D"], "answer": "B"},
  {"type": "fill", "point": "Grammar point name", "text": "Complete: She _____ (work) here since 2019.", "answer": "has worked"},
  {"type": "error", "point": "Grammar point name", "sentence": "Full sentence with one error here.", "error": "error word/phrase", "answer": "corrected word/phrase"}
]
Mix all 3 types. Make exercises relevant to IELTS contexts. Be varied and avoid common textbook examples.`,
      messages: [{ role: 'user', content: `Generate 5 fresh ${level} grammar exercises on ${topic}. Use academic/professional contexts.` }]
    });

    const result = parseAIJson(message.content[0].text);
    res.json(result);
  } catch (e) {
    sendError(res, 'grammar/generate', e);
  }
});

// ── GRAMMAR AI REPORT (feedback → Sonnet) ──────────────────────
app.post('/api/grammar/report', requireAuth, aiLimiter, async (req, res) => {
  const { level, topic, correct, total } = req.body;
  const missing = missingFields(req.body, ['level', 'topic', 'correct', 'total']);
  if (missing.length) return res.status(400).json({ error: `Missing fields: ${missing.join(', ')}` });

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      system: `You are an IELTS Grammar expert. Return ONLY JSON:
{
  "score_label": "Good — 4 out of 5 correct",
  "strong_areas": ["area 1", "area 2"],
  "weak_areas": ["area 1"],
  "key_insight": "2 sentences on the main grammar pattern the student struggles with.",
  "ielts_impact": "1-2 sentences on how this affects their IELTS band score.",
  "study_plan": "3 specific steps to improve."
}`,
      messages: [{ role: 'user', content: `Level: ${level}, Topic: ${topic}, Score: ${correct}/${total}` }]
    });

    const result = parseAIJson(message.content[0].text);

    await saveSession({
      user_id: req.user.id,
      module: 'grammar',
      subtype: `${level} — ${topic}`,
      score_raw: correct,
      score_total: total
    });

    res.json(result);
  } catch (e) {
    sendError(res, 'grammar/report', e);
  }
});

// ── MOCK EXAM — GENERATE FULL EXAM (content generation → Haiku) ─
// NOTE: response shape was inferred from mock-exam.html's render functions
// (examData.listening / .reading / .writing / .speaking). Verify field names
// against the frontend once we get to the frontend fixes and adjust if needed.
app.post('/api/mock/generate', requireAuth, aiLimiter, async (req, res) => {
  const { examType } = req.body;
  if (!examType || !['Academic', 'General Training'].includes(examType)) {
    return res.status(400).json({ error: 'examType must be "Academic" or "General Training"' });
  }

  const readingTopics = examType === 'Academic' ? READING_TOPICS_AC : READING_TOPICS_GT;
  const readingTopic = readingTopics[Math.floor(Math.random() * readingTopics.length)];
  const listeningSection = Math.floor(Math.random() * 4) + 1;
  const listeningScenario = LISTENING_TOPICS[listeningSection][Math.floor(Math.random() * LISTENING_TOPICS[listeningSection].length)];

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 3500,
      system: `You are an IELTS examiner generating a full mock ${examType} exam. Return ONLY valid JSON, no markdown, with exactly this shape:
{
  "listening": {"title":"Short title","description":"One sentence","badge":"e.g. Everyday conversation · 2 speakers","speakers":[{"name":"Name","accent":"british","gender":"female"}],"transcript":"${LISTENING_SECTION_GUIDE[listeningSection]} 220-260 words. Natural spoken English with contractions.","questions":[{"type":"fill","text":"...","answer":"..."},{"type":"mcq","text":"...","options":["A. ...","B. ...","C. ...","D. ..."],"answer":"A. ..."}]},
  "reading": {"title":"Passage title","passage":"380-420 words. Use HTML <p> tags. Start each paragraph with <span class='para-lbl'>A</span> etc.","questions":[{"type":"tfng","text":"...","answer":"TRUE"},{"type":"mcq","text":"...","options":["A. ...","B. ...","C. ...","D. ..."],"answer":"B. ..."},{"type":"fill","text":"...","answer":"..."}]},
  "writing": {
    "task1": {"prompt": "${examType === 'Academic' ? 'A Task 1 prompt describing a chart/graph/table — include the actual data written out in the prompt text itself, since no image will be shown.' : 'A Task 1 prompt asking the student to write a letter (formal/semi-formal/informal) about a everyday situation.'}", "time": "20 minutes", "minWords": 150},
    "task2": {"prompt": "A Task 2 essay prompt on a fresh, varied topic.", "time": "40 minutes", "minWords": 250}
  },
  "speaking": {
    "part1": {"question": "Personal interview question about a familiar topic", "sub": "Follow-up question"},
    "part2": {"topic": "Describe a...", "bullets": ["point 1","point 2","point 3","point 4"], "note": "You will have 1 minute to prepare..."},
    "part3": {"question": "Abstract discussion question related to Part 2 topic", "sub": "Optional follow-up"}
  }
}
Listening: include exactly 5 questions (3 fill, 2 mcq), answers must come directly from the transcript.
Reading: include exactly 8 questions (3 tfng, 3 mcq, 2 fill), answers must come directly from the passage.
Use fresh, varied topics — never repeat common textbook examples.`,
      messages: [{ role: 'user', content: `Generate a full ${examType} mock exam.\nListening scenario: ${listeningScenario}\nReading topic: ${readingTopic}` }]
    });

    const result = parseAIJson(message.content[0].text);
    res.json(result);
  } catch (e) {
    sendError(res, 'mock/generate', e);
  }
});

// ── MOCK EXAM REPORT (feedback → Sonnet) ───────────────────────
app.post('/api/mock/report', requireAuth, aiLimiter, async (req, res) => {
  const { examType, lScore, lTotal, rScore, rTotal, task1, task2, t1Prompt, t2Prompt, sp1, sp2, sp3, sp1Q, sp2Topic, sp3Q } = req.body;
  const missing = missingFields(req.body, ['examType', 'task1', 'task2']);
  if (missing.length) return res.status(400).json({ error: `Missing fields: ${missing.join(', ')}` });

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1400,
      system: `You are a senior IELTS examiner. Evaluate a full mock ${examType} exam. Return ONLY JSON:
{
  "writing_band": "6.5",
  "speaking_band": "7.0",
  "overall_band": "7.0",
  "strongest_skill": "One sentence naming best skill and why.",
  "priority_skill": "One sentence naming weakest skill and why.",
  "writing_feedback": "3 specific sentences on both tasks.",
  "speaking_feedback": "3 sentences covering all 3 parts.",
  "rl_feedback": "2 sentences on reading and listening performance.",
  "study_plan": "4 specific actions for next 30 days, one per skill.",
  "exam_ready": "Honest 2-sentence assessment of exam readiness."
}
Be honest, specific, and encouraging.`,
      messages: [{ role: 'user', content: `Exam: ${examType}
Listening: ${lScore}/${lTotal}
Reading: ${rScore}/${rTotal}
Writing Task 1 (${t1Prompt}): ${task1}
Writing Task 2 (${t2Prompt}): ${task2}
Speaking Part 1 (${sp1Q}): ${sp1}
Speaking Part 2 (${sp2Topic}): ${sp2}
Speaking Part 3 (${sp3Q}): ${sp3}` }]
    });

    const result = parseAIJson(message.content[0].text);

    await saveSession({
      user_id: req.user.id,
      module: 'mock',
      subtype: examType,
      band: parseFloat(result.overall_band)
    });

    res.json(result);
  } catch (e) {
    sendError(res, 'mock/report', e);
  }
});

// ── USER PROFILE ──────────────────────────────────────────────
app.get('/api/profile', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', req.user.id)
    .single();
  if (error) return sendError(res, 'profile/get', error);
  res.json(data);
});

app.put('/api/profile', requireAuth, async (req, res) => {
  const { full_name, target_band, exam_type, exam_date } = req.body;
  const { data, error } = await supabase
    .from('profiles')
    .update({ full_name, target_band, exam_type, exam_date })
    .eq('id', req.user.id)
    .select()
    .single();
  if (error) return sendError(res, 'profile/put', error);
  res.json(data);
});

// ── USER PROGRESS ─────────────────────────────────────────────
app.get('/api/progress', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false });
  if (error) return sendError(res, 'progress/get', error);
  res.json(data);
});

// ── CERTIFICATES ──────────────────────────────────────────────
app.get('/api/certificates', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('certificates')
    .select('*')
    .eq('user_id', req.user.id);
  if (error) return sendError(res, 'certificates/get', error);
  res.json(data);
});

app.post('/api/certificates/issue', requireAuth, async (req, res) => {
  const { module, band } = req.body;
  const missing = missingFields(req.body, ['module', 'band']);
  if (missing.length) return res.status(400).json({ error: `Missing fields: ${missing.join(', ')}` });

  const { data, error } = await supabase
    .from('certificates')
    .upsert({ user_id: req.user.id, module, band })
    .select()
    .single();
  if (error) return sendError(res, 'certificates/issue', error);
  res.json(data);
});

// ── SPEAKING TRANSCRIBE (Whisper) ─────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 } // 15MB cap
});

app.post('/api/speaking/transcribe', requireAuth, aiLimiter, (req, res, next) => {
  upload.single('audio')(req, res, function (err) {
    if (err) return res.status(400).json({ error: 'Audio file is invalid or exceeds the 15MB limit.' });
    next();
  });
}, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No audio file' });
  try {
    const form = new FormData();
    form.append('file', req.file.buffer, { filename: 'audio.webm', contentType: req.file.mimetype });
    form.append('model', 'whisper-1');
    form.append('language', 'en');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, ...form.getHeaders() },
      body: form
    });

    if (!response.ok) {
      logError('speaking/transcribe', await response.text());
      return res.status(500).json({ error: 'Transcription failed' });
    }

    const data = await response.json();
    res.json({ text: data.text || '' });
  } catch (e) {
    sendError(res, 'speaking/transcribe', e);
  }
});

// ── 404 + ERROR HANDLING (always JSON, never the default HTML page) ─
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON in request body' });
  }
  console.error('[unhandled]', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── START SERVER ──────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`IELTScoreUp API running on port ${PORT}`));
