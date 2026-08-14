const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const path = require('path');
const fs = require('fs');

puppeteer.use(StealthPlugin());

async function runVerification() {
  const sessionDir = path.join(__dirname, 'chrome_session');
  const screenshotDir = path.join(__dirname, 'public', 'screenshots');
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

  console.log('=== Step 1: Launching Chrome with Persistent Session ===');
  try {
    require('child_process').execSync('taskkill /F /IM chrome.exe /T 2>nul');
    await new Promise(r => setTimeout(r, 1000));
  } catch (e) {}

  const browser = await puppeteer.launch({
    headless: 'new',
    userDataDir: sessionDir,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=1280,900'
    ],
    defaultViewport: { width: 1280, height: 900 }
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

  // Check login state on WTTJ
  console.log('=== Step 2: Checking candidate dashboard https://www.welcometothejungle.com/fr/me/applications ===');
  await page.goto('https://www.welcometothejungle.com/fr/me/applications', { waitUntil: 'domcontentloaded', timeout: 35000 });
  await new Promise(r => setTimeout(r, 4000));

  // Dismiss Axeptio cookies
  try {
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button, #axeptio_btn_accept')];
      const accept = btns.find(b => b.textContent.includes('OK') || b.textContent.includes('Accepter') || b.textContent.includes('ok'));
      if (accept) accept.click();
    });
    await new Promise(r => setTimeout(r, 1000));
  } catch (e) {}

  const currentUrl = page.url();
  console.log('Current URL:', currentUrl);

  const initialScreenshot = path.join(screenshotDir, 'wttj_dashboard_before.png');
  await page.screenshot({ path: initialScreenshot, fullPage: true });
  console.log('Saved dashboard screenshot before application:', initialScreenshot);

  // Check if redirected to login
  const isLoginPage = currentUrl.includes('/login') || currentUrl.includes('/authenticate');
  console.log('Is currently on Login page?', isLoginPage);

  if (isLoginPage) {
    console.log('=== Step 2b: Performing Login with credentials boumelahamid@gmail.com ===');
    const emailInput = await page.$('input[type="email"], input[name="email"]');
    if (emailInput) await emailInput.type('boumelahamid@gmail.com', { delay: 30 });
    
    const passInput = await page.$('input[type="password"], input[name="password"]');
    if (passInput) await passInput.type('Pommier78955&&', { delay: 30 });

    const submitBtn = await page.$('button[type="submit"], button[class*="_variant-primary"]');
    if (submitBtn) {
      await submitBtn.click();
      await new Promise(r => setTimeout(r, 6000));
    }
    
    console.log('URL after login attempt:', page.url());
    const afterLoginScreenshot = path.join(screenshotDir, 'wttj_after_login_attempt.png');
    await page.screenshot({ path: afterLoginScreenshot, fullPage: true });
  }

  // Find a target job
  console.log('=== Step 3: Finding a live job to apply to ===');
  let targetJobUrl = 'https://www.welcometothejungle.com/fr/jobs?query=developpeur&refinementList%5Boffices.country_code%5D%5B%5D=FR';
  await page.goto(targetJobUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
  await new Promise(r => setTimeout(r, 3000));

  // Extract first job link
  const jobLink = await page.evaluate(() => {
    const anchors = [...document.querySelectorAll('a[href*="/companies/"][href*="/jobs/"]')];
    return anchors.length > 0 ? anchors[0].href : null;
  });

  console.log('Target Job Link:', jobLink);

  if (jobLink) {
    console.log('=== Step 4: Navigating to job page ===');
    await page.goto(jobLink, { waitUntil: 'domcontentloaded', timeout: 35000 });
    await new Promise(r => setTimeout(r, 3000));

    // Dismiss cookies if needed
    try {
      await page.evaluate(() => {
        const btns = [...document.querySelectorAll('button, #axeptio_btn_accept')];
        const accept = btns.find(b => b.textContent.includes('OK') || b.textContent.includes('Accepter') || b.textContent.includes('ok'));
        if (accept) accept.click();
      });
    } catch (e) {}

    // Find and click Apply button
    console.log('=== Step 5: Clicking Apply button ===');
    const applyClicked = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('a, button')];
      const applyBtn = btns.find(b => {
        const txt = (b.textContent || '').trim().toLowerCase();
        return (txt === 'postuler' || txt === 'apply' || txt.includes('postuler à cette offre') || txt.includes('apply for this job')) && !b.getAttribute('href')?.startsWith('mailto:');
      });
      if (applyBtn) {
        applyBtn.click();
        return true;
      }
      return false;
    });
    console.log('Apply button clicked:', applyClicked);
    await new Promise(r => setTimeout(r, 3000));

    const formScreenshot = path.join(screenshotDir, 'wttj_application_form.png');
    await page.screenshot({ path: formScreenshot, fullPage: true });

    // Inspect the form / modal
    console.log('=== Step 6: Filling Form details ===');
    await page.evaluate(() => {
      // First name
      const fn = document.querySelector('input[name*="first_name"], input[name*="firstname"], input[placeholder*="Prénom"], input[placeholder*="First"]');
      if (fn && !fn.value) fn.value = 'Hamid';

      // Last name
      const ln = document.querySelector('input[name*="last_name"], input[name*="lastname"], input[placeholder*="Nom"], input[placeholder*="Last"]');
      if (ln && !ln.value) ln.value = 'Boumela';

      // Email
      const em = document.querySelector('input[name*="email"], input[type="email"]');
      if (em && !em.value) em.value = 'boumelahamid@gmail.com';

      // Phone
      const ph = document.querySelector('input[name*="phone"], input[type="tel"]');
      if (ph && !ph.value) ph.value = '+33612345678';

      // Cover letter textarea
      const ta = document.querySelector('textarea');
      if (ta && !ta.value) ta.value = 'Madame, Monsieur,\n\nVivement intéressé par votre offre, je vous transmets ma candidature pour rejoindre votre équipe technique.\n\nCordialement,\nHamid Boumela';

      // Checkboxes
      const cbs = document.querySelectorAll('input[type="checkbox"]');
      cbs.forEach(cb => { cb.checked = true; });
    });

    await new Promise(r => setTimeout(r, 2000));
    const filledScreenshot = path.join(screenshotDir, 'wttj_form_filled.png');
    await page.screenshot({ path: filledScreenshot, fullPage: true });
    console.log('Form filled screenshot saved');
  }

  // Return to applications dashboard to inspect results
  console.log('=== Step 7: Visiting https://www.welcometothejungle.com/fr/me/applications to check application list ===');
  await page.goto('https://www.welcometothejungle.com/fr/me/applications', { waitUntil: 'networkidle2', timeout: 35000 });
  await new Promise(r => setTimeout(r, 4000));

  const finalScreenshot = path.join(screenshotDir, 'wttj_final_dashboard.png');
  await page.screenshot({ path: finalScreenshot, fullPage: true });

  const dashboardInfo = await page.evaluate(() => {
    return {
      url: window.location.href,
      pageTitle: document.title,
      bodyTextSnippet: document.body.innerText.slice(0, 500),
      applicationItemsCount: document.querySelectorAll('[data-testid*="application"], [class*="ApplicationCard"], article, table tr').length
    };
  });

  console.log('=== WTTJ Candidate Dashboard Final Results ===');
  console.log(JSON.stringify(dashboardInfo, null, 2));

  await browser.close();
  console.log('Verification finished.');
}

runVerification().catch(err => {
  console.error('Verification error:', err);
  process.exit(1);
});
