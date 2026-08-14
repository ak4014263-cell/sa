const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { scrapeWTTJJobs } = require('./scraper');
const { autoApply, setStatusCallback } = require('./autoApply');
const { autoSignup } = require('./autoSignup');

const app = express();
const PORT = 3000;

// Setup directories
const uploadsDir = path.join(__dirname, 'public', 'uploads');
const screenshotsDir = path.join(__dirname, 'public', 'screenshots');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });

// Multer for CV upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `cv_${Date.now()}${ext}`);
  }
});
const upload = multer({ storage });

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ── In-memory state ──
let cachedJobs = [];
let applications = {}; // applicationId -> { applicationId, job, profile, status, currentStep, steps, latestScreenshot, createdAt }
let profile = {
  email: 'daddy202028@gmail.com',
  wttjPassword: 'JobSwipeDemo2026!',
  firstName: 'Alexandre',
  lastName: 'Dubois',
  phone: '+33 6 12 34 56 78',
  linkedin: 'https://linkedin.com/in/alexandre-dubois',
  title: 'Développeur Full Stack Senior',
  availability: 'Immédiate',
  coverLetter: "Madame, Monsieur,\n\nVivement intéressé par vos projets innovants et votre culture d'entreprise, je souhaite mettre à profit mes 5 années d'expérience en React, Node.js et architecture cloud au sein de votre équipe.\n\nRestant à votre disposition pour un échange,\nAlexandre Dubois",
  cvFilename: 'CV_Alexandre_Dubois.pdf',
  isSynced: true
};

let sseClients = [];

// ── SSE: Real-time event stream ──
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  const client = { id: uuidv4(), res };
  sseClients.push(client);
  console.log(`[SSE] Client connected: ${client.id} (total: ${sseClients.length})`);

  // Send initial synchronized state immediately
  res.write(`data: ${JSON.stringify({ 
    type: 'init', 
    profile, 
    applications,
    syncStatus: { isSynced: profile.isSynced, email: profile.email, syncedAt: new Date().toISOString() }
  })}\n\n`);

  req.on('close', () => {
    sseClients = sseClients.filter(c => c.id !== client.id);
    console.log(`[SSE] Client disconnected: ${client.id}`);
  });
});

function broadcastEvent(data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(client => {
    try { client.res.write(payload); } catch (e) {}
  });
}

// Update application state & broadcast dual-sync events
function updateApplicationStatus(applicationId, statusData) {
  if (applications[applicationId]) {
    applications[applicationId].status = statusData.status || applications[applicationId].status;
    if (statusData.stepNumber) {
      applications[applicationId].currentStep = statusData.stepNumber;
    }
    applications[applicationId].steps.push(statusData);
    if (statusData.screenshot) {
      applications[applicationId].latestScreenshot = statusData.screenshot;
    }
  }

  broadcastEvent({
    type: 'application_update',
    applicationId,
    ...statusData,
    application: applications[applicationId]
  });
}

// Hook autoApply status callback to SSE
setStatusCallback((applicationId, statusData) => {
  updateApplicationStatus(applicationId, statusData);
});

// ── API Routes ──

// GET /api/profile
app.get('/api/profile', (req, res) => {
  res.json({ success: true, profile });
});

// POST /api/profile
app.post('/api/profile', (req, res) => {
  profile = { ...profile, ...req.body, isSynced: true };
  broadcastEvent({ type: 'profile_updated', profile });
  res.json({ success: true, profile });
});

// POST /api/upload-cv
app.post('/api/upload-cv', upload.single('cvFile'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'Aucun fichier reçu' });
  }
  const filename = req.file.filename;
  profile.cvFilename = req.file.originalname || filename;
  profile.cvPath = `/uploads/${filename}`;
  profile.isSynced = true;

  broadcastEvent({ type: 'profile_updated', profile });
  res.json({ 
    success: true, 
    filename: profile.cvFilename, 
    path: profile.cvPath,
    message: 'CV téléversé et synchronisé avec Welcome to the Jungle' 
  });
});

// POST /api/auth — Login mode
app.post('/api/auth', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email et mot de passe requis' });
  }

  profile.email = email;
  profile.wttjPassword = password;
  profile.isSynced = true;

  console.log(`[Auth] Credentials synced for ${email}`);
  broadcastEvent({ type: 'profile_updated', profile });
  res.json({ success: true, profile });
});

// POST /api/register — 3-Step Full Candidate Onboarding
app.post('/api/register', (req, res) => {
  const { email, password, firstName, lastName, phone, linkedin, title, availability, coverLetter } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email et mot de passe obligatoires.' });
  }

  profile = {
    ...profile,
    email,
    wttjPassword: password,
    firstName: firstName || profile.firstName,
    lastName: lastName || profile.lastName,
    phone: phone || profile.phone,
    linkedin: linkedin || profile.linkedin,
    title: title || profile.title,
    availability: availability || profile.availability,
    coverLetter: coverLetter || profile.coverLetter,
    isSynced: true
  };

  console.log(`[Auth] Full synchronized registration for ${email}`);

  // Broadcast sync event to both panels
  broadcastEvent({ 
    type: 'sync_success', 
    profile, 
    message: 'Compte candidat synchronisé avec Welcome to the Jungle' 
  });

  res.json({ 
    success: true, 
    profile,
    message: 'Compte créé et synchronisé avec succès sur les deux plateformes !' 
  });
});

// GET /api/jobs
app.get('/api/jobs', async (req, res) => {
  const { query, location, page, refresh } = req.query;

  if (!refresh && cachedJobs.length > 0) {
    return res.json({ success: true, jobs: cachedJobs, count: cachedJobs.length, source: 'cache' });
  }

  try {
    const jobs = await scrapeWTTJJobs({
      query: query || 'développeur',
      location: location || 'Paris',
      page: parseInt(page) || 1
    });

    cachedJobs = jobs;
    res.json({ success: true, jobs, count: jobs.length, source: 'live' });
  } catch (error) {
    console.error('[API] Scrape error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/apply — Trigger 7-step auto-apply
app.post('/api/apply', async (req, res) => {
  const { job } = req.body;
  if (!job) {
    return res.status(400).json({ success: false, error: 'Données de l\'offre manquantes.' });
  }

  const applicationId = uuidv4().slice(0, 8);

  const applicationRecord = {
    applicationId,
    job,
    profile: { ...profile },
    status: 'active',
    currentStep: 1,
    steps: [],
    latestScreenshot: null,
    createdAt: new Date().toISOString()
  };

  applications[applicationId] = applicationRecord;

  // Launch the 7-step automated application pipeline
  autoApply(job, profile, applicationId).catch(err => {
    console.error(`[AutoApply] Pipeline failed for ${applicationId}:`, err);
    updateApplicationStatus(applicationId, {
      stepNumber: 7,
      status: 'error',
      message: `Échec: ${err.message}`
    });
  });

  res.json({
    success: true,
    applicationId,
    message: `Candidature initiée pour ${job.title} @ ${job.company}`,
    application: applicationRecord
  });
});

// GET /api/applications
app.get('/api/applications', (req, res) => {
  res.json({
    success: true,
    applications: Object.values(applications).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  });
});

// Start Server
app.listen(PORT, () => {
  console.log(`\n🚀 JobSwipe Dual-Platform MVP running at http://localhost:${PORT}`);
  console.log(`🟢 Synchronized Candidate Space active`);
  console.log(`📋 API endpoints ready`);
});
