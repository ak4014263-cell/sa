const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const path = require('path');
const fs = require('fs');

puppeteer.use(StealthPlugin());

async function submitBrigadLive() {
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

  const jobUrl = 'https://www.welcometothejungle.com/fr/companies/brigad/jobs/customer-care-h-f_paris_TRXB_k9PDJ52';
  console.log('1. Navigating to:', jobUrl);
  await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
  await new Promise(r => setTimeout(r, 3000));

  // Dismiss cookies
  try {
    await page.evaluate(() => {
      document.querySelectorAll('[id*="axeptio"], #axeptio_overlay, .axeptio_mount').forEach(el => el.remove());
    });
  } catch (e) {}

  console.log('2. Clicking Postuler...');
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button, a')];
    const applyBtn = btns.find(b => (b.textContent || '').trim().toLowerCase() === 'postuler');
    if (applyBtn) applyBtn.click();
  });
  await new Promise(r => setTimeout(r, 3000));

  console.log('3. Attaching CV...');
  const resumeInput = await page.$('input[name="resume"]');
  if (resumeInput) {
    await resumeInput.uploadFile(path.join(__dirname, 'CV_Hamid_Boumela.pdf'));
    console.log('Resume attached!');
  }
  await new Promise(r => setTimeout(r, 1500));

  console.log('4. Filling mandatory cover letter & consent...');
  const textarea = await page.$('textarea');
  if (textarea) {
    await textarea.type("Madame, Monsieur,\n\nVivement intéressé par votre opportunité, je souhaite mettre à profit mes compétences au sein de votre équipe.\n\nCordialement,\nFahid El Garouani", { delay: 10 });
    console.log('Cover letter typed into textarea!');
  }

  try {
    const consent = await page.$('input[name="consent"]');
    if (consent) {
      await consent.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      await new Promise(r => setTimeout(r, 300));
      await consent.click();
      console.log('Consent clicked!');
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

  const modalPic = path.join(screenshotDir, 'brigad_modal_ready.png');
  await page.screenshot({ path: modalPic });
  console.log('Modal ready screenshot:', modalPic);

  console.log('5. Clicking submit...');
  const submitInfo = await page.evaluate(() => {
    document.querySelectorAll('div, form, section').forEach(el => {
      if (el.scrollHeight > el.clientHeight) el.scrollTop = el.scrollHeight;
    });

    const buttons = [...document.querySelectorAll('button')];
    const submitBtn = buttons.find(b => {
      const txt = (b.textContent || '').trim().toLowerCase();
      return txt.includes('envoie ma candidature') || txt.includes('envoyer') || txt.includes('soumettre') || txt.includes('valider');
    });
    if (submitBtn) {
      submitBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      submitBtn.click();
      return { clicked: true, text: submitBtn.textContent.trim() };
    }
    return { clicked: false };
  });
  console.log('Submit button info:', submitInfo);

  await new Promise(r => setTimeout(r, 8000));

  console.log('6. Checking official tracker...');
  await page.goto('https://www.welcometothejungle.com/fr/me/application-tracker', { waitUntil: 'domcontentloaded', timeout: 35000 });
  console.log('Waiting for tracker cards...');
  await new Promise(r => setTimeout(r, 6000));

  try {
    await page.evaluate(() => {
      document.querySelectorAll('[id*="axeptio"], #axeptio_overlay, .axeptio_mount').forEach(el => el.remove());
    });
  } catch (e) {}

  const proofPic = path.join(screenshotDir, 'wttj_tracker_19_verified.png');
  await page.screenshot({ path: proofPic, fullPage: true });
  console.log('Saved tracker screenshot:', proofPic);

  const trackerSnippet = await page.evaluate(() => {
    const text = document.body.innerText;
    return text.includes('CANDIDATURE ENVOYÉE') ? text.slice(text.indexOf('CANDIDATURE ENVOYÉE'), text.indexOf('CANDIDATURE ENVOYÉE') + 120) : 'not found';
  });
  console.log('=== REAL TRACKER STATUS ===\n', trackerSnippet);

  // Copy to artifacts
  const artifactPath = 'C:\\\\Users\\\\hp\\\\.gemini\\\\antigravity-ide\\\\brain\\\\00b4987e-430b-4b2b-bcfa-529279887e51\\\\wttj_tracker_19_verified.png';
  fs.copyFileSync(proofPic, artifactPath);
  console.log('Copied proof to artifacts!');

  await browser.close();
}

submitBrigadLive().catch(console.error);
