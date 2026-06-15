const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// ── TOPIC BANKS ───────────────────────────────────────────────
const TOPICS = {
  writing: {
    task1_academic: [
      'a bar chart comparing energy consumption by sector in five countries (2000–2020)',
      'a line graph showing population growth in urban vs rural areas (1970–2030)',
      'a pie chart illustrating global water usage across agriculture, industry and households',
      'a table comparing student satisfaction rates across six universities',
      'a diagram showing the process of water purification in a modern treatment plant',
      'a map showing changes to a coastal town between 1985 and the present day',
      'a process diagram illustrating how paper is recycled',
      'a bar chart on global internet penetration rates by region (2010–2023)',
      'a line graph showing birth rates and life expectancy in Japan, Brazil and Nigeria',
      'a diagram of the stages involved in producing electricity from wind turbines',
      'a table showing CO2 emissions per capita in G7 nations (2015–2022)',
      'a chart comparing household spending on food, transport, and leisure',
      'a map showing the planned development of a new science park near an existing town',
      'a process showing how crude oil is refined into different products',
      'a bar chart showing causes of workplace accidents by industry',
      'a pie chart showing the breakdown of a city municipality budget',
      'a diagram showing the life cycle of a salmon',
      'a table comparing public transport options in four major world cities',
      'a flow chart showing how a government processes a visa application',
      'a line graph comparing smartphone ownership in developed vs developing nations'
    ],
    task1_gt: [
      'write to your local council complaining about insufficient recycling facilities in your neighbourhood',
      'write to a friend living abroad explaining your new job and asking for advice',
      'write to a hotel manager complaining about a disappointing stay and requesting compensation',
      'write to your employer requesting a week of unpaid leave for a family event',
      'write to a library suggesting the introduction of a digital borrowing service',
      'write to a neighbour about a noise problem that has been affecting your sleep',
      'write to a company whose product you recently purchased expressing dissatisfaction',
      'write to the editor of a newspaper about a recent article you disagreed with',
      'write to a language school to enquire about evening courses for adults',
      'write to a landlord reporting several maintenance issues in your rented flat',
      'write to a community centre proposing a new after-school programme for children',
      'write to a former colleague asking for a professional reference',
      'write to the local transport authority suggesting improvements to the bus service',
      'write to a travel agency to cancel a holiday booking and explain the reason',
      'write to a friend congratulating them and offering help with their new business'
    ],
    task2: [
      'Some people believe that governments should invest more in public transport rather than building new roads. To what extent do you agree?',
      'Many young people today spend too much time on social media. Discuss the causes and effects of this trend.',
      'Some argue that university education should be free for all students. Others believe individuals should pay for it. Discuss both views and give your opinion.',
      'The rise of artificial intelligence will lead to significant job losses. Do the disadvantages of this outweigh the advantages?',
      'Some people think that parents are responsible for teaching children right from wrong, while others believe schools should play a bigger role. Discuss both views.',
      'Cities are becoming increasingly overcrowded. What problems does this cause, and what measures can be taken to solve them?',
      'Many companies now allow employees to work from home. Is this a positive or negative development for workers and society?',
      'Some people believe that sport and exercise should be compulsory in schools. To what extent do you agree?',
      'The gap between the rich and the poor is widening globally. What are the causes, and how can this be reduced?',
      'Tourism brings economic benefits to many countries, but it also has negative effects on the environment. Do the benefits outweigh the drawbacks?',
      'Some people think that printed newspapers will disappear within the next decade. Do you agree or disagree?',
      'Many countries are experiencing an ageing population. What challenges does this create, and how can governments respond?',
      'It is argued that zoos are cruel to animals and should be closed. Others believe they play an important role in conservation. Discuss both views.',
      'Some people believe that children should learn a foreign language from primary school. Do you agree with this view?',
      'Modern technology has made it easier to communicate, but some argue it has also made people more isolated. To what extent do you agree?'
    ]
  },
  reading: {
    academic: [
      'the evolution of urban farming and its role in food security',
      'the psychological effects of colour in architecture and design',
      'how deep-sea mining threatens oceanic ecosystems',
      'the history and science of fermentation across cultures',
      'neuroethics and the challenges of brain-computer interfaces',
      'the economics of the circular economy model',
      'how biomimicry is influencing modern engineering',
      'the social impact of the eight-hour workday since its invention',
      'recent discoveries about the role of sleep in memory consolidation',
      'the debate over rewilding and reintroducing apex predators',
      'how satellite technology is transforming precision agriculture',
      'the linguistic theory of linguistic relativity and its critics',
      'the rise of dark tourism and its ethical implications',
      'quantum computing: principles and potential applications',
      'the history of cartography and how maps shaped civilisation'
    ],
    gt: [
      'tips for renting your first flat in a new city',
      'how to apply for a national driving licence as a new resident',
      'a guide to community volunteering opportunities in urban areas',
      'understanding workplace health and safety regulations',
      'choosing the right health insurance plan for your family',
      'how public libraries are adapting to serve digital communities',
      'starting a small business: a practical guide',
      'understanding your rights as a consumer when returning goods',
      'how to register children for state schools in a new area',
      'managing personal finances: budgeting for beginners'
    ]
  },
  listening: {
    section1: [
      'a student registering for a part-time job at a campus cafe',
      'a customer calling to book a tour of a national park',
      'two neighbours discussing arrangements for a community clean-up event',
      'a person enquiring about gym membership options and class schedules',
      'a student ringing a housing office to report a problem with their accommodation',
      'a caller booking a table at a restaurant for a birthday celebration',
      'a new employee asking HR about company benefits and induction procedures',
      'a parent enquiring about enrolment at a local primary school',
      'a tourist calling a visitor information centre about local attractions',
      'a customer contacting a bank to report a lost debit card'
    ],
    section2: [
      'a tour guide welcoming visitors to a newly opened science museum',
      'a college orientation talk introducing facilities to new students',
      'a radio announcer describing a new public cycle lane scheme in the city',
      'a community manager presenting plans for a new neighbourhood garden',
      'a health officer giving a talk about an upcoming free health screening event',
      'a library manager explaining new digital borrowing services to members',
      'a council representative presenting plans for a new sports centre',
      'a park ranger describing wildlife conservation efforts in a national reserve',
      'a museum guide describing the layout of a new exhibition',
      'a workplace safety officer delivering a fire evacuation procedure briefing'
    ],
    section3: [
      'two students discussing the methodology for their research project on plastic waste',
      'a tutor and student reviewing feedback on a submitted economics essay',
      'three students planning a group presentation on renewable energy sources',
      'a student and academic advisor discussing module choices for the final year',
      'two classmates comparing fieldwork findings on urban bird populations',
      'a student and supervisor discussing the structure of a dissertation',
      'two students debating the pros and cons of different referencing styles',
      'a professor and student discussing preparation for a postgraduate interview',
      'three students dividing tasks for a business case study assignment',
      'a student discussing study abroad options with a university coordinator'
    ],
    section4: [
      'a lecture on the anthropological study of ancient trade routes',
      'an academic talk on the neuroscience of decision-making under pressure',
      'a lecture on the environmental impact of fast fashion on waterways',
      'an academic presentation on the history and future of vertical cities',
      'a lecture discussing how climate change is affecting global food production',
      'a talk on the role of storytelling in preserving indigenous languages',
      'a lecture on the economic theories behind minimum wage policies',
      'an academic talk on the science of soil degradation and land restoration',
      'a lecture on the psychological concept of cognitive dissonance',
      'a talk on how nanotechnology is being used in modern medicine'
    ]
  },
  speaking: {
    part1_topics: [
      'your hometown and where you grew up',
      'your daily routine and how you manage your time',
      'music and what role it plays in your life',
      'cooking and your favourite foods',
      'sport and how physically active you are',
      'travelling and places you have visited',
      'technology and how you use it daily',
      'reading habits and types of books you enjoy',
      'friendship and what makes a good friend',
      'the area where you currently live',
      'shopping habits and preferences',
      'memories of school and favourite subjects',
      'hobbies you enjoy in your free time',
      'your experience with learning languages',
      'the weather and how it affects your mood'
    ],
    part2_topics: [
      'Describe a piece of technology you use every day. Say what it is, how you use it, and explain why it is important to you.',
      'Describe a memorable journey you have taken. Say where you went, how you travelled, and explain what made it memorable.',
      'Describe a skill you would like to learn in the future. Say what the skill is, why you want to learn it, and how you plan to do so.',
      'Describe a person who has had a significant influence on your life. Say who they are, how you know them, and explain their influence.',
      'Describe a book, film or TV show that made a strong impression on you. Say what it was about and explain why it affected you.',
      'Describe a time when you helped someone. Say who needed help, what the situation was, and explain how you helped.',
      'Describe a place in your country you would recommend to a visitor. Say where it is and explain why it is worth visiting.',
      'Describe an ambition or goal you have for your future. Say what it is, when you developed this goal, and how you plan to achieve it.',
      'Describe a celebration or festival that is important in your culture. Say what it involves and explain its significance.',
      'Describe a time when you had to make a difficult decision. Say what the decision was and explain how you made it.'
    ],
    part3_themes: [
      'technology and society',
      'education systems and reform',
      'environmental responsibility',
      'work and career in the modern world',
      'cultural identity and globalisation',
      'health and wellbeing in modern life',
      'the role of government and individual freedom',
      'media, news and the spread of information',
      'urban planning and the future of cities',
      'family structures and social change'
    ]
  },
  grammar: {
    topics: [
      'present perfect vs past simple',
      'conditional sentences (zero, first, second, third)',
      'passive voice in academic writing',
      'relative clauses (defining and non-defining)',
      'modal verbs for speculation and deduction',
      'reported speech and backshift of tenses',
      'articles (a, an, the, zero article)',
      'prepositions of time, place and movement',
      'comparison structures (as...as, comparatives, superlatives)',
      'gerunds and infinitives after verbs',
      'noun phrases and complex noun groups',
      'discourse markers and cohesion devices',
      'subject-verb agreement with complex subjects',
      'future forms (will, going to, present continuous)',
      'cleft sentences and emphasis structures'
    ]
  },
  mock: {
    academic_topics: [
      { reading: 'the science of habit formation', listening_s1: 'booking a campus study skills workshop', listening_s4: 'a lecture on behavioural economics' },
      { reading: 'the ethics of genetic engineering in agriculture', listening_s1: 'enquiring about volunteering at a wildlife sanctuary', listening_s4: 'a talk on the history of epidemics' },
      { reading: 'how ancient civilisations managed water resources', listening_s1: 'registering for a community language exchange programme', listening_s4: 'a lecture on sustainable architecture' },
      { reading: 'the role of play in child cognitive development', listening_s1: 'calling to book an appointment at a careers centre', listening_s4: 'an academic talk on the psychology of persuasion' },
      { reading: 'the impact of light pollution on nocturnal wildlife', listening_s1: 'enquiring about a local recycling collection service', listening_s4: 'a lecture on the economics of renewable energy' }
    ],
    gt_topics: [
      { reading: 'workplace wellness programmes', listening_s1: 'enquiring about adult education evening classes', listening_s4: 'a talk on financial literacy for young adults' },
      { reading: 'community gardening initiatives in urban areas', listening_s1: 'reporting a lost item to a local transport office', listening_s4: 'a lecture on the history of urban parks' },
      { reading: 'consumer rights when shopping online', listening_s1: 'a new resident asking about local council services', listening_s4: 'a talk on managing work-life balance' }
    ]
  }
};

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function seed() { return Math.floor(Math.random() * 99999); }

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

// ══════════════════════════════════════════════════════════════
// WRITING
// ══════════════════════════════════════════════════════════════

app.post('/api/writing/generate-prompt', requireAuth, async (req, res) => {
  const { taskType, testType } = req.body;
  let topic = '';
  if (taskType === 'Task 1' && testType === 'Academic') topic = pick(TOPICS.writing.task1_academic);
  else if (taskType === 'Task 1') topic = pick(TOPICS.writing.task1_gt);
  else topic = pick(TOPICS.writing.task2);

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      system: `You are a senior IELTS examiner writing real exam materials. Generate a ${taskType} ${testType} prompt. Return ONLY valid JSON, no markdown:
{"prompt":"Full exam-quality prompt with all necessary detail and data","time":"${taskType==='Task 1'?'20':'40'} minutes","minWords":${taskType==='Task 1'?150:250}}
For Task 1 Academic: include specific invented data, percentages or labels as a real graph/diagram would show. For Task 1 GT: write the full letter scenario clearly. For Task 2: write the full discursive question with instruction (Discuss both views / To what extent / What are the causes etc.).`,
      messages: [{ role: 'user', content: `Seed ${seed()}. Write a fresh ${taskType} ${testType} prompt on this topic: ${topic}` }]
    });
    const result = JSON.parse(message.content[0].text.trim().replace(/```json|```/g, '').trim());
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/writing/evaluate', requireAuth, async (req, res) => {
  const { essay, prompt, taskType, testType } = req.body;
  if (!essay || !prompt) return res.status(400).json({ error: 'Missing fields' });
  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1200,
      system: `You are an expert IELTS examiner. Evaluate IELTS Writing ${taskType} (${testType}) strictly according to official band descriptors. Return ONLY valid JSON:
{"overall":"7.0","task_achievement":"7.0","coherence_cohesion":"6.5","lexical_resource":"7.0","grammatical_range":"6.5","strengths":"2-3 specific sentences referencing actual content from the essay.","improvements":"2-3 sentences with specific, actionable weaknesses found in the essay.","corrected_example":"Take one weak sentence from the essay and rewrite it at band 7+ level.","next_steps":"3 specific, prioritised actions to improve the score."}
Band scores 1.0-9.0 in 0.5 increments. Be honest and precise.`,
      messages: [{ role: 'user', content: `Task: ${taskType} (${testType})\nPrompt: ${prompt}\nEssay:\n${essay}` }]
    });
    const result = JSON.parse(message.content[0].text.trim().replace(/```json|```/g, '').trim());
    await supabase.from('sessions').insert({ user_id: req.user.id, module: 'writing', subtype: `${taskType} ${testType}`, band: parseFloat(result.overall) });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════
// READING
// ══════════════════════════════════════════════════════════════

app.post('/api/reading/generate', requireAuth, async (req, res) => {
  const { testType, difficulty } = req.body;
  const topicList = testType === 'Academic' ? TOPICS.reading.academic : TOPICS.reading.gt;
  const topic = pick(topicList);
  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2500,
      system: `You are an IELTS examiner writing real exam materials for ${testType}. Generate a complete reading passage with questions. Return ONLY valid JSON, no markdown:
{"title":"Passage title","passage":"Full passage min 550 words. Use HTML: paragraphs as <p> tags each starting with <span class='para-lbl'>A</span> <span class='para-lbl'>B</span> etc. Formal academic style with specific facts and examples.","questions":[{"type":"tfng","text":"Statement to verify","answer":"TRUE"},{"type":"mcq","text":"Question","options":["A. option","B. option","C. option","D. option"],"answer":"B. option"},{"type":"fill","text":"Complete: The _____ was first introduced in...","answer":"exact word from passage"}]}
Include exactly 8 questions: 3 True/False/Not Given, 3 Multiple Choice, 2 Fill in the blank. All answers must come directly from the passage.`,
      messages: [{ role: 'user', content: `Seed ${seed()}. Write a ${testType} reading passage about: ${topic}. Level: ${difficulty || 'B2-C1'}.` }]
    });
    const result = JSON.parse(message.content[0].text.trim().replace(/```json|```/g, '').trim());
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/reading/explain', requireAuth, async (req, res) => {
  const { passage, questions, userAnswers } = req.body;
  try {
    const qText = questions.map((q, i) => {
      const ua = userAnswers[i];
      const isCorrect = q.type === 'fill' ? ua?.toLowerCase() === q.answer.toLowerCase() : ua === q.answer;
      return `Q${i+1}: ${q.text}\nCorrect: ${q.answer}\nStudent: ${ua}\nResult: ${isCorrect?'CORRECT':'WRONG'}`;
    }).join('\n\n');
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1200,
      system: `You are an IELTS Reading tutor. For each question explain why the answer is correct or incorrect, quoting the specific paragraph letter. Return ONLY valid JSON array:
[{"q":1,"correct":true,"explanation":"Clear 2-sentence explanation referencing paragraph letter."}]`,
      messages: [{ role: 'user', content: `Passage:\n${passage}\n\nResults:\n${qText}` }]
    });
    const result = JSON.parse(message.content[0].text.trim().replace(/```json|```/g, '').trim());
    const correct = userAnswers.filter((a,i) => {
      const q = questions[i];
      return q.type==='fill' ? a?.toLowerCase()===q.answer.toLowerCase() : a===q.answer;
    }).length;
    await supabase.from('sessions').insert({ user_id: req.user.id, module: 'reading', score_raw: correct, score_total: questions.length });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════
// LISTENING
// ══════════════════════════════════════════════════════════════

app.post('/api/listening/generate', requireAuth, async (req, res) => {
  const { section } = req.body;
  const sectionKey = `section${section}`;
  const scenario = pick(TOPICS.listening[sectionKey]);

  const sectionGuide = {
    1: 'A conversation between two people in an everyday social context. Write as realistic dialogue with [Name]: format. Include specific details like names, numbers, addresses, dates that will appear in fill-in-blank answers.',
    2: 'A monologue in an everyday social context (announcement, tour, induction). One speaker, include specific facts, numbers and sequences.',
    3: 'A conversation between 2-3 people in an educational or training context. Use dialogue format. Academic and analytical in tone.',
    4: 'An academic lecture or formal talk. One speaker, formal academic register. Include technical vocabulary, examples and data.'
  };

  const accentMap = {
    1: ['british_female','british_male','australian_female','american_female'],
    2: ['british_female','australian_female','british_male'],
    3: ['british_female','british_male','australian_female','american_male'],
    4: ['british_male','australian_female','british_female']
  };

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: `You are an IELTS Listening examiner writing a real exam audio script for Section ${section}. Return ONLY valid JSON, no markdown:
{"title":"Short descriptive title","description":"One sentence describing the scenario","badge":"e.g. Everyday conversation - 2 speakers","speakers":[{"name":"Speaker name or role","accent":"british","gender":"female"}],"transcript":"${sectionGuide[section]} Minimum 300 words. Natural spoken English with contractions.","questions":[{"type":"fill","text":"The applicant's last name is _____.","answer":"exact word from transcript"},{"type":"mcq","text":"Question?","options":["A. option","B. option","C. option","D. option"],"answer":"A. option"}]}
Include exactly 5 questions (3 fill-in-blank, 2 MCQ). Every answer must be a specific word, number or phrase taken directly from the transcript.`,
      messages: [{ role: 'user', content: `Seed ${seed()}. Write a Section ${section} listening exercise about: ${scenario}` }]
    });
    const result = JSON.parse(message.content[0].text.trim().replace(/```json|```/g, '').trim());
    const accents = accentMap[section];
    if (result.speakers) {
      result.speakers = result.speakers.map((s, i) => ({ ...s, accent: accents[i % accents.length] }));
    }
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/listening/results', requireAuth, async (req, res) => {
  const { questions, userAnswers } = req.body;
  try {
    const correct = userAnswers.filter((a,i) => {
      const q = questions[i];
      return q.type==='fill' ? a?.toLowerCase()===q.answer.toLowerCase() : a===q.answer;
    }).length;
    await supabase.from('sessions').insert({ user_id: req.user.id, module: 'listening', score_raw: correct, score_total: questions.length });
    res.json({ correct, total: questions.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── TEXT TO SPEECH ────────────────────────────────────────────
app.post('/api/tts', requireAuth, async (req, res) => {
  const { text, voice } = req.body;
  if (!text) return res.status(400).json({ error: 'No text provided' });
  const voiceMap = { british_female:'nova', british_male:'onyx', australian_female:'shimmer', american_male:'echo', american_female:'alloy' };
  const selectedVoice = voiceMap[voice] || 'nova';
  try {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'tts-1', input: text.substring(0, 4096), voice: selectedVoice, speed: 0.92 })
    });
    if (!response.ok) { const err = await response.json(); return res.status(500).json({ error: err.error?.message || 'TTS failed' }); }
    const audioBuffer = await response.arrayBuffer();
    res.set('Content-Type', 'audio/mpeg');
    res.set('Cache-Control', 'no-store');
    res.send(Buffer.from(audioBuffer));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════
// SPEAKING
// ══════════════════════════════════════════════════════════════

app.post('/api/speaking/generate', requireAuth, async (req, res) => {
  const { part } = req.body;
  const s = seed();
  let topicContext = '';
  let format = '';

  if (part === 1) {
    topicContext = pick(TOPICS.speaking.part1_topics);
    format = `{"question":"Personal question about ${topicContext}","sub":"Natural follow-up question on the same theme"}`;
  } else if (part === 2) {
    topicContext = pick(TOPICS.speaking.part2_topics);
    format = `{"topic":"Cue card title","bullets":["point 1 to cover","point 2 to cover","point 3 to cover","point 4 to cover"],"note":"You have 1 minute to prepare. Speak for 1-2 minutes."}`;
  } else {
    topicContext = pick(TOPICS.speaking.part3_themes);
    format = `{"question":"Abstract discussion question about ${topicContext} suitable for IELTS Part 3","sub":"A deeper follow-up question pushing for opinion or analysis"}`;
  }

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      system: `You are an IELTS Speaking examiner. Generate a Part ${part} speaking question. Return ONLY valid JSON, no markdown: ${format}
Make it feel natural and varied. Do not use the most commonly seen IELTS example questions.`,
      messages: [{ role: 'user', content: `Seed ${s}. Generate a fresh Part ${part} question about: ${topicContext}` }]
    });
    const result = JSON.parse(message.content[0].text.trim().replace(/```json|```/g, '').trim());
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/speaking/evaluate', requireAuth, async (req, res) => {
  const { response, question, part } = req.body;
  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      system: `You are an expert IELTS Speaking examiner. Evaluate the student's Part ${part} response against official band descriptors. Return ONLY valid JSON:
{"overall":"6.5","fluency_coherence":"6.5","lexical_precision":"7.0","grammatical_range":"6.0","pronunciation_note":"6.5","strengths":"2-3 specific sentences referencing actual words or phrases from their response.","improvements":"2-3 specific constructive weaknesses from their actual response.","example":"Rewrite one part of their response at band 7+ showing better lexical choice and grammar.","vocabulary":["useful word 1","useful phrase 2","advanced expression 3","idiomatic phrase 4"],"next_steps":"2 concrete practice actions to improve their speaking band."}
Be honest, specific and reference what they actually said.`,
      messages: [{ role: 'user', content: `Part ${part} question: ${question}\n\nStudent transcribed response:\n${response}` }]
    });
    const result = JSON.parse(message.content[0].text.trim().replace(/```json|```/g, '').trim());
    await supabase.from('sessions').insert({ user_id: req.user.id, module: 'speaking', subtype: `Part ${part}`, band: parseFloat(result.overall) });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

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
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════
// GRAMMAR
// ══════════════════════════════════════════════════════════════

app.post('/api/grammar/generate', requireAuth, async (req, res) => {
  const { level, topic } = req.body;
  const grammarTopic = topic || pick(TOPICS.grammar.topics);
  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1200,
      system: `You are an IELTS Grammar expert. Generate 5 varied grammar exercises for ${level} level on the grammar point: "${grammarTopic}". Return ONLY valid JSON array, no markdown:
[{"type":"mcq","point":"Grammar point name","text":"Sentence with a blank _____.","options":["A. option","B. option","C. option","D. option"],"answer":"B. option"},{"type":"fill","point":"Grammar point name","text":"Complete: She _____ (work) here since 2019.","answer":"has worked"},{"type":"error","point":"Grammar point name","sentence":"Full sentence containing exactly one grammatical error.","error":"the incorrect word or phrase","answer":"the corrected word or phrase"}]
Use all 3 types. Use academic and professional IELTS contexts. Avoid textbook cliches. Each exercise must test a different aspect of the grammar point.`,
      messages: [{ role: 'user', content: `Seed ${seed()}. Generate 5 fresh ${level} grammar exercises on: ${grammarTopic}` }]
    });
    const result = JSON.parse(message.content[0].text.trim().replace(/```json|```/g, '').trim());
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/grammar/report', requireAuth, async (req, res) => {
  const { level, topic, correct, total } = req.body;
  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      system: `You are an IELTS Grammar expert. Return ONLY valid JSON:
{"score_label":"e.g. Good - 4 out of 5 correct","strong_areas":["area 1","area 2"],"weak_areas":["area 1"],"key_insight":"2 sentences on the main pattern the student struggles with and why.","ielts_impact":"1-2 sentences on how this grammar point affects their IELTS Writing and Speaking band scores.","study_plan":"3 specific actionable steps to improve this grammar point."}`,
      messages: [{ role: 'user', content: `Level: ${level}, Grammar topic: ${topic}, Score: ${correct}/${total}` }]
    });
    const result = JSON.parse(message.content[0].text.trim().replace(/```json|```/g, '').trim());
    await supabase.from('sessions').insert({ user_id: req.user.id, module: 'grammar', subtype: `${level} - ${topic}`, score_raw: correct, score_total: total });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════
// MOCK EXAM
// ══════════════════════════════════════════════════════════════

app.post('/api/mock/generate', requireAuth, async (req, res) => {
  const { examType } = req.body;
  const topicSet = examType === 'Academic' ? pick(TOPICS.mock.academic_topics) : pick(TOPICS.mock.gt_topics);
  const writingT1topic = examType === 'Academic' ? pick(TOPICS.writing.task1_academic) : pick(TOPICS.writing.task1_gt);
  const writingT2topic = pick(TOPICS.writing.task2);
  const speakingP1 = pick(TOPICS.speaking.part1_topics);
  const speakingP2 = pick(TOPICS.speaking.part2_topics);
  const speakingP3theme = pick(TOPICS.speaking.part3_themes);

  try {
    const [writingRes, listeningRes, readingRes, speakingRes] = await Promise.all([
      anthropic.messages.create({
        model: 'claude-sonnet-4-6', max_tokens: 800,
        system: `Generate two IELTS Writing prompts for ${examType}. Return ONLY valid JSON: {"task1":{"prompt":"Full detailed prompt","minWords":${examType==='Academic'?150:150},"time":"20 minutes"},"task2":{"prompt":"Full discursive question","minWords":250,"time":"40 minutes"}}`,
        messages: [{ role: 'user', content: `Seed ${seed()}. Task 1 about: ${writingT1topic}. Task 2: ${writingT2topic}` }]
      }),
      anthropic.messages.create({
        model: 'claude-sonnet-4-6', max_tokens: 1500,
        system: `Generate an IELTS Listening Section 1 exercise. Return ONLY valid JSON: {"title":"...","description":"...","badge":"...","speakers":[{"name":"...","accent":"british","gender":"female"}],"transcript":"Full realistic dialogue min 250 words with [Name]: format. Include specific numbers, names and details.","questions":[{"type":"fill","text":"...","answer":"..."},{"type":"mcq","text":"...","options":["A....","B....","C....","D...."],"answer":"A...."}]}. Include 5 questions (3 fill, 2 mcq). All answers must come from the transcript.`,
        messages: [{ role: 'user', content: `Seed ${seed()}. Section 1 about: ${topicSet.listening_s1}` }]
      }),
      anthropic.messages.create({
        model: 'claude-sonnet-4-6', max_tokens: 2000,
        system: `Generate an IELTS ${examType} Reading passage with 8 questions. Return ONLY valid JSON: {"title":"...","passage":"Full passage min 500 words using <p> tags with <span class='para-lbl'>A</span> etc.","questions":[{"type":"tfng","text":"...","answer":"TRUE"},{"type":"mcq","text":"...","options":["A....","B....","C....","D...."],"answer":"B...."},{"type":"fill","text":"...","answer":"..."}]}. Mix: 3 TFNG, 3 MCQ, 2 fill. All answers must come from the passage.`,
        messages: [{ role: 'user', content: `Seed ${seed()}. Reading about: ${topicSet.reading}` }]
      }),
      anthropic.messages.create({
        model: 'claude-sonnet-4-6', max_tokens: 600,
        system: `Generate IELTS Speaking questions for all 3 parts. Return ONLY valid JSON: {"part1":{"question":"Personal question","sub":"Follow-up question"},"part2":{"topic":"Cue card title","bullets":["point 1","point 2","point 3","point 4"],"note":"You have 1 minute to prepare."},"part3":{"question":"Abstract discussion question","sub":"Deeper follow-up"}}`,
        messages: [{ role: 'user', content: `Seed ${seed()}. Part 1 about: ${speakingP1}. Part 2: ${speakingP2}. Part 3 theme: ${speakingP3theme}` }]
      })
    ]);

    const writing = JSON.parse(writingRes.content[0].text.trim().replace(/```json|```/g,'').trim());
    const listening = JSON.parse(listeningRes.content[0].text.trim().replace(/```json|```/g,'').trim());
    const reading = JSON.parse(readingRes.content[0].text.trim().replace(/```json|```/g,'').trim());
    const speaking = JSON.parse(speakingRes.content[0].text.trim().replace(/```json|```/g,'').trim());

    res.json({ examType, writing, listening, reading, speaking });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/mock/report', requireAuth, async (req, res) => {
  const { examType, lScore, lTotal, rScore, rTotal, task1, task2, t1Prompt, t2Prompt, sp1, sp2, sp3, sp1Q, sp2Topic, sp3Q } = req.body;
  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1600,
      system: `You are a senior IELTS examiner. Evaluate a full mock ${examType} exam. Return ONLY valid JSON:
{"writing_band":"6.5","speaking_band":"7.0","listening_band":"6.5","reading_band":"7.0","overall_band":"7.0","strongest_skill":"One sentence naming the best skill with specific evidence.","priority_skill":"One sentence on the weakest skill and why it is holding them back.","writing_feedback":"3 specific sentences covering both tasks.","speaking_feedback":"3 sentences on fluency, lexis and grammar across all 3 parts.","listening_feedback":"2 sentences on performance and error patterns.","reading_feedback":"2 sentences on performance and comprehension strategies.","study_plan":"4 specific weekly actions one per skill for the next 30 days.","exam_ready":"Honest 2-sentence assessment: are they ready to sit the real exam and what is their likely band range?"}
Be honest, specific and constructive.`,
      messages: [{ role: 'user', content: `Exam: ${examType}\nListening: ${lScore}/${lTotal}\nReading: ${rScore}/${rTotal}\nWriting Task 1 prompt: ${t1Prompt}\nWriting Task 1: ${task1}\nWriting Task 2 prompt: ${t2Prompt}\nWriting Task 2: ${task2}\nSpeaking Part 1 (${sp1Q}): ${sp1}\nSpeaking Part 2 (${sp2Topic}): ${sp2}\nSpeaking Part 3 (${sp3Q}): ${sp3}` }]
    });
    const result = JSON.parse(message.content[0].text.trim().replace(/```json|```/g,'').trim());
    await supabase.from('sessions').insert({ user_id: req.user.id, module: 'mock', subtype: examType, band: parseFloat(result.overall_band) });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════
// PROFILE & PROGRESS
// ══════════════════════════════════════════════════════════════

app.get('/api/profile', requireAuth, async (req, res) => {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', req.user.id).single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.put('/api/profile', requireAuth, async (req, res) => {
  const { full_name, target_band, exam_type, exam_date } = req.body;
  const { data, error } = await supabase.from('profiles').update({ full_name, target_band, exam_type, exam_date }).eq('id', req.user.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get('/api/progress', requireAuth, async (req, res) => {
  const { data, error } = await supabase.from('sessions').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ══════════════════════════════════════════════════════════════
// CERTIFICATES
// ══════════════════════════════════════════════════════════════

app.get('/api/certificates', requireAuth, async (req, res) => {
  const { data, error } = await supabase.from('certificates').select('*').eq('user_id', req.user.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/certificates/issue', requireAuth, async (req, res) => {
  const { module, band } = req.body;
  const { data, error } = await supabase.from('certificates').upsert({ user_id: req.user.id, module, band }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── START ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`IELTScoreUp API running on port ${PORT}`));
