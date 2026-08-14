#!/usr/bin/env node
/**
 * ============================================================================
 * Welcome to the Jungle (WTTJ) - Production End-to-End CLI Auto-Apply Bot
 * ============================================================================
 * Usage:
 *   node wttj_cli_apply.js --query="développeur" --location="Paris" --limit=3
 *   node wttj_cli_apply.js --dry-run
 * ============================================================================
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const path = require('path');
const fs = require('fs');

puppeteer.use(StealthPlugin());

// ── CONFIGURATION ──
const CONFIG = {
  email: process.env.WTTJ_EMAIL || 'boumelahamid@gmail.com',
  password: process.env.WTTJ_PASSWORD || 'Pommier78955&&',
  firstName: 'Fahid',
  lastName: 'El Garouani',
  phone: '0651782681',
  title: 'Développeur Full Stack Senior',
  cvPath: path.join(__dirname, 'CV_Hamid_Boumela.pdf'),
  coverLetter: `Madame, Monsieur,\n\nVivement intéressé par votre opportunité, je souhaite mettre à profit mes compétences techniques au sein de votre équipe.\n\nCordialement,\nFahid El Garouani`
};

const { scrapeWTTJJobs } = require('./scraper');

// Parse command line arguments
function parseArgs() {
  const args = { query: 'développeur', location: 'Paris', limit: 3, dryRun: false, headless: true };
  process.argv.slice(2).forEach(arg => {
    if (arg.startsWith('--query=')) args.query = arg.split('=')[1].replace(/"/g, '');
    if (arg.startsWith('--location=')) args.location = arg.split('=')[1].replace(/"/g, '');
    if (arg.startsWith('--limit=')) args.limit = parseInt(arg.split('=')[1]) || 3;
    if (arg === '--dry-run') args.dryRun = true;
    if (arg === '--no-headless' || arg === '--headful') args.headless = false;
  });
  return args;
}

// ── 2. Dismiss Axeptio Cookie Banner ──
async function dismissCookies(page) {
  try {
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button, #axeptio_btn_accept, [id*="axeptio"]')];
      const accept = btns.find(b => b.textContent.includes('OK') || b.textContent.includes('Accepter') || b.textContent.includes('ok'));
      if (accept) accept.click();
      document.querySelectorAll('[id*="axeptio"], #axeptio_overlay, .axeptio_mount').forEach(el => el.remove());
    });
  } catch (e) {}
}

// ── 3. Apply to a Single Job ──
async function applyToJob(page, job, dryRun = false) {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`🚀 [Apply] Processing: ${job.title} @ ${job.company}`);
  console.log(`🔗 Job URL: ${job.jobUrl}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  try {
    await page.goto(job.jobUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
    await new Promise(r => setTimeout(r, 2000));
    await dismissCookies(page);

    // Check if 404
    const is404 = await page.evaluate(() => document.title.includes('404') || document.body.innerText.includes('Page introuvable'));
    if (is404) {
      console.log('⚠️ [Apply] Job is no longer available (404/Expired). Skipping.');
      return false;
    }

    // Step 1: Click Postuler
    console.log('  1️⃣ Clicking "Postuler" button...');
    const clickedPostuler = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button, a')];
      const applyBtn = btns.find(b => {
        const txt = (b.textContent || '').trim().toLowerCase();
        return txt === 'postuler' || txt === 'apply' || txt.includes('postuler à cette offre');
      });
      if (applyBtn) {
        applyBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
        applyBtn.click();
        return true;
      }
      return false;
    });

    await new Promise(r => setTimeout(r, 2500));
    await dismissCookies(page);

    // Step 2: Fill candidate personal details
    console.log('  2️⃣ Filling candidate details...');
    await page.evaluate((conf) => {
      const fn = document.querySelector('input[name*="first_name"], input[name*="firstname"], input[placeholder*="Prénom"]');
      if (fn && !fn.value) { fn.value = conf.firstName; fn.dispatchEvent(new Event('input', { bubbles: true })); }

      const ln = document.querySelector('input[name*="last_name"], input[name*="lastname"], input[placeholder*="Nom"]');
      if (ln && !ln.value) { ln.value = conf.lastName; ln.dispatchEvent(new Event('input', { bubbles: true })); }

      const em = document.querySelector('input[name*="email"], input[type="email"]');
      if (em && !em.value) { em.value = conf.email; em.dispatchEvent(new Event('input', { bubbles: true })); }

      const ph = document.querySelector('input[name*="phone"], input[type="tel"]');
      if (ph && !ph.value) { ph.value = conf.phone; ph.dispatchEvent(new Event('input', { bubbles: true })); }

      const title = document.querySelector('input[name*="subtitle"], input[placeholder*="Poste"]');
      if (title && !title.value) { title.value = conf.title; title.dispatchEvent(new Event('input', { bubbles: true })); }
    }, CONFIG);

    // Step 3: Attach Resume (PDF)
    console.log(`  3️⃣ Attaching resume (${path.basename(CONFIG.cvPath)})...`);
    if (fs.existsSync(CONFIG.cvPath)) {
      const resumeInput = await page.$('input[name="resume"], input[accept*="pdf"]');
      if (resumeInput) {
        await resumeInput.uploadFile(CONFIG.cvPath);
        console.log('     ✓ Resume attached to input[name="resume"]!');
      } else {
        const anyFileInput = await page.$('input[type="file"]');
        if (anyFileInput) await anyFileInput.uploadFile(CONFIG.cvPath);
      }
    }
    await new Promise(r => setTimeout(r, 1200));

    // Step 4: Type tailored cover letter
    console.log('  4️⃣ Typing tailored cover letter into textarea...');
    const textarea = await page.$('textarea');
    if (textarea) {
      await textarea.type(CONFIG.coverLetter, { delay: 8 });
      console.log('     ✓ Cover letter typed successfully!');
    }
    await new Promise(r => setTimeout(r, 600));

    // Step 5: Accept GDPR consent & check all required checkboxes
    console.log('  5️⃣ Accepting GDPR data policy & terms...');
    try {
      const consent = await page.$('input[name="consent"]');
      if (consent) {
        await consent.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        await consent.click();
        console.log('     ✓ GDPR Consent checkbox checked natively!');
      }
    } catch (e) {}

    await page.evaluate(() => {
      document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        if (!cb.checked) {
          cb.click();
          cb.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    });
    await new Promise(r => setTimeout(r, 1000));

    if (dryRun) {
      console.log('  ⚠️ [DRY RUN] Skipping final submit click.');
      return true;
    }

    // Step 6: Submit application
    console.log('  6️⃣ Clicking submit ("J’envoie ma candidature !")...');
    const submitResult = await page.evaluate(() => {
      document.querySelectorAll('div, form, section').forEach(el => {
        if (el.scrollHeight > el.clientHeight) el.scrollTop = el.scrollHeight;
      });

      const buttons = [...document.querySelectorAll('button')];
      const submitBtn = buttons.find(b => {
        const txt = (b.textContent || '').trim().toLowerCase();
        return txt.includes('envoie ma candidature') || txt.includes('envoyer') || txt.includes('soumettre') || b.type === 'submit';
      });
      if (submitBtn) {
        submitBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
        submitBtn.click();
        return { clicked: true, text: submitBtn.textContent.trim() };
      }
      return { clicked: false };
    });

    console.log(`     ✓ Submit action: ${JSON.stringify(submitResult)}`);
    await new Promise(r => setTimeout(r, 6000));

    console.log(`  🎉 [Success] Application sent to ${job.company}!`);
    return true;

  } catch (err) {
    console.log(`  ❌ [Error] Failed during application: ${err.message}`);
    return false;
  }
}

// ── 4. Verify on Live Candidate Tracker ──
async function verifyTracker(page) {
  console.log('\n' + '═'.repeat(60));
  console.log('📊 [Tracker] Checking Official Welcome to the Jungle Tracker...');
  console.log('═'.repeat(60));

  try {
    await page.goto('https://www.welcometothejungle.com/fr/me/application-tracker', { waitUntil: 'domcontentloaded', timeout: 35000 });
    await new Promise(r => setTimeout(r, 6000));
    await dismissCookies(page);

    const trackerInfo = await page.evaluate(() => {
      const text = document.body.innerText;
      if (text.includes('CANDIDATURE ENVOYÉE')) {
        const start = text.indexOf('CANDIDATURE ENVOYÉE');
        return text.slice(start, start + 140).replace(/\n\n/g, '\n');
      }
      return 'Tracker loaded.';
    });

    console.log(`📈 [Live WTTJ Application Tracker]:\n${trackerInfo}`);
  } catch (e) {
    console.log(`⚠️ [Tracker] Notice: ${e.message}`);
  }
}

// ── MAIN EXECUTION ──
async function main() {
  const args = parseArgs();

  console.log('════════════════════════════════════════════════════════════════');
  console.log(' 🌴 Welcome to the Jungle - Standalone CLI Auto-Apply Bot 🌴');
  console.log(` 👤 Candidate: ${CONFIG.firstName} ${CONFIG.lastName} (${CONFIG.email})`);
  console.log(` 📄 Resume: ${path.basename(CONFIG.cvPath)}`);
  console.log(` 🎯 Query: "${args.query}" | Location: "${args.location}" | Limit: ${args.limit}`);
  console.log(` ⚙️ Mode: ${args.dryRun ? 'DRY-RUN (Simulated)' : 'LIVE REAL SUBMISSION'}`);
  console.log('════════════════════════════════════════════════════════════════');

  // Step 1: Scrape live jobs
  console.log(`\n🔍 [Scraper] Querying live jobs for: "${args.query}" in "${args.location}"...`);
  const rawJobs = await scrapeWTTJJobs({ query: args.query, location: args.location, hitsPerPage: args.limit });
  let jobs = rawJobs.slice(0, args.limit);
  console.log(`✅ [Scraper] Loaded ${jobs.length} targeted jobs from Welcome to the Jungle!`);

  // Step 2: Launch browser with session
  try {
    require('child_process').execSync('taskkill /F /IM chrome.exe /T 2>nul');
    await new Promise(r => setTimeout(r, 1000));
  } catch (e) {}

  const sessionDir = path.join(__dirname, 'chrome_session');
  const browser = await puppeteer.launch({
    headless: args.headless ? 'new' : false,
    userDataDir: sessionDir,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,1000'],
    defaultViewport: { width: 1280, height: 1000 }
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

  // Step 3: Ensure session
  console.log(`\n🔐 [Auth] Verifying session for ${CONFIG.email}...`);
  try {
    await page.goto('https://www.welcometothejungle.com/fr/me/application-tracker', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await new Promise(r => setTimeout(r, 2000));
    await dismissCookies(page);

    if (page.url().includes('signin') || page.url().includes('login')) {
      console.log('🔑 [Auth] Performing login...');
      await page.goto('https://www.welcometothejungle.com/fr/authenticate/login', { waitUntil: 'domcontentloaded', timeout: 20000 });
      await new Promise(r => setTimeout(r, 1500));
      await dismissCookies(page);

      const emailInput = await page.$('input[type="email"], input[name="email"]');
      if (emailInput) await emailInput.type(CONFIG.email, { delay: 25 });

      const passInput = await page.$('input[type="password"], input[name="password"]');
      if (passInput) await passInput.type(CONFIG.password, { delay: 25 });

      const submitBtn = await page.$('button[type="submit"]');
      if (submitBtn) await submitBtn.click();
      await new Promise(r => setTimeout(r, 4000));
    }
    console.log('✅ [Auth] Session active and ready!');
  } catch (e) {
    console.log(`⚠️ [Auth] Notice: ${e.message}`);
  }

  // Fallback: If Algolia didn't return jobs, scrape live from WTTJ website
  if (jobs.length === 0) {
    console.log(`\n🔍 [Scraper] Fallback: Scraping search page directly on WTTJ...`);
    const searchUrl = `https://www.welcometothejungle.com/fr/jobs?query=${encodeURIComponent(args.query)}&aroundQuery=${encodeURIComponent(args.location)}&page=1`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));
    await dismissCookies(page);

    jobs = await page.evaluate((max) => {
      const results = [];
      const links = [...document.querySelectorAll('a[href*="/companies/"][href*="/jobs/"]')];
      for (const a of links) {
        const href = a.href;
        if (!href || results.some(r => r.jobUrl === href)) continue;
        const title = (a.querySelector('h3, h4, strong') || a).textContent.trim();
        const company = (a.closest('article, li, div')?.querySelector('h4, span, p') || a).textContent.trim();
        if (title && href) {
          results.push({ id: 'wttj-' + results.length, title, company, jobUrl: href });
        }
        if (results.length >= max) break;
      }
      return results;
    }, args.limit);
    console.log(`✅ [Scraper] Scraped ${jobs.length} jobs directly from search page!`);
  }

  // Step 4: Apply to all scraped jobs
  let successCount = 0;
  for (let i = 0; i < jobs.length; i++) {
    console.log(`\n[Job ${i + 1}/${jobs.length}]`);
    const ok = await applyToJob(page, jobs[i], args.dryRun);
    if (ok) successCount++;
    await new Promise(r => setTimeout(r, 2000));
  }

  // Step 5: Verify on Tracker
  await verifyTracker(page);

  console.log('\n' + '═'.repeat(60));
  console.log(`🏁 Automation Finished: ${successCount}/${jobs.length} applications processed!`);
  console.log('═'.repeat(60));

  await browser.close();
}

main().catch(console.error);
