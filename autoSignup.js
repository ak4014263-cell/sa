const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const path = require('path');
const fs = require('fs');

async function autoSignup(profile, callback) {
  const applicationId = 'signup';
  callback(applicationId, { status: 'starting', message: 'Démarrage de la création de compte WTTJ...' });

  const screenshotDir = path.join(__dirname, 'public', 'screenshots');
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

  const browser = await puppeteer.launch({
    headless: false, // Run visibly to see what's going wrong
    slowMo: 50,      // Slow down to watch the flow
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
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    // Go directly to WTTJ Signup page
    callback(applicationId, { status: 'navigating', message: 'Ouverture de la page d\'inscription WTTJ...' });
    await page.goto('https://www.welcometothejungle.com/fr/authenticate/signup', { waitUntil: 'networkidle2', timeout: 30000 });
    
    await new Promise(r => setTimeout(r, 2000));
    
    let screenshotPath = path.join(screenshotDir, `${applicationId}_step1_signup_page.png`);
    await page.screenshot({ path: screenshotPath });
    callback(applicationId, { status: 'filling', message: 'Formulaire d\'inscription prêt', screenshot: `/screenshots/${applicationId}_step1_signup_page.png` });

    // Fill Full Name (WTTJ now uses a single field for name)
    callback(applicationId, { status: 'filling', message: 'Remplissage des informations...' });
    
    let targetContext = page;
    const iframes = await page.frames();
    const authFrame = iframes.find(f => f.url().includes('auth') || f.url().includes('login'));
    if (authFrame) {
      targetContext = authFrame;
    }
    
    const fullName = `${profile.firstName} ${profile.lastName}`.trim();
    const nameSelectors = ['input[placeholder*="Anita"]', 'input[placeholder*="Lent"]', 'input[type="text"]', 'input[name="firstName"]', 'input[name="name"]'];
    for (const sel of nameSelectors) {
      try {
        const input = await targetContext.$(sel);
        if (input) { await input.type(fullName, { delay: 50 }); break; }
      } catch (e) {}
    }

    // Fill Email
    const emailSelectors = ['input[type="email"]', 'input[name="email"]'];
    for (const sel of emailSelectors) {
      try {
        const input = await targetContext.$(sel);
        if (input) { await input.type(profile.email, { delay: 50 }); break; }
      } catch (e) {}
    }

    // Fill Password
    const passSelectors = ['input[type="password"]', 'input[name="password"]'];
    for (const sel of passSelectors) {
      try {
        const input = await targetContext.$(sel);
        if (input) { await input.type(profile.wttjPassword, { delay: 50 }); break; }
      } catch (e) {}
    }

    // Check Terms (checkbox)
    try {
        const checkbox = await targetContext.$('input[type="checkbox"]');
        if (checkbox) await checkbox.click();
    } catch(e) {}

    await new Promise(r => setTimeout(r, 1000));
    
    screenshotPath = path.join(screenshotDir, `${applicationId}_step2_filled.png`);
    await page.screenshot({ path: screenshotPath });
    callback(applicationId, { status: 'submitting', message: 'Soumission du formulaire...', screenshot: `/screenshots/${applicationId}_step2_filled.png` });

    // Click Submit
    const submitSelectors = [
      'button[type="submit"]', 
      'button[class*="_variant-primary"]',
      'button:has-text("Accepter")',
      'button:has-text("Accept")'
    ];
    let submitted = false;
    for (const sel of submitSelectors) {
      try {
        const btn = await targetContext.$(sel);
        if (btn) {
          await btn.click();
          submitted = true;
          break;
        }
      } catch (e) {}
    }
    
    if(!submitted) {
        await targetContext.evaluate(() => {
            const btns = [...document.querySelectorAll('button')];
            const btn = btns.find(b => b.textContent.toLowerCase().includes("accepter") || b.textContent.toLowerCase().includes("accept"));
            if(btn) btn.click();
        });
    }

    await new Promise(r => setTimeout(r, 4000));

    screenshotPath = path.join(screenshotDir, `${applicationId}_step3_done.png`);
    await page.screenshot({ path: screenshotPath });
    callback(applicationId, { 
      status: 'completed', 
      message: '✅ Compte créé ! IMPORTANT : Veuillez vérifier votre boîte mail et cliquer sur le lien envoyé par Welcome to the Jungle avant de postuler.', 
      screenshot: `/screenshots/${applicationId}_step3_done.png` 
    });

  } catch (error) {
    console.error('[AutoSignup] Error:', error.message);
    callback(applicationId, { status: 'error', message: `Erreur: ${error.message}` });
    throw error;
  } finally {
    await browser.close();
  }
}

module.exports = { autoSignup };
