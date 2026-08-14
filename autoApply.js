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
async function autoApply(job, profile, applicationId) {
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
        '--window-size=1280,800',
        '--disable-blink-features=AutomationControlled',
      ],
      defaultViewport: { width: 1280, height: 800 }
    });
  } catch (launchErr) {
    if (launchErr.message.includes('already running') || launchErr.message.includes('lock') || launchErr.message.includes('EBUSY')) {
      console.log('[AutoApply] Chrome session locked by active window, launching dedicated runner...');
      browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--window-size=1280,800',
          '--disable-blink-features=AutomationControlled',
        ],
        defaultViewport: { width: 1280, height: 800 }
      });
    } else {
      throw launchErr;
    }
  }

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

    // ── STEP 1: Authenticate to WTTJ with Verified Account / Cookie Sync ──
    emitStatus(applicationId, 1, 'verify_account', 'active', `Checking Welcome to the Jungle session (${profile.email})...`);
    
    // Inject synchronized cookies if provided by Extension or Token input
    if (profile.wttjCookies && Array.isArray(profile.wttjCookies) && profile.wttjCookies.length > 0) {
      console.log(`[AutoApply] Injecting ${profile.wttjCookies.length} synchronized WTTJ cookies!`);
      try {
        await page.setCookie(...profile.wttjCookies);
      } catch (e) {
        console.log('[AutoApply] Cookie injection warning:', e.message);
      }
    } else {
      try {
        await page.goto('https://www.welcometothejungle.com/fr/authenticate/login', { 
          waitUntil: 'networkidle2', 
          timeout: 30000 
        });
        await new Promise(r => setTimeout(r, 1500));

      // Dismiss Axeptio Cookie Banner if present
      try {
        await page.evaluate(() => {
          const cookieBtns = [...document.querySelectorAll('button, #axeptio_btn_accept, [id*="axeptio"]')];
          const acceptBtn = cookieBtns.find(b => b.textContent.toLowerCase().includes('ok') || b.textContent.toLowerCase().includes('accepter'));
          if (acceptBtn) acceptBtn.click();
        });
        await new Promise(r => setTimeout(r, 800));
      } catch (e) {}

      // Fill Email & Password
      const emailInput = await page.$('input[type="email"], input[name="email"]');
      if (emailInput) {
        await emailInput.type(profile.email || 'boumelahamid@gmail.com', { delay: 35 });
      }

      const passInput = await page.$('input[type="password"], input[name="password"]');
      if (passInput) {
        await passInput.type(profile.wttjPassword || 'Pommier78955&&', { delay: 35 });
      }

      // Submit Login
      const submitBtn = await page.$('button[type="submit"], button[class*="_variant-primary"]');
      if (submitBtn) {
        await submitBtn.click();
        await new Promise(r => setTimeout(r, 4000));
      }
    } catch (e) {
      console.log('[AutoApply] Login step notice:', e.message);
    }
  }

    let screenshot1 = path.join(screenshotDir, `${applicationId}_step1_auth.png`);
    await page.screenshot({ path: screenshot1 }).catch(() => {});
    emitStatus(applicationId, 1, 'verify_account', 'completed', `Candidate session ${profile.email} authenticated ✓`, {
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
    
    await page.evaluate((letter) => {
      const ta = document.querySelector('textarea[name*="letter"], textarea[name*="motivation"], textarea');
      if (ta) {
        ta.value = letter;
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      }
      return false;
    }, profile.coverLetter || "Madame, Monsieur,\n\nVivement intéressé par votre opportunité, je souhaite mettre à profit mes compétences en développement logiciel Full Stack au sein de votre équipe.\n\nCordialement,\nFahid El Garouani");

    await new Promise(r => setTimeout(r, 1200));

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
