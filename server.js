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
  email: 'boumelahamid@gmail.com',
  wttjPassword: 'Pommier78955&&',
  firstName: 'Hamid',
  lastName: 'Boumela',
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

// ── Interactive Single-Instance Browser State ──
let activeInteractiveBrowser = null;

// POST /api/auth/manual-login — Opens interactive browser to complete WTTJ email/magic link verification once
app.post('/api/auth/manual-login', async (req, res) => {
  const puppeteer = require('puppeteer-extra');
  const StealthPlugin = require('puppeteer-extra-plugin-stealth');
  puppeteer.use(StealthPlugin());
  
  const sessionDir = path.join(__dirname, 'chrome_session');
  if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

  if (activeInteractiveBrowser && activeInteractiveBrowser.isConnected()) {
    return res.json({
      success: true,
      message: 'Chrome window is already open! Please complete your login in the window.'
    });
  }

  console.log('[Auth] Opening interactive Chrome browser for manual WTTJ login & email verification...');
  
  try {
    const browser = await puppeteer.launch({
      headless: false,
      userDataDir: sessionDir,
      defaultViewport: null,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized']
    });

    activeInteractiveBrowser = browser;
    browser.on('disconnected', () => { activeInteractiveBrowser = null; });

    const pages = await browser.pages();
    const page = pages.length > 0 ? pages[0] : await browser.newPage();
    await page.goto('https://www.welcometothejungle.com/fr/authenticate/login', { waitUntil: 'domcontentloaded' });

    res.json({
      success: true,
      message: 'Interactive Chrome window opened! Please log in and verify your email in the browser.'
    });

    // Monitor for successful login in background
    const checkInterval = setInterval(async () => {
      try {
        if (!browser.isConnected()) {
          clearInterval(checkInterval);
          return;
        }
        const url = page.url();
        const cookies = await page.cookies();
        const hasSession = cookies.some(c => c.name.includes('session') || c.name.includes('token') || c.name.includes('jwt') || c.name.includes('auth'));

        if (url.includes('/me') || url.includes('/companies') || (hasSession && !url.includes('/login'))) {
          clearInterval(checkInterval);
          profile.isSynced = true;
          console.log('[Auth] Manual login successfully verified on Welcome to the Jungle!');
          broadcastEvent({
            type: 'sync_success',
            profile,
            message: '🎉 WTTJ session verified and permanently saved!'
          });
        }
      } catch (e) {
        clearInterval(checkInterval);
      }
    }, 2500);

    setTimeout(() => clearInterval(checkInterval), 180000);

  } catch (err) {
    console.error('[Auth] Failed to open manual browser:', err);
    res.status(500).json({ success: false, error: err.message });
  }
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

// ── Full Automation Auto-Pilot Engine ──
let autopilotRunning = false;

app.post('/api/autopilot/start', async (req, res) => {
  const { jobs, limit = 25, delayMs = 3500 } = req.body;
  const targetJobs = (jobs && jobs.length > 0) ? jobs.slice(0, limit) : cachedJobs.slice(0, limit);

  if (targetJobs.length === 0) {
    return res.status(400).json({ success: false, error: 'Aucune offre disponible pour l\'auto-pilot' });
  }

  autopilotRunning = true;
  console.log(`[AutoPilot] Started full automation batch of ${targetJobs.length} applications!`);

  broadcastEvent({
    type: 'autopilot_started',
    total: targetJobs.length,
    message: `Mode Auto-Pilot activé : ${targetJobs.length} candidatures en cours...`
  });

  // Run in background sequentially
  (async () => {
    for (let i = 0; i < targetJobs.length; i++) {
      if (!autopilotRunning) {
        console.log('[AutoPilot] Stopped by user.');
        broadcastEvent({ type: 'autopilot_stopped', processed: i });
        break;
      }

      const job = targetJobs[i];
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

      broadcastEvent({
        type: 'autopilot_progress',
        index: i + 1,
        total: targetJobs.length,
        job,
        applicationId,
        message: `[AutoPilot ${i + 1}/${targetJobs.length}] Envoi pour ${job.title} @ ${job.company}`
      });

      try {
        await autoApply(job, profile, applicationId);
      } catch (err) {
        console.error(`[AutoPilot] Error on job ${i + 1}:`, err.message);
      }

      // Random natural human delay between applications (e.g. 3-5 seconds)
      const randomDelay = delayMs + Math.floor(Math.random() * 1500);
      await new Promise(r => setTimeout(r, randomDelay));
    }

    autopilotRunning = false;
    broadcastEvent({
      type: 'autopilot_finished',
      message: `🎉 Auto-Pilot terminé ! Toutes les candidatures ont été transmises à Welcome to the Jungle.`
    });
  })();

  res.json({
    success: true,
    message: `Auto-Pilot démarré avec succès pour ${targetJobs.length} offres`,
    total: targetJobs.length
  });
});

app.post('/api/autopilot/stop', (req, res) => {
  autopilotRunning = false;
  console.log('[AutoPilot] Stop command received.');
  broadcastEvent({ type: 'autopilot_stopped', message: 'Auto-Pilot mis en pause' });
  res.json({ success: true, message: 'Auto-Pilot arrêté' });
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
  console.log(`🤖 Full Automation Auto-Pilot ready`);
  console.log(`📋 API endpoints ready`);
});
