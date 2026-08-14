const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const path = require('path');
const fs = require('fs');

puppeteer.use(StealthPlugin());

async function main() {
  try {
    require('child_process').execSync('taskkill /F /IM chrome.exe /T 2>nul');
    await new Promise(r => setTimeout(r, 1000));
  } catch (e) {}

  const sessionDir = path.join(__dirname, 'chrome_session');
  const screenshotDir = path.join(__dirname, 'public', 'screenshots');

  const browser = await puppeteer.launch({
    headless: 'new',
    userDataDir: sessionDir,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,1100'],
    defaultViewport: { width: 1280, height: 1100 }
  });

  const page = await browser.newPage();
  
  const targetJobUrl = 'https://www.welcometothejungle.com/fr/companies/shape-it/jobs/developpeur-se-fullstack-java-angular_lyon_SI_V8GzVYe';
  console.log('Navigating to job:', targetJobUrl);
  await page.goto(targetJobUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
  await new Promise(r => setTimeout(r, 3000));

  // Dismiss cookies
  try {
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button, #axeptio_btn_accept')];
      const accept = btns.find(b => b.textContent.includes('OK') || b.textContent.includes('Accepter') || b.textContent.includes('ok'));
      if (accept) accept.click();
    });
    await new Promise(r => setTimeout(r, 1000));
  } catch (e) {}

  // Open apply modal
  console.log('Clicking Postuler...');
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button, a')];
    const applyBtn = btns.find(b => (b.textContent || '').trim().toLowerCase() === 'postuler');
    if (applyBtn) applyBtn.click();
  });
  await new Promise(r => setTimeout(r, 3000));

  // Attach resume
  console.log('Uploading CV to input[name="resume"]...');
  const resumeInput = await page.$('input[name="resume"]');
  if (resumeInput) {
    const cvPath = path.join(__dirname, 'CV_Hamid_Boumela.pdf');
    await resumeInput.uploadFile(cvPath);
    console.log('CV attached to input[name="resume"] successfully!');
  }
  await new Promise(r => setTimeout(r, 2000));

  // Click GDPR Consent Checkbox using native Puppeteer click!
  console.log('Clicking GDPR consent checkbox natively...');
  try {
    const consent = await page.$('input[name="consent"]');
    if (consent) {
      await consent.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      await new Promise(r => setTimeout(r, 500));
      await consent.click();
      console.log('Clicked consent checkbox natively!');
    }
  } catch (e) {
    console.log('Consent click notice:', e.message);
  }

  // Also check other checkboxes
  await page.evaluate(() => {
    document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      if (!cb.checked) cb.click();
    });
  });
  await new Promise(r => setTimeout(r, 1000));

  // Click Submit!
  console.log('Clicking J’envoie ma candidature ! ...');
  const submitClicked = await page.evaluate(() => {
    const submitBtn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('J’envoie ma candidature') || b.textContent.includes('candidature'));
    if (submitBtn) {
      submitBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      submitBtn.click();
      return true;
    }
    return false;
  });
  console.log('Submit clicked:', submitClicked);

  await new Promise(r => setTimeout(r, 8000));
  const confirmPic = path.join(screenshotDir, 'wttj_submission_confirmed_live.png');
  await page.screenshot({ path: confirmPic, fullPage: true });
  console.log('Saved confirmation screenshot:', confirmPic);

  // Check URL & screen state
  const state = await page.evaluate(() => {
    const text = document.body.innerText;
    return {
      url: window.location.href,
      hasConfirmation: text.includes('Votre candidature a bien été envoyée') || text.includes('bien été transmise') || text.includes('Merci') || text.includes('Suivi'),
      textPreview: text.slice(0, 500)
    };
  });
  console.log('Post-submission state:', state);

  // Navigate to tracker and capture
  console.log('Checking official application tracker...');
  await page.goto('https://www.welcometothejungle.com/fr/me/application-tracker', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 5000));
  
  // Remove any modal or banner overlays
  try {
    await page.evaluate(() => {
      document.querySelectorAll('[id*="axeptio"], #axeptio_overlay, .axeptio_mount').forEach(el => el.remove());
    });
  } catch (e) {}

  const finalTrackerPic = path.join(screenshotDir, 'wttj_tracker_with_new_job.png');
  await page.screenshot({ path: finalTrackerPic, fullPage: true });
  console.log('Saved final tracker screenshot:', finalTrackerPic);

  await browser.close();
}

main().catch(console.error);
