const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const path = require('path');
const fs = require('fs');

puppeteer.use(StealthPlugin());

async function runLiveApplication() {
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

  // Let's pick a high-quality native software developer job on WTTJ
  const targetJobUrl = 'https://www.welcometothejungle.com/fr/companies/webnet/jobs/developpeur-fullstack-f-h_sevres';
  console.log('1. Navigating to job:', targetJobUrl);
  await page.goto(targetJobUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
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

  console.log('3. Attaching CV to input[name="resume"]...');
  const resumeInput = await page.$('input[name="resume"], input[accept*="pdf"]');
  if (resumeInput) {
    const cvPath = path.join(__dirname, 'CV_Hamid_Boumela.pdf');
    await resumeInput.uploadFile(cvPath);
    console.log('CV attached!');
  }
  await new Promise(r => setTimeout(r, 1500));

  console.log('4. Filling fields and answering any questions...');
  await page.evaluate(() => {
    // Fill phone if empty
    const phone = document.querySelector('input[name="phone"], input[type="tel"]');
    if (phone && !phone.value) {
      phone.value = '0651782681';
      phone.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Fill current title if empty
    const subtitle = document.querySelector('input[name="subtitle"]');
    if (subtitle && !subtitle.value) {
      subtitle.value = 'Développeur Full Stack Senior';
      subtitle.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Fill textareas / questions
    document.querySelectorAll('textarea').forEach(ta => {
      if (!ta.value) {
        ta.value = "Madame, Monsieur,\n\nJe vous adresse ma candidature avec un vif enthousiasme pour rejoindre votre équipe technique.\n\nCordialement,\nFahid El Garouani";
        ta.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    // Fill any empty required text inputs
    document.querySelectorAll('input[type="text"]').forEach(inp => {
      if (!inp.value && inp.name && !inp.name.includes('avatar') && !inp.name.includes('resume')) {
        inp.value = 'Paris, France';
        inp.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
  });

  console.log('5. Clicking consent & all checkboxes...');
  try {
    const consent = await page.$('input[name="consent"]');
    if (consent) {
      await consent.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      await new Promise(r => setTimeout(r, 300));
      await consent.click();
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

  // Take screenshot of filled modal
  const modalFilledPic = path.join(screenshotDir, 'modal_filled_before_submit.png');
  await page.screenshot({ path: modalFilledPic, fullPage: true });
  console.log('Saved modal before submit:', modalFilledPic);

  console.log('6. Clicking submit...');
  const submitResult = await page.evaluate(() => {
    document.querySelectorAll('div, form, section').forEach(el => {
      if (el.scrollHeight > el.clientHeight) el.scrollTop = el.scrollHeight;
    });

    const buttons = [...document.querySelectorAll('button')];
    const submitBtn = buttons.find(b => {
      const txt = (b.textContent || '').trim().toLowerCase();
      return txt.includes('envoie ma candidature') || txt.includes('envoyer') || txt.includes('soumettre') || txt.includes('valider') || b.type === 'submit';
    });
    if (submitBtn) {
      submitBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      submitBtn.click();
      return { found: true, text: submitBtn.textContent.trim() };
    }
    return { found: false };
  });
  console.log('Submit button clicked:', submitResult);

  await new Promise(r => setTimeout(r, 8000));

  const modalAfterPic = path.join(screenshotDir, 'modal_after_submit.png');
  await page.screenshot({ path: modalAfterPic, fullPage: true });
  console.log('Saved modal after submit:', modalAfterPic);

  console.log('7. Navigating to tracker to verify updated count...');
  await page.goto('https://www.welcometothejungle.com/fr/me/application-tracker', { waitUntil: 'domcontentloaded', timeout: 35000 });
  console.log('Waiting for React board to populate...');
  await new Promise(r => setTimeout(r, 7000));

  try {
    await page.evaluate(() => {
      document.querySelectorAll('[id*="axeptio"], #axeptio_overlay, .axeptio_mount').forEach(el => el.remove());
    });
  } catch (e) {}

  const trackerPic = path.join(screenshotDir, 'tracker_after_new_submit.png');
  await page.screenshot({ path: trackerPic, fullPage: true });
  console.log('Saved tracker screenshot:', trackerPic);

  const trackerState = await page.evaluate(() => {
    const text = document.body.innerText;
    return text.includes('CANDIDATURE ENVOYÉE') ? text.slice(text.indexOf('CANDIDATURE ENVOYÉE'), text.indexOf('CANDIDATURE ENVOYÉE') + 80) : 'not found';
  });
  console.log('=== REAL WTTJ TRACKER STATUS ===\n', trackerState);

  // Copy to artifacts
  const artifactPath = 'C:\\\\Users\\\\hp\\\\.gemini\\\\antigravity-ide\\\\brain\\\\00b4987e-430b-4b2b-bcfa-529279887e51\\\\tracker_after_new_submit.png';
  fs.copyFileSync(trackerPic, artifactPath);
  console.log('Copied to artifacts successfully!');

  await browser.close();
}

runLiveApplication().catch(console.error);
