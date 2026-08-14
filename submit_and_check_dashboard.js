const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const path = require('path');
const fs = require('fs');

puppeteer.use(StealthPlugin());

async function main() {
  const sessionDir = path.join(__dirname, 'chrome_session');
  const screenshotDir = path.join(__dirname, 'public', 'screenshots');
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

  try {
    require('child_process').execSync('taskkill /F /IM chrome.exe /T 2>nul');
    await new Promise(r => setTimeout(r, 1000));
  } catch (e) {}

  console.log('=== Step 1: Launching Chrome with Persistent Session ===');
  const browser = await puppeteer.launch({
    headless: 'new',
    userDataDir: sessionDir,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=1280,1100'
    ],
    defaultViewport: { width: 1280, height: 1100 }
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

  // Navigate to Target Job
  const targetJobUrl = 'https://www.welcometothejungle.com/fr/companies/shape-it/jobs/developpeur-se-fullstack-java-angular_lyon_SI_V8GzVYe';
  console.log('=== Step 2: Opening Job Page ===', targetJobUrl);
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

  // Click Apply
  console.log('=== Step 3: Opening Apply Modal ===');
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button, a')];
    const applyBtn = btns.find(b => {
      const txt = (b.textContent || '').trim().toLowerCase();
      return txt === 'postuler' || txt === 'apply' || txt.includes('postuler à cette offre');
    });
    if (applyBtn) applyBtn.click();
  });
  await new Promise(r => setTimeout(r, 3000));

  // Fill and Fix Form
  console.log('=== Step 4: Fixing Form details & clearing photo error ===');
  await page.evaluate(() => {
    // Clear invalid photo by clicking delete icon if present
    const deletePhotoBtns = [...document.querySelectorAll('button')].filter(b => b.innerHTML.includes('trash') || b.getAttribute('aria-label')?.includes('Supprimer'));
    deletePhotoBtns.forEach(b => b.click());

    // Fill first name if empty
    const fn = document.querySelector('input[name*="first_name"], input[name*="firstname"], input[placeholder*="Prénom"]');
    if (fn && !fn.value) { fn.value = 'Fahid'; fn.dispatchEvent(new Event('input', { bubbles: true })); }

    // Fill last name if empty
    const ln = document.querySelector('input[name*="last_name"], input[name*="lastname"], input[placeholder*="Nom"]');
    if (ln && !ln.value) { ln.value = 'El Garouani'; ln.dispatchEvent(new Event('input', { bubbles: true })); }

    // Email
    const em = document.querySelector('input[name*="email"], input[type="email"]');
    if (em && !em.value) { em.value = 'boumelahamid@gmail.com'; em.dispatchEvent(new Event('input', { bubbles: true })); }

    // Phone
    const ph = document.querySelector('input[name*="phone"], input[type="tel"]');
    if (ph && !ph.value) { ph.value = '0651782681'; ph.dispatchEvent(new Event('input', { bubbles: true })); }

    // City
    const city = document.querySelector('input[name*="city"], input[placeholder*="Ville"], input[placeholder*="résidence"]');
    if (city && !city.value) { city.value = 'Paris, France'; city.dispatchEvent(new Event('input', { bubbles: true })); }

    // Fill any current position / experience inputs
    const positionInputs = document.querySelectorAll('input[placeholder*="Poste"], input[name*="profession"], input[name*="title"], input[placeholder*="Recherche"]');
    positionInputs.forEach(inp => {
      if (!inp.value) {
        inp.value = 'Développeur Full Stack';
        inp.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    // Cover letter
    const ta = document.querySelector('textarea');
    if (ta && !ta.value) {
      ta.value = "Madame, Monsieur,\n\nVivement intéressé par votre offre de Développeur Fullstack Java Angular, je vous transmets ma candidature pour rejoindre votre équipe.\n\nCordialement,\nFahid El Garouani";
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Check all required checkboxes
    document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.checked = true;
      cb.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });

  // Upload Resume specifically to CV input if present
  try {
    const resumeInput = await page.$('input[type="file"][accept*="pdf"], input[name*="resume"], input[name*="cv"], input[id*="resume"]');
    if (resumeInput) {
      const cvPath = path.join(__dirname, 'CV_Hamid_Boumela.pdf');
      await resumeInput.uploadFile(cvPath);
      console.log('CV attached to resume input');
    }
  } catch (e) {
    console.log('Resume upload notice:', e.message);
  }

  await new Promise(r => setTimeout(r, 2000));
  const beforeSubmitPic = path.join(screenshotDir, 'wttj_form_ready.png');
  await page.screenshot({ path: beforeSubmitPic, fullPage: true });

  // Click Submit
  console.log('=== Step 5: Scrolling Modal & Clicking Submit Button ===');
  await page.evaluate(() => {
    // Scroll all scrollable elements
    document.querySelectorAll('div, form, section').forEach(el => {
      if (el.scrollHeight > el.clientHeight) el.scrollTop = el.scrollHeight;
    });

    const btns = [...document.querySelectorAll('button')];
    const submitBtn = btns.find(b => {
      const txt = (b.textContent || '').trim().toLowerCase();
      return txt.includes('envoyer') || txt.includes('soumettre') || txt.includes('valider') || txt.includes('confirmer') || (txt.includes('postuler') && !txt.includes('cette offre'));
    });
    if (submitBtn) {
      submitBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      submitBtn.click();
      console.log('Clicked submit button:', submitBtn.textContent);
    }
  });

  await new Promise(r => setTimeout(r, 6000));
  const submittedPic = path.join(screenshotDir, 'wttj_after_submit_screen.png');
  await page.screenshot({ path: submittedPic, fullPage: true });

  // Navigate to candidate dashboard
  console.log('=== Step 6: Checking official WTTJ dashboard https://www.welcometothejungle.com/fr/me/applications ===');
  await page.goto('https://www.welcometothejungle.com/fr/me/applications', { waitUntil: 'domcontentloaded', timeout: 35000 });
  await new Promise(r => setTimeout(r, 5000));

  const finalPic = path.join(screenshotDir, 'wttj_real_dashboard_live.png');
  await page.screenshot({ path: finalPic, fullPage: true });
  console.log('Saved final candidate dashboard screenshot:', finalPic);

  const dashboardInfo = await page.evaluate(() => {
    const pageText = document.body.innerText;
    const cards = [...document.querySelectorAll('a[href*="/companies/"], [data-testid*="application"], article, h3, h4')].map(el => el.innerText.trim());
    return {
      currentUrl: window.location.href,
      pageTitle: document.title,
      textPreview: pageText.slice(0, 800),
      detectedElements: cards.slice(0, 15)
    };
  });

  console.log('=== WTTJ DASHBOARD RESULTS ===');
  console.log(JSON.stringify(dashboardInfo, null, 2));

  await browser.close();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
