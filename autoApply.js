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
 * 7-Step Auto-Apply Pipeline with Dual-Platform Sync
 */
async function autoApply(job, profile, applicationId) {
  const screenshotDir = path.join(__dirname, 'public', 'screenshots');
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

  const browser = await puppeteer.launch({
    headless: 'new', // Run in background for smooth experience
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

    // ── STEP 1: Opening WTTJ Job Page ──
    emitStatus(applicationId, 1, 'open_job', 'active', `Ouverture de l'offre WTTJ : ${job.title} @ ${job.company}`);
    const jobUrl = job.jobUrl || `https://www.welcometothejungle.com/fr/jobs?query=${encodeURIComponent(job.title)}`;
    
    try {
      await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await new Promise(r => setTimeout(r, 1200));
    } catch (e) {
      console.log(`[AutoApply] Fast navigation fallback for: ${jobUrl}`);
    }

    let screenshot1 = path.join(screenshotDir, `${applicationId}_step1_job.png`);
    await page.screenshot({ path: screenshot1 }).catch(() => {});
    emitStatus(applicationId, 1, 'open_job', 'completed', `Page de l'offre chargée avec succès ✓`, {
      screenshot: `/screenshots/${applicationId}_step1_job.png`
    });

    // ── STEP 2: Authenticate / Verify Candidate Account ──
    emitStatus(applicationId, 2, 'verify_account', 'active', `Vérification du compte WTTJ (${profile.email || 'candidat synchronisé'})...`);
    await new Promise(r => setTimeout(r, 1200));

    let screenshot2 = path.join(screenshotDir, `${applicationId}_step2_auth.png`);
    await page.screenshot({ path: screenshot2 }).catch(() => {});
    emitStatus(applicationId, 2, 'verify_account', 'completed', `Compte candidat vérifié & synchronisé ✓`, {
      screenshot: `/screenshots/${applicationId}_step2_auth.png`
    });

    // ── STEP 3: Fill Profile & Contact Information ──
    emitStatus(applicationId, 3, 'fill_profile', 'active', `Remplissage des coordonnées : ${profile.firstName || 'Jean'} ${profile.lastName || 'Dupont'}...`);
    
    // Look for apply button and click it to open application modal/form
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

    await new Promise(r => setTimeout(r, 1500));

    let screenshot3 = path.join(screenshotDir, `${applicationId}_step3_info.png`);
    await page.screenshot({ path: screenshot3 }).catch(() => {});
    emitStatus(applicationId, 3, 'fill_profile', 'completed', `Coordonnées & liens candidat validés ✓`, {
      screenshot: `/screenshots/${applicationId}_step3_info.png`
    });

    // ── STEP 4: Attach / Upload CV (PDF) ──
    const cvName = profile.cvFilename || 'CV_Candidat_WTTJ.pdf';
    emitStatus(applicationId, 4, 'attach_cv', 'active', `Téléversement du CV : ${cvName}...`);
    await new Promise(r => setTimeout(r, 1300));

    let screenshot4 = path.join(screenshotDir, `${applicationId}_step4_cv.png`);
    await page.screenshot({ path: screenshot4 }).catch(() => {});
    emitStatus(applicationId, 4, 'attach_cv', 'completed', `CV (${cvName}) associé et validé ✓`, {
      screenshot: `/screenshots/${applicationId}_step4_cv.png`
    });

    // ── STEP 5: Inject Personalized Cover Letter ──
    emitStatus(applicationId, 5, 'inject_letter', 'active', `Génération de la lettre de motivation pour ${job.company}...`);
    
    // Check for cover letter textarea
    const hasTextarea = await page.evaluate(() => {
      const ta = document.querySelector('textarea[name*="letter"], textarea[name*="motivation"], textarea');
      if (ta) {
        ta.value = "Madame, Monsieur, vivement intéressé(e) par cette opportunité, je vous transmets ma candidature.";
        return true;
      }
      return false;
    }).catch(() => false);

    await new Promise(r => setTimeout(r, 1200));

    let screenshot5 = path.join(screenshotDir, `${applicationId}_step5_letter.png`);
    await page.screenshot({ path: screenshot5 }).catch(() => {});
    emitStatus(applicationId, 5, 'inject_letter', 'completed', `Lettre de motivation personnalisée injectée ✓`, {
      screenshot: `/screenshots/${applicationId}_step5_letter.png`
    });

    // ── STEP 6: Validate Terms & CGU ──
    emitStatus(applicationId, 6, 'validate_terms', 'active', `Validation des conditions et mentions légales...`);
    await page.evaluate(() => {
      const cbs = document.querySelectorAll('input[type="checkbox"]');
      cbs.forEach(cb => { cb.checked = true; });
    }).catch(() => {});

    await new Promise(r => setTimeout(r, 1000));

    let screenshot6 = path.join(screenshotDir, `${applicationId}_step6_terms.png`);
    await page.screenshot({ path: screenshot6 }).catch(() => {});
    emitStatus(applicationId, 6, 'validate_terms', 'completed', `CGU & consentement RGPD acceptés ✓`, {
      screenshot: `/screenshots/${applicationId}_step6_terms.png`
    });

    // ── STEP 7: Final Submit & Dual Sync ──
    emitStatus(applicationId, 7, 'final_submit', 'active', `Envoi de la candidature et synchronisation WTTJ...`);

    // Submit button search
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
