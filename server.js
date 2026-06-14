const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

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

// ── WRITING EVALUATION ────────────────────────────────────────
app.post('/api/writing/evaluate', requireAuth, async (req, res) => {
  const { essay, prompt, taskType, testType } = req.body;
  if (!essay || !prompt) return res.status(400).json({ error: 'Missing fields' });

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

    const result = JSON.parse(message.content[0].text.trim().replace(/```json|```/g, '').trim());

    // Save session
    await supabase.from('sessions').insert({
      user_id: req.user.id,
      module: 'writing',
      subtype: `${taskType} ${testType}`,
      band: parseFloat(result.overall)
    });

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GENERATE WRITING PROMPT ───────────────────────────────────
app.post('/api/writing/generate-prompt', requireAuth, async (req, res) => {
  const { taskType, testType } = req.body;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
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

    const result = JSON.parse(message.content[0].text.trim().replace(/```json|```/g, '').trim());
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GENERATE READING PASSAGE ──────────────────────────────────
app.post('/api/reading/generate', requireAuth, async (req, res) => {
  const { testType, difficulty } = req.body;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: `You are an IELTS examiner. Generate a complete IELTS Reading passage with questions for ${testType}. Return ONLY JSON:
{
  "title": "Passage title",
  "passage": "Full passage text with paragraphs labeled A, B, C, D, E (use HTML <p> tags with <span class='para-lbl'>A</span> etc). Min 500 words.",
  "questions": [
    {"type": "tfng", "text": "Statement to verify", "answer": "TRUE"},
    {"type": "mcq", "text": "Question", "options": ["A","B","C","D"], "answer": "B"},
    {"type": "fill", "text": "Complete: The _____ was discovered in...", "answer": "answer"}
  ]
}
Include 8 questions mixing: True/False/Not Given, Multiple Choice, Fill in the blank.
Use varied academic topics: science, history, environment, technology, society, economics.
Never repeat topics from common IELTS practice materials.`,
      messages: [{ role: 'user', content: `Generate a new ${testType} reading passage at ${difficulty || 'B2'} level. Use a fresh, interesting topic.` }]
    });

    const result = JSON.parse(message.content[0].text.trim().replace(/```json|```/g, '').trim());
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── READING EXPLANATIONS ──────────────────────────────────────
app.post('/api/reading/explain', requireAuth, async (req, res) => {
  const { passage, questions, userAnswers } = req.body;

  try {
    const qText = questions.map((q, i) => {
      const ua = userAnswers[i];
      const isCorrect = q.type === 'fill'
        ? ua?.toLowerCase() === q.answer.toLowerCase()
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

    const result = JSON.parse(message.content[0].text.trim().replace(/```json|```/g, '').trim());

    // Save session
    const correct = userAnswers.filter((a, i) => {
      const q = questions[i];
      return q.type === 'fill' ? a?.toLowerCase() === q.answer.toLowerCase() : a === q.answer;
    }).length;

    await supabase.from('sessions').insert({
      user_id: req.user.id,
      module: 'reading',
      score_raw: correct,
      score_total: questions.length
    });

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GENERATE LISTENING ────────────────────────────────────────
app.post('/api/listening/generate', requireAuth, async (req, res) => {
  const { section } = req.body;

  const sectionContexts = {
    1: 'everyday social context between two people (e.g. booking, enquiry, registration)',
    2: 'monologue in everyday social context (e.g. tour guide, announcement, induction)',
    3: 'conversation between 2-3 people in educational/training context',
    4: 'academic lecture or talk on an academic subject'
  };

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system: `You are an IELTS Listening examiner. Generate a Section ${section} listening exercise (${sectionContexts[section]}). Return ONLY JSON:
{
  "title": "Short descriptive title",
  "description": "One sentence describing the scenario",
  "badge": "e.g. Everyday conversation · 2 speakers",
  "speakers": [
    {"name": "Speaker name or role", "accent": "british", "gender": "female"}
  ],
  "transcript": "Full dialogue or monologue. For conversations use format: [Name]: text. Min 250 words. Natural, realistic English.",
  "questions": [
    {"type": "fill", "text": "The applicant's surname is _____.", "answer": "Smith"},
    {"type": "mcq", "text": "Question?", "options": ["A","B","C","D"], "answer": "C"}
  ]
}
Include 5 questions (mix of fill-in-blank and MCQ). Answers must come directly from the transcript.
Use varied, fresh topics never seen in standard IELTS prep materials.
Accents: british or australian for Section 4, mixed for others.`,
      messages: [{ role: 'user', content: `Generate a fresh Section ${section} listening exercise. Be creative with the topic and scenario.` }]
    });

    const result = JSON.parse(message.content[0].text.trim().replace(/```json|```/g, '').trim());
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── TEXT TO SPEECH ────────────────────────────────────────────
app.post('/api/tts', requireAuth, async (req, res) => {
  const { text, voice } = req.body;
  if (!text) return res.status(400).json({ error: 'No text provided' });

  // Voice mapping for accents
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
      const err = await response.json();
      return res.status(500).json({ error: err.error?.message || 'TTS failed' });
    }

    const audioBuffer = await response.arrayBuffer();
    res.set('Content-Type', 'audio/mpeg');
    res.set('Cache-Control', 'no-store');
    res.send(Buffer.from(audioBuffer));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── SPEAKING EVALUATION ───────────────────────────────────────
app.post('/api/speaking/evaluate', requireAuth, async (req, res) => {
  const { response, question, part } = req.body;

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

    const result = JSON.parse(message.content[0].text.trim().replace(/```json|```/g, '').trim());

    await supabase.from('sessions').insert({
      user_id: req.user.id,
      module: 'speaking',
      subtype: `Part ${part}`,
      band: parseFloat(result.overall)
    });

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GENERATE SPEAKING QUESTIONS ───────────────────────────────
app.post('/api/speaking/generate', requireAuth, async (req, res) => {
  const { part } = req.body;

  const partDescriptions = {
    1: 'Introduction and interview — personal questions about familiar topics (hometown, work, hobbies, daily routine)',
    2: 'Individual long turn — cue card with topic and 4 bullet points to speak about for 1-2 minutes',
    3: 'Two-way discussion — abstract questions related to the Part 2 topic'
  };

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      system: `You are an IELTS examiner. Generate a Part ${part} speaking question. Return ONLY JSON.
${part === 1 ? '{"question": "Question text", "sub": "Follow-up or clarification"}' : ''}
${part === 2 ? '{"topic": "Describe a...", "bullets": ["point 1", "point 2", "point 3", "point 4"], "note": "You will have 1 minute to prepare..."}' : ''}
${part === 3 ? '{"question": "Abstract discussion question", "sub": "Optional follow-up"}' : ''}
Use fresh, varied topics. Never repeat common IELTS examples.`,
      messages: [{ role: 'user', content: `Generate a new Part ${part} speaking ${partDescriptions[part]}. Be creative.` }]
    });

    const result = JSON.parse(message.content[0].text.trim().replace(/```json|```/g, '').trim());
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GRAMMAR GENERATE ──────────────────────────────────────────
app.post('/api/grammar/generate', requireAuth, async (req, res) => {
  const { level, topic } = req.body;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
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

    const result = JSON.parse(message.content[0].text.trim().replace(/```json|```/g, '').trim());
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GRAMMAR AI REPORT ─────────────────────────────────────────
app.post('/api/grammar/report', requireAuth, async (req, res) => {
  const { level, topic, correct, total } = req.body;

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

    const result = JSON.parse(message.content[0].text.trim().replace(/```json|```/g, '').trim());

    await supabase.from('sessions').insert({
      user_id: req.user.id,
      module: 'grammar',
      subtype: `${level} — ${topic}`,
      score_raw: correct,
      score_total: total
    });

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── MOCK EXAM REPORT ──────────────────────────────────────────
app.post('/api/mock/report', requireAuth, async (req, res) => {
  const { examType, lScore, lTotal, rScore, rTotal, task1, task2, t1Prompt, t2Prompt, sp1, sp2, sp3, sp1Q, sp2Topic, sp3Q } = req.body;

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

    const result = JSON.parse(message.content[0].text.trim().replace(/```json|```/g, '').trim());

    await supabase.from('sessions').insert({
      user_id: req.user.id,
      module: 'mock',
      subtype: examType,
      band: parseFloat(result.overall_band)
    });

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── USER PROFILE ──────────────────────────────────────────────
app.get('/api/profile', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', req.user.id)
    .single();
  if (error) return res.status(500).json({ error: error.message });
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
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── USER PROGRESS ─────────────────────────────────────────────
app.get('/api/progress', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── CERTIFICATES ──────────────────────────────────────────────
app.get('/api/certificates', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('certificates')
    .select('*')
    .eq('user_id', req.user.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/certificates/issue', requireAuth, async (req, res) => {
  const { module, band } = req.body;
  const { data, error } = await supabase
    .from('certificates')
    .upsert({ user_id: req.user.id, module, band })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── START SERVER ──────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`IELTScoreUp API running on port ${PORT}`));

// ── SPEAKING TRANSCRIBE (Whisper) ─────────────────────────────
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

app.post('/api/speaking/transcribe', requireAuth, upload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No audio file' });
  try {
    const FormData = require('form-data');
    const form = new FormData();
    form.append('file', req.file.buffer, { filename: 'audio.webm', contentType: req.file.mimetype });
    form.append('model', 'whisper-1');
    form.append('language', 'en');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, ...form.getHeaders() },
      body: form
    });

    const data = await response.json();
    res.json({ text: data.text || '' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
