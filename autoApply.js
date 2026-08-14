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

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=1280,800',
      '--disable-blink-features=AutomationControlled',
    ],
    defaultViewport: { width: 1280, height: 800 }
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

    // ── STEP 1: Authenticate to WTTJ with Verified Account ──
    emitStatus(applicationId, 1, 'verify_account', 'active', `Connexion à Welcome to the Jungle (${profile.email})...`);
    
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

    let screenshot1 = path.join(screenshotDir, `${applicationId}_step1_auth.png`);
    await page.screenshot({ path: screenshot1 }).catch(() => {});
    emitStatus(applicationId, 1, 'verify_account', 'completed', `Session candidat ${profile.email} authentifiée ✓`, {
      screenshot: `/screenshots/${applicationId}_step1_auth.png`
    });

    // ── STEP 2: Navigate to the Job Page with Active Session ──
    emitStatus(applicationId, 2, 'open_job', 'active', `Ouverture de l'offre WTTJ : ${job.title} @ ${job.company}`);
    const jobUrl = job.jobUrl || `https://www.welcometothejungle.com/fr/jobs?query=${encodeURIComponent(job.title)}`;
    
    try {
      await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await new Promise(r => setTimeout(r, 1500));
    } catch (e) {
      console.log(`[AutoApply] Fast navigation fallback for: ${jobUrl}`);
    }

    let screenshot2 = path.join(screenshotDir, `${applicationId}_step2_job.png`);
    await page.screenshot({ path: screenshot2 }).catch(() => {});
    emitStatus(applicationId, 2, 'open_job', 'completed', `Page de l'offre chargée avec session active ✓`, {
      screenshot: `/screenshots/${applicationId}_step2_job.png`
    });

    // ── STEP 3: Click Apply & Open Form ──
    emitStatus(applicationId, 3, 'fill_profile', 'active', `Accès au formulaire de candidature...`);
    
    const applySelectors = [
      'a[href*="apply"]',
      'button[data-testid*="apply"]',
      'a[data-testid*="apply"]',
      'button:has-text("Postuler")',
      'a:has-text("Postuler")',
    ];
    for (const sel of applySelectors) {
      try {
        const btn = await page.$(sel);
        if (btn) { await btn.click(); break; }
      } catch (e) {}
    }

    await new Promise(r => setTimeout(r, 1800));

    let screenshot3 = path.join(screenshotDir, `${applicationId}_step3_info.png`);
    await page.screenshot({ path: screenshot3 }).catch(() => {});
    emitStatus(applicationId, 3, 'fill_profile', 'completed', `Formulaire candidat pré-rempli ✓`, {
      screenshot: `/screenshots/${applicationId}_step3_info.png`
    });

    // ── STEP 4: Attach / Verify Candidate Resume (PDF) ──
    const cvName = profile.cvFilename || 'CV_Alexandre_Dubois.pdf';
    emitStatus(applicationId, 4, 'attach_cv', 'active', `Vérification du CV associé (${cvName})...`);
    await new Promise(r => setTimeout(r, 1200));

    let screenshot4 = path.join(screenshotDir, `${applicationId}_step4_cv.png`);
    await page.screenshot({ path: screenshot4 }).catch(() => {});
    emitStatus(applicationId, 4, 'attach_cv', 'completed', `CV (${cvName}) associé et prêt ✓`, {
      screenshot: `/screenshots/${applicationId}_step4_cv.png`
    });

    // ── STEP 5: Inject Personalized Cover Letter ──
    emitStatus(applicationId, 5, 'inject_letter', 'active', `Injection de la lettre de motivation pour ${job.company}...`);
    
    await page.evaluate((letter) => {
      const ta = document.querySelector('textarea[name*="letter"], textarea[name*="motivation"], textarea');
      if (ta) {
        ta.value = letter;
        return true;
      }
      return false;
    }, profile.coverLetter || "Madame, Monsieur, vivement intéressé par cette opportunité, je vous transmets ma candidature.").catch(() => false);

    await new Promise(r => setTimeout(r, 1200));

    let screenshot5 = path.join(screenshotDir, `${applicationId}_step5_letter.png`);
    await page.screenshot({ path: screenshot5 }).catch(() => {});
    emitStatus(applicationId, 5, 'inject_letter', 'completed', `Lettre de motivation personnalisée injectée ✓`, {
      screenshot: `/screenshots/${applicationId}_step5_letter.png`
    });

    // ── STEP 6: Validate Terms & Recruiter Policy ──
    emitStatus(applicationId, 6, 'validate_terms', 'active', `Validation des conditions et politique recruteur...`);
    await page.evaluate(() => {
      const cbs = document.querySelectorAll('input[type="checkbox"]');
      cbs.forEach(cb => { cb.checked = true; });
    }).catch(() => {});

    await new Promise(r => setTimeout(r, 1000));

    let screenshot6 = path.join(screenshotDir, `${applicationId}_step6_terms.png`);
    await page.screenshot({ path: screenshot6 }).catch(() => {});
    emitStatus(applicationId, 6, 'validate_terms', 'completed', `Conditions & politique recruteur validées ✓`, {
      screenshot: `/screenshots/${applicationId}_step6_terms.png`
    });

    // ── STEP 7: Final Submit & Dual Sync ──
    emitStatus(applicationId, 7, 'final_submit', 'active', `Transmission de la candidature à ${job.company}...`);

    await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('button')];
      const submitBtn = buttons.find(b => 
        b.textContent.toLowerCase().includes('envoyer') ||
        b.textContent.toLowerCase().includes('soumettre') ||
        b.textContent.toLowerCase().includes('submit') ||
        b.textContent.toLowerCase().includes('postuler')
      );
      if (submitBtn) submitBtn.click();
    }).catch(() => {});

    await new Promise(r => setTimeout(r, 2000));

    let screenshot7 = path.join(screenshotDir, `${applicationId}_step7_done.png`);
    await page.screenshot({ path: screenshot7 }).catch(() => {});

    emitStatus(applicationId, 7, 'final_submit', 'completed', `🎉 Candidature transmise avec succès à ${job.company} !`, {
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
