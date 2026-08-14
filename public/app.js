/* ═══════════════════════════════════════════════════════════
   JobSwipe × Welcome to the Jungle — Dual Platform App Logic
   ═══════════════════════════════════════════════════════════ */

const API = '/api';

// ── Application State ──
let allJobs = [];
let filteredJobs = [];
let currentJobIndex = 0;
let profile = {};
let applications = {};
let activeApplicationId = null;
let currentAuthStep = 1;
let currentAuthMode = 'register'; // 'register' (3-step) | 'login'
let sseSource = null;

// Swipe interaction state
let isDragging = false;
let startX = 0;
let currentX = 0;
let activeCardElement = null;

// ── Initialization ──
document.addEventListener('DOMContentLoaded', () => {
  initSSE();
  loadInitialData();
  setupKeyboardNavigation();
});

// ── SSE: Real-Time Dual Synchronization ──
function initSSE() {
  if (sseSource) sseSource.close();

  sseSource = new EventSource(`${API}/events`);

  sseSource.onopen = () => {
    console.log('[SSE] Connected to JobSwipe Dual-Sync Bridge');
    updateSyncPill(true);
  };

  sseSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleSSEEvent(data);
    } catch (e) {
      console.error('[SSE] Failed to parse event payload:', e);
    }
  };

  sseSource.onerror = () => {
    console.warn('[SSE] Connection lost, retrying in 3s...');
    updateSyncPill(false);
  };
}

function handleSSEEvent(data) {
  if (data.type === 'init') {
    if (data.profile) updateProfileUI(data.profile);
    if (data.applications) {
      applications = data.applications;
      renderWttjApplications();
    }
  } else if (data.type === 'profile_updated' || data.type === 'sync_success') {
    updateProfileUI(data.profile);
    showToast(data.message || 'Profil candidat synchronisé ✓', 'success');
  } else if (data.type === 'application_update') {
    handleApplicationUpdate(data);
  } else if (data.type === 'autopilot_started') {
    setAutoPilotUI(true, data.total);
    showToast(`🚀 Auto-Pilot démarré : ${data.total} candidatures`, 'success');
  } else if (data.type === 'autopilot_progress') {
    handleAutoPilotProgress(data);
  } else if (data.type === 'autopilot_stopped' || data.type === 'autopilot_finished') {
    setAutoPilotUI(false);
    showToast(data.message || 'Auto-Pilot terminé', 'info');
  }
}

// ── Initial API Calls ──
async function loadInitialData() {
  try {
    const [profileRes, jobsRes, appsRes] = await Promise.all([
      fetch(`${API}/profile`).then(r => r.json()),
      fetch(`${API}/jobs`).then(r => r.json()),
      fetch(`${API}/applications`).then(r => r.json())
    ]);

    if (profileRes.success) updateProfileUI(profileRes.profile);
    if (appsRes.success && appsRes.applications) {
      appsRes.applications.forEach(app => {
        applications[app.applicationId] = app;
      });
      renderWttjApplications();
    }
    if (jobsRes.success && jobsRes.jobs) {
      allJobs = jobsRes.jobs;
      filteredJobs = [...allJobs];
      renderCardDeck();
    }
  } catch (err) {
    console.error('[App] Init failed:', err);
  }
}

// ── Profile & Sync UI Updates ──
function updateProfileUI(p) {
  profile = p;
  
  // Sync bar
  document.getElementById('sync-email-display').textContent = p.email || 'Non configuré';
  
  // WTTJ Profile Banner
  const fullName = `${p.firstName || 'Alexandre'} ${p.lastName || 'Dubois'}`.trim();
  document.getElementById('wttj-name-display').textContent = fullName;
  document.getElementById('wttj-title-display').textContent = p.title || 'Développeur Full Stack';
  document.getElementById('wttj-phone-display').textContent = `📱 ${p.phone || '+33 6 12 34 56 78'}`;
  document.getElementById('wttj-cv-display').textContent = `📄 ${p.cvFilename || 'CV_Candidat.pdf'}`;
  document.getElementById('wttj-avail-display').textContent = `⏱️ ${p.availability || 'Immédiate'}`;
  document.getElementById('wttj-doc-name').textContent = p.cvFilename || 'CV_Alexandre_Dubois.pdf';
  document.getElementById('wttj-letter-preview').textContent = p.coverLetter || 'Aucune lettre configurée';

  // Initials
  const initials = `${(p.firstName || 'A')[0]}${(p.lastName || 'D')[0]}`.toUpperCase();
  document.getElementById('wttj-avatar-initials').textContent = initials;
}

function updateSyncPill(isConnected) {
  const bridge = document.getElementById('sync-bridge');
  if (isConnected) {
    bridge.style.borderColor = 'rgba(16, 185, 129, 0.4)';
  } else {
    bridge.style.borderColor = 'rgba(239, 68, 68, 0.4)';
  }
}

// ── Render Tinder Card Stack ──
function renderCardDeck() {
  const deck = document.getElementById('cards-deck');
  deck.innerHTML = '';

  const remaining = filteredJobs.slice(currentJobIndex, currentJobIndex + 3);
  document.getElementById('stat-remaining-count').textContent = Math.max(0, filteredJobs.length - currentJobIndex);

  if (remaining.length === 0) {
    deck.innerHTML = `
      <div class="job-card" style="display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center;">
        <div style="font-size: 48px; margin-bottom: 12px;">🎉</div>
        <h3>Vous avez vu toutes les offres !</h3>
        <p style="color:var(--text-secondary); margin: 8px 0 20px;">Revenez plus tard ou réinitialisez la liste pour continuer à postuler.</p>
        <button class="btn-primary" onclick="resetCards()">🔄 Réinitialiser les offres</button>
      </div>
    `;
    return;
  }

  // Render cards in reverse order so top card is on top
  remaining.reverse().forEach((job, idx) => {
    const isTop = (idx === remaining.length - 1);
    const cardEl = createCardElement(job, isTop, remaining.length - 1 - idx);
    deck.appendChild(cardEl);
  });

  if (isTopCardAvailable()) {
    attachDragListeners(activeCardElement);
  }
}

function createCardElement(job, isTop, depth) {
  const card = document.createElement('div');
  card.className = 'job-card';
  card.id = `job-card-${job.id || depth}`;
  card.style.zIndex = depth === 0 ? 10 : (depth === 1 ? 5 : 1);
  card.style.transform = `scale(${1 - depth * 0.04}) translateY(${depth * 10}px)`;

  if (isTop) activeCardElement = card;

  const initial = (job.company || 'W')[0].toUpperCase();
  const tagsHtml = (job.tags || ['CDI', 'Temps plein', 'Tech']).slice(0, 4).map(t => `<span class="tag-badge">${t}</span>`).join('');

  card.innerHTML = `
    <!-- Top Stamp Badges -->
    <div class="stamp-overlay stamp-apply">APPLY ⚡</div>
    <div class="stamp-overlay stamp-pass">PASSER ✕</div>

    <!-- Header Row -->
    <div class="card-header-row">
      <div class="company-badge">
        <div class="company-logo">${initial}</div>
        <div class="company-meta">
          <strong>${job.company || 'Entreprise WTTJ'}</strong>
          <span>📍 ${job.location || 'Paris, France'}</span>
        </div>
      </div>
      <span class="wttj-source-tag">WTTJ Vérifié ✓</span>
    </div>

    <!-- Body -->
    <div class="card-body">
      <h3 class="job-title">${job.title || 'Développeur Full Stack'}</h3>
      <div class="tags-row">${tagsHtml}</div>
      <p class="job-desc">${job.description || "Rejoignez une équipe technique passionnée pour concevoir des produits modernes et scalables sur Welcome to the Jungle."}</p>
    </div>

    <!-- Footer Meta -->
    <div class="card-footer-meta">
      <span>💰 ${job.salary || '45k€ - 65k€'}</span>
      <span>⏱️ ${job.contract || 'CDI'}</span>
    </div>
  `;

  return card;
}

function isTopCardAvailable() {
  return activeCardElement !== null;
}

// ── Swipe Physics & Dragging ──
function attachDragListeners(card) {
  if (!card) return;

  const onStart = (e) => {
    isDragging = true;
    startX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
    card.style.transition = 'none';
  };

  const onMove = (e) => {
    if (!isDragging) return;
    currentX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
    const deltaX = currentX - startX;
    const rotate = deltaX * 0.08;

    card.style.transform = `translateX(${deltaX}px) rotate(${rotate}deg)`;

    // Show stamps
    const applyStamp = card.querySelector('.stamp-apply');
    const passStamp = card.querySelector('.stamp-pass');

    if (deltaX > 40) {
      applyStamp.style.opacity = Math.min(1, (deltaX - 40) / 80);
      passStamp.style.opacity = 0;
    } else if (deltaX < -40) {
      passStamp.style.opacity = Math.min(1, (-deltaX - 40) / 80);
      applyStamp.style.opacity = 0;
    } else {
      applyStamp.style.opacity = 0;
      passStamp.style.opacity = 0;
    }
  };

  const onEnd = () => {
    if (!isDragging) return;
    isDragging = false;
    card.style.transition = 'transform 0.3s ease, opacity 0.3s ease';

    const deltaX = currentX - startX;
    if (deltaX > 120) {
      triggerSwipe('right');
    } else if (deltaX < -120) {
      triggerSwipe('left');
    } else {
      card.style.transform = '';
      card.querySelectorAll('.stamp-overlay').forEach(s => s.style.opacity = 0);
    }
  };

  card.addEventListener('mousedown', onStart);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onEnd);

  card.addEventListener('touchstart', onStart);
  window.addEventListener('touchmove', onMove);
  window.addEventListener('touchend', onEnd);
}

// ── Swiping Actions (Apply vs Pass) ──
function triggerSwipe(direction) {
  if (currentJobIndex >= filteredJobs.length) return;

  const currentJob = filteredJobs[currentJobIndex];
  const card = activeCardElement;

  if (card) {
    card.style.transition = 'transform 0.4s ease-out, opacity 0.3s ease';
    if (direction === 'right') {
      card.style.transform = 'translateX(600px) rotate(30deg)';
      card.style.opacity = 0;
      handleApplyAction(currentJob);
    } else {
      card.style.transform = 'translateX(-600px) rotate(-30deg)';
      card.style.opacity = 0;
      showToast(`Offre passée : ${currentJob.title}`, 'info');
    }
  }

  currentJobIndex++;
  setTimeout(() => {
    renderCardDeck();
  }, 250);
}

// ── Launching 7-Step AutoApply Pipeline ──
async function handleApplyAction(job) {
  document.getElementById('stat-applied-count').textContent = 
    parseInt(document.getElementById('stat-applied-count').textContent || 0) + 1;

  // Open the 7-Step Pipeline Drawer
  openPipelineOverlay(job);
  addTerminalLog(`[Swipe] Right-swipe triggered on "${job.title} @ ${job.company}"`, 'info');

  try {
    const res = await fetch(`${API}/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job })
    });
    const data = await res.json();

    if (data.success) {
      activeApplicationId = data.applicationId;
      applications[data.applicationId] = data.application;
      renderWttjApplications();
      addTerminalLog(`[Pipeline] Session #${data.applicationId} linked to Welcome to the Jungle`, 'success');
    }
  } catch (err) {
    console.error('[Apply] Failed:', err);
    showToast('Erreur lors du lancement de la candidature', 'error');
  }
}

// ── Application Updates & 7-Step Rendering ──
function handleApplicationUpdate(data) {
  const appId = data.applicationId;
  if (!applications[appId]) {
    applications[appId] = { applicationId: appId, job: data.job || {}, steps: [], status: 'active', currentStep: 1 };
  }

  const app = applications[appId];
  if (data.job) app.job = data.job;
  if (data.status) app.status = data.status;
  if (data.stepNumber) app.currentStep = data.stepNumber;

  // Update Right Panel Applications Table
  renderWttjApplications();

  // Log in Terminal
  if (data.message) {
    const logType = data.status === 'error' ? 'error' : (data.status === 'completed' ? 'success' : 'info');
    addTerminalLog(`[Step ${data.stepNumber || '⚡'}] ${data.message}`, logType);
  }

  // If this is the active application in the Pipeline Drawer, update the 7 steps
  if (appId === activeApplicationId || !activeApplicationId) {
    updatePipelineStep(data.stepNumber, data.status, data.message, data.screenshot);
  }
}

function updatePipelineStep(stepNumber, status, message, screenshot) {
  if (!stepNumber) return;

  for (let i = 1; i <= 7; i++) {
    const stepEl = document.getElementById(`p-step-${i}`);
    if (!stepEl) continue;

    if (i < stepNumber) {
      stepEl.className = 'p-step completed';
      stepEl.querySelector('.p-step-status').innerHTML = '✓';
    } else if (i === stepNumber) {
      if (status === 'completed' && i === 7) {
        stepEl.className = 'p-step completed';
        stepEl.querySelector('.p-step-status').innerHTML = '✓';
      } else {
        stepEl.className = 'p-step active';
        stepEl.querySelector('.p-step-status').innerHTML = '<span class="step-spinner"></span>';
      }
    } else {
      stepEl.className = 'p-step';
      stepEl.querySelector('.p-step-status').innerHTML = '⏳';
    }
  }

  if (message) {
    document.getElementById('pipeline-footer-status').textContent = message;
  }

  if (screenshot) {
    const img = document.getElementById('pipeline-live-screenshot');
    img.src = screenshot;
    img.style.display = 'block';
  }
}

// ── Render Right Panel Applications Table ──
function renderWttjApplications() {
  const container = document.getElementById('wttj-applications-list');
  const appList = Object.values(applications);

  document.getElementById('wttj-apps-count').textContent = appList.length;

  if (appList.length === 0) {
    container.innerHTML = `
      <div class="empty-wttj-state">
        <div class="empty-icon">📂</div>
        <h4>Aucune candidature pour le moment</h4>
        <p>Swiper à droite sur JobSwipe pour postuler automatiquement sur Welcome to the Jungle.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = appList.map(app => {
    const jobTitle = app.job ? app.job.title : 'Développeur';
    const company = app.job ? app.job.company : 'WTTJ Entreprise';
    const isDone = app.status === 'completed';
    const statusText = isDone ? 'Transmise ✓' : (app.status === 'error' ? 'Erreur ✕' : `Étape ${app.currentStep || 1}/7 ⚡`);
    const statusClass = isDone ? 'completed' : 'active';

    return `
      <div class="wttj-app-item">
        <div class="app-meta">
          <strong>${jobTitle}</strong>
          <span>${company}</span>
        </div>
        <div>
          <span class="status-badge-live ${statusClass}">${statusText}</span>
        </div>
        <div>
          <button class="btn-outline-sm" onclick="reopenPipeline('${app.applicationId}')">Suivi</button>
        </div>
      </div>
    `;
  }).join('');
}

function addTerminalLog(text, type = 'info') {
  const feed = document.getElementById('terminal-feed');
  if (!feed) return;

  const line = document.createElement('div');
  line.className = `log-line ${type}`;
  const time = new Date().toLocaleTimeString();
  line.textContent = `[${time}] ${text}`;

  feed.appendChild(line);
  feed.scrollTop = feed.scrollHeight;
}

// ── Modals & Overlays ──
function openAuthModal(mode = 'register') {
  setAuthMode(mode);
  document.getElementById('modal-auth').classList.add('active');
}

function closeAuthModal() {
  document.getElementById('modal-auth').classList.remove('active');
}

function setAuthMode(mode) {
  currentAuthMode = mode;
  const isRegister = mode === 'register';

  document.getElementById('btn-mode-register').classList.toggle('active', isRegister);
  document.getElementById('btn-mode-login').classList.toggle('active', !isRegister);
  document.getElementById('stepper-bar').style.display = isRegister ? 'flex' : 'none';

  if (isRegister) {
    goToStep(1);
    document.getElementById('form-step-login').style.display = 'none';
  } else {
    document.querySelectorAll('.form-step').forEach(s => s.style.display = 'none');
    document.getElementById('form-step-login').style.display = 'flex';
  }
}

function goToStep(step) {
  currentAuthStep = step;
  document.querySelectorAll('.form-step').forEach(s => s.classList.remove('active'));
  document.getElementById(`form-step-${step}`).classList.add('active');

  for (let i = 1; i <= 3; i++) {
    const ind = document.getElementById(`step-ind-${i}`);
    if (i <= step) {
      ind.classList.add('active');
    } else {
      ind.classList.remove('active');
    }
  }
}

// ── Onboarding Form Submission (3-Step) ──
async function handleOnboardingSubmit(event) {
  event.preventDefault();
  const btn = document.getElementById('btn-save-onboarding');
  btn.disabled = true;

  const payload = {
    email: document.getElementById('input-email').value,
    password: document.getElementById('input-password').value,
    firstName: document.getElementById('input-firstname').value,
    lastName: document.getElementById('input-lastname').value,
    phone: document.getElementById('input-phone').value,
    availability: document.getElementById('input-availability').value,
    title: document.getElementById('input-title').value,
    linkedin: document.getElementById('input-linkedin').value,
    coverLetter: document.getElementById('input-coverletter').value
  };

  try {
    const res = await fetch(`${API}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (data.success) {
      updateProfileUI(data.profile);
      closeAuthModal();
      showToast('🎉 Configuration terminée & synchronisée !', 'success');
      addTerminalLog(`[Auth] Full synchronized registration for ${payload.email}`, 'success');
    } else {
      showToast(data.error || 'Erreur lors de l\'enregistrement', 'error');
    }
  } catch (err) {
    showToast('Erreur serveur lors de la synchronisation', 'error');
  } finally {
    btn.disabled = false;
  }
}

// ── Quick Login ──
async function handleQuickLogin() {
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const cookieVal = document.getElementById('login-cookie') ? document.getElementById('login-cookie').value.trim() : '';

  let wttjCookies = [];
  if (cookieVal) {
    if (cookieVal.includes('=')) {
      // Parse cookie string
      wttjCookies = cookieVal.split(';').map(pair => {
        const [k, ...v] = pair.trim().split('=');
        return {
          name: k,
          value: v.join('='),
          domain: '.welcometothejungle.com',
          path: '/'
        };
      });
    } else {
      // Single token assumed as wttj_api_session_key
      wttjCookies = [{
        name: 'wttj_api_session_key',
        value: cookieVal,
        domain: '.welcometothejungle.com',
        path: '/'
      }];
    }
  }

  try {
    const res = await fetch(`${API}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        email, 
        password,
        wttjCookies: wttjCookies.length > 0 ? wttjCookies : undefined
      })
    });
    const data = await res.json();

    if (data.success) {
      updateProfileUI(data.profile);
      closeAuthModal();
      showToast('Connexion réussie & session WTTJ liée !', 'success');
    } else {
      showToast(data.error || 'Identifiants invalides', 'error');
    }
  } catch (e) {
    showToast('Erreur de connexion', 'error');
  }
}

// ── Manual Browser Login ──
async function launchManualBrowserLogin() {
  showToast('🌐 Ouverture de Chrome pour la connexion...', 'info');
  try {
    const res = await fetch(`${API}/auth/manual-login`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      addTerminalLog('[Auth] Fenêtre Chrome interactive lancée pour validation Gmail', 'info');
    } else {
      showToast(data.error || 'Erreur lors de l\'ouverture du navigateur', 'error');
    }
  } catch (err) {
    showToast('Erreur serveur', 'error');
  }
}

// ── CV File Upload ──
async function handleCvFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  document.getElementById('dropzone-filename').textContent = file.name;

  const formData = new FormData();
  formData.append('cvFile', file);

  try {
    const res = await fetch(`${API}/upload-cv`, {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      document.getElementById('wttj-cv-display').textContent = `📄 ${data.filename}`;
    }
  } catch (err) {
    showToast('Échec du téléversement du CV', 'error');
  }
}

// ── Pipeline Drawer Controls ──
function openPipelineOverlay(job) {
  document.getElementById('pipeline-job-title').textContent = job.title;
  document.getElementById('pipeline-company').textContent = `${job.company} · ${job.location || 'Paris'}`;
  
  // Reset steps
  updatePipelineStep(1, 'active', 'Initialisation du pipeline en 7 étapes...');
  document.getElementById('pipeline-overlay').classList.add('active');
}

function closePipelineOverlay() {
  document.getElementById('pipeline-overlay').classList.remove('active');
}

function reopenPipeline(appId) {
  activeApplicationId = appId;
  const app = applications[appId];
  if (app && app.job) {
    openPipelineOverlay(app.job);
    if (app.currentStep) {
      updatePipelineStep(app.currentStep, app.status, `Suivi de la candidature #${appId}`, app.latestScreenshot);
    }
  }
}

// ── WTTJ Sub-tab Switching ──
function switchWttjTab(tab) {
  document.querySelectorAll('.wttj-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.wttj-tab-content').forEach(c => c.classList.remove('active'));

  document.getElementById(`wttj-tab-btn-${tab}`).classList.add('active');
  document.getElementById(`wttj-view-${tab}`).classList.add('active');
}

// ── Filters & Card Helpers ──
function filterJobs(tag) {
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  event.target.classList.add('active');

  if (tag === 'all') {
    filteredJobs = [...allJobs];
  } else if (tag === 'remote') {
    filteredJobs = allJobs.filter(j => (j.location || '').toLowerCase().includes('remote') || (j.title || '').toLowerCase().includes('remote'));
  } else if (tag === 'paris') {
    filteredJobs = allJobs.filter(j => (j.location || '').toLowerCase().includes('paris'));
  } else if (tag === 'react') {
    filteredJobs = allJobs.filter(j => (j.title || '').toLowerCase().includes('react') || (j.title || '').toLowerCase().includes('front'));
  }

  currentJobIndex = 0;
  renderCardDeck();
}

function resetCards() {
  currentJobIndex = 0;
  renderCardDeck();
  showToast('Offres réinitialisées', 'info');
}

function triggerSaveJob() {
  if (currentJobIndex < filteredJobs.length) {
    const job = filteredJobs[currentJobIndex];
    showToast(`⭐ Offre sauvegardée : ${job.title}`, 'info');
  }
}

// ── Keyboard Navigation ──
function setupKeyboardNavigation() {
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.key === 'ArrowRight') {
      triggerSwipe('right');
    } else if (e.key === 'ArrowLeft') {
      triggerSwipe('left');
    } else if (e.key === 'Escape') {
      closeAuthModal();
      closePipelineOverlay();
    }
  });
}

// ── Toast Notifications ──
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Layout Switch
function toggleLayoutMode() {
  const container = document.querySelector('.dual-container');
  if (container.style.gridTemplateColumns === '1fr') {
    container.style.gridTemplateColumns = '1fr 1fr';
  } else {
    container.style.gridTemplateColumns = '1fr';
  }
}

// ── FULL AUTOMATION: AUTO-PILOT MODE ──
let isAutoPilotActive = false;

async function toggleAutoPilot() {
  const btn = document.getElementById('btn-toggle-autopilot');
  
  if (isAutoPilotActive) {
    // Stop Auto-Pilot
    try {
      await fetch(`${API}/autopilot/stop`, { method: 'POST' });
      setAutoPilotUI(false);
      showToast('⏸️ Auto-Pilot mis en pause', 'info');
    } catch (e) {}
  } else {
    // Start Auto-Pilot
    const jobsToApply = filteredJobs.slice(currentJobIndex, currentJobIndex + 25);
    if (jobsToApply.length === 0) {
      showToast('Aucune offre restante à traiter', 'warning');
      return;
    }

    btn.disabled = true;
    try {
      const res = await fetch(`${API}/autopilot/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobs: jobsToApply, limit: 25 })
      });
      const data = await res.json();
      if (data.success) {
        setAutoPilotUI(true, jobsToApply.length);
      } else {
        showToast(data.error || 'Impossible de démarrer l\'auto-pilot', 'error');
      }
    } catch (err) {
      showToast('Erreur serveur auto-pilot', 'error');
    } finally {
      btn.disabled = false;
    }
  }
}

function setAutoPilotUI(isActive, total = 0) {
  isAutoPilotActive = isActive;
  const btn = document.getElementById('btn-toggle-autopilot');
  const statusText = document.getElementById('autopilot-status-text');

  if (isActive) {
    btn.className = 'btn-autopilot running';
    btn.innerHTML = '<span>⏸️ Arrêter l\'Auto-Pilot</span>';
    statusText.innerHTML = `<strong>🟢 En cours d'exécution :</strong> Traitement de ${total} candidatures en boucle...`;
  } else {
    btn.className = 'btn-autopilot';
    btn.innerHTML = '<span>▶ Démarrer l\'Auto-Pilot (Full Auto)</span>';
    statusText.textContent = 'Postule automatiquement à toutes les offres WTTJ en boucle';
  }
}

function handleAutoPilotProgress(data) {
  document.getElementById('stat-applied-count').textContent = data.index;
  document.getElementById('autopilot-status-text').innerHTML = 
    `<strong>⚡ Envoi ${data.index}/${data.total} :</strong> ${data.job?.title} @ ${data.job?.company}`;

  // Automatically advance card deck with animation
  const card = activeCardElement;
  if (card) {
    card.style.transition = 'transform 0.4s ease-out, opacity 0.3s ease';
    card.style.transform = 'translateX(600px) rotate(30deg)';
    card.style.opacity = 0;
  }

  currentJobIndex++;
  setTimeout(() => {
    renderCardDeck();
  }, 300);

  addTerminalLog(`[AutoPilot ${data.index}/${data.total}] ${data.job?.title} @ ${data.job?.company} -> Transmis ✓`, 'success');
}
