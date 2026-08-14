const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const path = require('path');
const fs = require('fs');

(async () => {
  const sessionDir = path.join(__dirname, 'chrome_session');
  if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

  console.log('\n======================================================');
  console.log('🌐 Opening Chrome browser for Welcome to the Jungle...');
  console.log('1. Log in with your email & password.');
  console.log('2. Click the verification link in your Gmail if prompted.');
  console.log('3. Once you reach your WTTJ profile/dashboard, you can close the window!');
  console.log('======================================================\n');

  const browser = await puppeteer.launch({
    headless: false,
    userDataDir: sessionDir,
    defaultViewport: null,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized']
  });

  const pages = await browser.pages();
  const page = pages.length > 0 ? pages[0] : await browser.newPage();
  await page.goto('https://www.welcometothejungle.com/fr/authenticate/login', { waitUntil: 'domcontentloaded' });

  // Auto-fill email & password if fields exist to save time
  await new Promise(r => setTimeout(r, 2000));
  try {
    const emailInput = await page.$('input[type="email"]');
    if (emailInput) await emailInput.type('boumelahamid@gmail.com');

    const passInput = await page.$('input[type="password"]');
    if (passInput) await passInput.type('Pommier78955&&');
  } catch (e) {}

  console.log('✓ Credentials pre-filled! Please complete the login in the browser window.');

  // Keep alive until user completes login or closes browser
  browser.on('disconnected', () => {
    console.log('\n🎉 Browser closed! Your WTTJ session is permanently saved in chrome_session.');
    console.log('All future applications and Auto-Pilot runs will now apply directly from your real WTTJ account!\n');
    process.exit(0);
  });
})();
