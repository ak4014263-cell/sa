const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const path = require('path');
const fs = require('fs');

puppeteer.use(StealthPlugin());

async function submitGaladrim() {
  try {
    require('child_process').execSync('taskkill /F /IM chrome.exe /T 2>nul');
    await new Promise(r => setTimeout(r, 1000));
  } catch (e) {}

  const sessionDir = path.join(__dirname, 'chrome_session');
  const screenshotDir = path.join(__dirname, 'public', 'screenshots');

  const browser = await puppeteer.launch({
    headless: 'new',
    userDataDir: sessionDir,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,1000'],
    defaultViewport: { width: 1280, height: 1000 }
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

  console.log('1. Navigating to Galadrim developer job...');
  await page.goto('https://www.welcometothejungle.com/fr/companies/galadrim/jobs/developpeur-wordpress-freelance_paris', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));

  // Dismiss cookies
  try {
    await page.evaluate(() => {
      document.querySelectorAll('[id*="axeptio"], #axeptio_overlay, .axeptio_mount').forEach(el => el.remove());
    });
  } catch (e) {}

  console.log('2. Clicking Postuler...');
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button, a')];
    const applyBtn = btns.find(b => {
      const txt = (b.textContent || '').trim().toLowerCase();
      return txt === 'postuler' || txt === 'apply' || txt.includes('postuler à cette offre');
    });
    if (applyBtn) applyBtn.click();
  });
  await new Promise(r => setTimeout(r, 2500));

  // Fill candidate details
  await page.evaluate(() => {
    const fn = document.querySelector('input[name*="first_name"], input[name*="firstname"], input[placeholder*="Prénom"]');
    if (fn && !fn.value) { fn.value = 'Fahid'; fn.dispatchEvent(new Event('input', { bubbles: true })); }

    const ln = document.querySelector('input[name*="last_name"], input[name*="lastname"], input[placeholder*="Nom"]');
    if (ln && !ln.value) { ln.value = 'El Garouani'; ln.dispatchEvent(new Event('input', { bubbles: true })); }

    const em = document.querySelector('input[name*="email"], input[type="email"]');
    if (em && !em.value) { em.value = 'boumelahamid@gmail.com'; em.dispatchEvent(new Event('input', { bubbles: true })); }

    const ph = document.querySelector('input[name*="phone"], input[type="tel"]');
    if (ph && !ph.value) { ph.value = '0651782681'; ph.dispatchEvent(new Event('input', { bubbles: true })); }
  });

  console.log('3. Attaching CV...');
  try {
    const resumeInput = await page.$('input[name="resume"]');
    if (resumeInput) {
      await resumeInput.uploadFile(path.join(__dirname, 'CV_Hamid_Boumela.pdf'));
    }
  } catch (e) {}
  await new Promise(r => setTimeout(r, 1000));

  console.log('4. Typing Cover Letter...');
  try {
    const textarea = await page.$('textarea');
    if (textarea) {
      await textarea.type('Madame, Monsieur,\n\nVivement intéressé par votre opportunité chez Galadrim, je souhaite mettre à profit mes compétences en développement logiciel.\n\nCordialement,\nFahid El Garouani', { delay: 10 });
    }
  } catch (e) {}

  console.log('5. Consent...');
  try {
    const consent = await page.$('input[name="consent"]');
    if (consent) {
      await consent.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      await consent.click();
    }
  } catch (e) {}
  await new Promise(r => setTimeout(r, 1000));

  console.log('5. Submitting...');
  await page.evaluate(() => {
    document.querySelectorAll('div, form, section').forEach(el => {
      if (el.scrollHeight > el.clientHeight) el.scrollTop = el.scrollHeight;
    });
    const buttons = [...document.querySelectorAll('button')];
    const submitBtn = buttons.find(b => {
      const txt = (b.textContent || '').trim().toLowerCase();
      return txt.includes('envoie ma candidature') || txt.includes('envoyer') || txt.includes('soumettre');
    });
    if (submitBtn) {
      submitBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      submitBtn.click();
    }
  });

  await new Promise(r => setTimeout(r, 6000));

  console.log('6. Navigating to live candidate tracker...');
  await page.goto('https://www.welcometothejungle.com/fr/me/application-tracker', { waitUntil: 'domcontentloaded', timeout: 30000 });
  console.log('Waiting for React board...');
  await new Promise(r => setTimeout(r, 6000));

  try {
    await page.evaluate(() => {
      document.querySelectorAll('[id*="axeptio"], #axeptio_overlay, .axeptio_mount').forEach(el => el.remove());
    });
  } catch (e) {}

  const screenshotPath = path.join(screenshotDir, 'wttj_live_19_galadrim_proof.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log('Saved Galadrim proof screenshot:', screenshotPath);

  const trackerInfo = await page.evaluate(() => {
    const text = document.body.innerText;
    return text.slice(text.indexOf('CANDIDATURE ENVOYÉE'), text.indexOf('CANDIDATURE ENVOYÉE') + 80);
  });
  console.log('Final Tracker State:', trackerInfo);

  // Copy to artifacts
  const artifactPath = 'C:\\\\Users\\\\hp\\\\.gemini\\\\antigravity-ide\\\\brain\\\\00b4987e-430b-4b2b-bcfa-529279887e51\\\\wttj_live_19_galadrim_proof.png';
  fs.copyFileSync(screenshotPath, artifactPath);
  console.log('Copied artifact!');

  await browser.close();
}

submitGaladrim().catch(console.error);
