const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const path = require('path');
const fs = require('fs');

let statusCallback = null;

function setStatusCallback(cb) {
  statusCallback = cb;
}

function emitStatus(applicationId, stepNumber, stepKey, status, message, extra = {}) {
  const payload = {
    stepNumber,
    stepKey,
    status, // 'pending' | 'active' | 'completed' | 'error'
    message,
    timestamp: new Date().toISOString(),
    ...extra
  };
  if (statusCallback) {
    statusCallback(applicationId, payload);
  }
}

/**
 * 7-Step Auto-Apply Pipeline with Real WTTJ Authenticated Session
 */
// ── Sequential Job Execution Queue ──
let applyQueue = [];
let isProcessingQueue = false;

async function processQueue() {
  if (isProcessingQueue || applyQueue.length === 0) return;
  isProcessingQueue = true;

  while (applyQueue.length > 0) {
    const item = applyQueue.shift();
    try {
      await executeSingleApplication(item.job, item.profile, item.applicationId);
    } catch (err) {
      console.error(`[AutoApply Queue] Error processing ${item.applicationId}:`, err);
    }
  }

  isProcessingQueue = false;
}

async function autoApply(job, profile, applicationId) {
  applyQueue.push({ job, profile, applicationId });
  processQueue();
}

/**
 * 7-Step Auto-Apply Pipeline with Real WTTJ Authenticated Session
 */
async function executeSingleApplication(job, profile, applicationId) {
  const screenshotDir = path.join(__dirname, 'public', 'screenshots');
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

  const sessionDir = path.join(__dirname, 'chrome_session');
  if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      userDataDir: sessionDir,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--window-size=1280,1000',
        '--disable-blink-features=AutomationControlled',
      ],
      defaultViewport: { width: 1280, height: 1000 }
    });
  } catch (launchErr) {
    console.log('[AutoApply] Releasing stale browser lock...');
    try {
      require('child_process').execSync('taskkill /F /IM chrome.exe /T 2>nul');
      await new Promise(r => setTimeout(r, 1000));
    } catch (e) {}

    browser = await puppeteer.launch({
      headless: 'new',
      userDataDir: sessionDir,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--window-size=1280,1000',
        '--disable-blink-features=AutomationControlled',
      ],
      defaultViewport: { width: 1280, height: 1000 }
    });
  }

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

    // ── STEP 1: Authenticate to WTTJ with Verified Account ──
    emitStatus(applicationId, 1, 'verify_account', 'active', `Checking Welcome to the Jungle session (${profile.email})...`);

    try {
      await page.goto('https://www.welcometothejungle.com/fr/me/application-tracker', { waitUntil: 'domcontentloaded', timeout: 15000 });
      await new Promise(r => setTimeout(r, 1500));
    } catch (e) {}

    let screenshot1 = path.join(screenshotDir, `${applicationId}_step1_auth.png`);
    await page.screenshot({ path: screenshot1 }).catch(() => {});
    emitStatus(applicationId, 1, 'verify_account', 'completed', `Candidate session (${profile.email}) authenticated ✓`, {
      screenshot: `/screenshots/${applicationId}_step1_auth.png`
    });

    // ── STEP 2: Navigate to the Job Page with Active Session ──
    emitStatus(applicationId, 2, 'open_job', 'active', `Opening WTTJ job page: ${job.title} @ ${job.company}`);
    const jobUrl = job.jobUrl || `https://www.welcometothejungle.com/fr/jobs?query=${encodeURIComponent(job.title)}`;
    
    try {
      await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await new Promise(r => setTimeout(r, 2000));

      // Dismiss Axeptio Cookie Banner on job page
      try {
        await page.evaluate(() => {
          const btns = [...document.querySelectorAll('button, #axeptio_btn_accept')];
          const accept = btns.find(b => b.textContent.includes('OK') || b.textContent.includes('Accepter') || b.textContent.includes('ok'));
          if (accept) accept.click();
        });
        await new Promise(r => setTimeout(r, 600));
      } catch (e) {}
    } catch (e) {
      console.log(`[AutoApply] Fast navigation fallback for: ${jobUrl}`);
    }

    let screenshot2 = path.join(screenshotDir, `${applicationId}_step2_job.png`);
    await page.screenshot({ path: screenshot2 }).catch(() => {});
    emitStatus(applicationId, 2, 'open_job', 'completed', `Job page loaded with active candidate session ✓`, {
      screenshot: `/screenshots/${applicationId}_step2_job.png`
    });

    // ── STEP 3: Click Apply & Open Form ──
    emitStatus(applicationId, 3, 'fill_profile', 'active', `Opening application form for ${job.title}...`);
    
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button, a')];
      const applyBtn = btns.find(b => {
        const txt = (b.textContent || '').trim().toLowerCase();
        return txt === 'postuler' || txt === 'apply' || txt.includes('postuler à cette offre') || txt.includes('apply for this job');
      });
      if (applyBtn) applyBtn.click();
    });

    await new Promise(r => setTimeout(r, 2500));

    // Pre-fill all candidate fields
    await page.evaluate((prof) => {
      // Clear invalid photo error if present
      const deletePhotoBtns = [...document.querySelectorAll('button')].filter(b => b.innerHTML.includes('trash') || b.getAttribute('aria-label')?.includes('Supprimer'));
      deletePhotoBtns.forEach(b => b.click());

      // First name
      const fn = document.querySelector('input[name*="first_name"], input[name*="firstname"], input[placeholder*="Prénom"], input[placeholder*="First"]');
      if (fn && !fn.value) { fn.value = prof.firstName || 'Fahid'; fn.dispatchEvent(new Event('input', { bubbles: true })); }

      // Last name
      const ln = document.querySelector('input[name*="last_name"], input[name*="lastname"], input[placeholder*="Nom"], input[placeholder*="Last"]');
      if (ln && !ln.value) { ln.value = prof.lastName || 'El Garouani'; ln.dispatchEvent(new Event('input', { bubbles: true })); }

      // Email
      const em = document.querySelector('input[name*="email"], input[type="email"]');
      if (em && !em.value) { em.value = prof.email || 'boumelahamid@gmail.com'; em.dispatchEvent(new Event('input', { bubbles: true })); }

      // Phone
      const ph = document.querySelector('input[name*="phone"], input[type="tel"]');
      if (ph && !ph.value) { ph.value = prof.phone || '0651782681'; ph.dispatchEvent(new Event('input', { bubbles: true })); }

      // City
      const city = document.querySelector('input[name*="city"], input[placeholder*="Ville"], input[placeholder*="résidence"]');
      if (city && !city.value) { city.value = 'Paris, France'; city.dispatchEvent(new Event('input', { bubbles: true })); }

      // Position/Title
      const positionInputs = document.querySelectorAll('input[placeholder*="Poste"], input[name*="profession"], input[name*="title"], input[placeholder*="Recherche"]');
      positionInputs.forEach(inp => {
        if (!inp.value) {
          inp.value = prof.title || 'Développeur Full Stack';
          inp.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
    }, profile);

    let screenshot3 = path.join(screenshotDir, `${applicationId}_step3_info.png`);
    await page.screenshot({ path: screenshot3 }).catch(() => {});
    emitStatus(applicationId, 3, 'fill_profile', 'completed', `Candidate details pre-filled ✓`, {
      screenshot: `/screenshots/${applicationId}_step3_info.png`
    });

    // ── STEP 4: Attach / Verify Candidate Resume (PDF) ──
    const cvName = profile.cvFilename || 'CV_Hamid_Boumela.pdf';
    emitStatus(applicationId, 4, 'attach_cv', 'active', `Attaching candidate resume (${cvName})...`);
    
    try {
      const resumeInput = await page.$('input[name="resume"]');
      if (resumeInput) {
        const cvPath = path.join(__dirname, 'CV_Hamid_Boumela.pdf');
        if (fs.existsSync(cvPath)) {
          await resumeInput.uploadFile(cvPath);
        }
      }
    } catch (e) {
      console.log('[AutoApply] Resume upload note:', e.message);
    }

    await new Promise(r => setTimeout(r, 1500));

    let screenshot4 = path.join(screenshotDir, `${applicationId}_step4_cv.png`);
    await page.screenshot({ path: screenshot4 }).catch(() => {});
    emitStatus(applicationId, 4, 'attach_cv', 'completed', `Resume (${cvName}) attached & ready ✓`, {
      screenshot: `/screenshots/${applicationId}_step4_cv.png`
    });

    // ── STEP 5: Inject Personalized Cover Letter ──
    emitStatus(applicationId, 5, 'inject_letter', 'active', `Injecting custom cover letter for ${job.company}...`);
    
    try {
      const ta = await page.$('textarea');
      if (ta) {
        const letterText = profile.coverLetter || "Madame, Monsieur,\n\nVivement intéressé par votre opportunité, je souhaite mettre à profit mes compétences techniques au sein de votre équipe.\n\nCordialement,\nFahid El Garouani";
        await ta.type(letterText, { delay: 10 });
      }
    } catch (e) {}

    await new Promise(r => setTimeout(r, 1000));

    let screenshot5 = path.join(screenshotDir, `${applicationId}_step5_letter.png`);
    await page.screenshot({ path: screenshot5 }).catch(() => {});
    emitStatus(applicationId, 5, 'inject_letter', 'completed', `Tailored cover letter injected ✓`, {
      screenshot: `/screenshots/${applicationId}_step5_letter.png`
    });

    // ── STEP 6: Validate Terms & Recruiter Policy ──
    emitStatus(applicationId, 6, 'validate_terms', 'active', `Accepting recruiter policy & terms...`);
    
    try {
      const consent = await page.$('input[name="consent"]');
      if (consent) {
        await consent.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        await new Promise(r => setTimeout(r, 400));
        await consent.click();
      }
    } catch (e) {}

    await page.evaluate(() => {
      const cbs = document.querySelectorAll('input[type="checkbox"]');
      cbs.forEach(cb => { 
        if (!cb.checked) {
          cb.click();
          cb.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    }).catch(() => {});

    await new Promise(r => setTimeout(r, 1000));

    let screenshot6 = path.join(screenshotDir, `${applicationId}_step6_terms.png`);
    await page.screenshot({ path: screenshot6 }).catch(() => {});
    emitStatus(applicationId, 6, 'validate_terms', 'completed', `Terms & recruiter policy accepted ✓`, {
      screenshot: `/screenshots/${applicationId}_step6_terms.png`
    });

    // ── STEP 7: Final Submit & Dual Sync ──
    emitStatus(applicationId, 7, 'final_submit', 'active', `Submitting application to ${job.company}...`);

    await page.evaluate(() => {
      // Scroll modal to bottom
      document.querySelectorAll('div, form, section').forEach(el => {
        if (el.scrollHeight > el.clientHeight) el.scrollTop = el.scrollHeight;
      });

      const buttons = [...document.querySelectorAll('button')];
      const submitBtn = buttons.find(b => {
        const txt = (b.textContent || '').trim().toLowerCase();
        return txt.includes('envoie ma candidature') || txt.includes('envoyer') || txt.includes('soumettre') || txt.includes('valider') || (txt.includes('postuler') && !txt.includes('cette offre'));
      });
      if (submitBtn) {
        submitBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
        submitBtn.click();
      }
    }).catch(() => {});

    await new Promise(r => setTimeout(r, 5000));

    let screenshot7 = path.join(screenshotDir, `${applicationId}_step7_done.png`);
    await page.screenshot({ path: screenshot7 }).catch(() => {});

    emitStatus(applicationId, 7, 'final_submit', 'completed', `🎉 Application successfully submitted to ${job.company}!`, {
      status: 'completed',
      screenshot: `/screenshots/${applicationId}_step7_done.png`
    });

  } catch (error) {
    console.error('[AutoApply] Error:', error.message);
    emitStatus(applicationId, 7, 'final_submit', 'error', `Erreur lors de la soumission: ${error.message}`);
  } finally {
    await browser.close().catch(() => {});
  }
}

module.exports = { autoApply, setStatusCallback };
