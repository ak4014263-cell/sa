const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const path = require('path');
const fs = require('fs');

puppeteer.use(StealthPlugin());

async function checkDashboard() {
  try {
    require('child_process').execSync('taskkill /F /IM chrome.exe /T 2>nul');
    await new Promise(r => setTimeout(r, 1000));
  } catch (e) {}

  const sessionDir = path.join(__dirname, 'chrome_session');
  const screenshotDir = path.join(__dirname, 'public', 'screenshots');
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

  const browser = await puppeteer.launch({
    headless: 'new',
    userDataDir: sessionDir,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,900']
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

  console.log('Navigating to https://www.welcometothejungle.com/fr/me/application-tracker ...');
  await page.goto('https://www.welcometothejungle.com/fr/me/application-tracker', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 4000));

  // Remove any modal or banner overlays
  try {
    await page.evaluate(() => {
      document.querySelectorAll('[id*="axeptio"], #axeptio_overlay, .axeptio_mount').forEach(el => el.remove());
    });
    await new Promise(r => setTimeout(r, 1000));
  } catch (e) {}

  const screenshotPath = path.join(screenshotDir, 'wttj_live_applications_dashboard.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log('Saved dashboard screenshot:', screenshotPath);

  const result = await page.evaluate(() => {
    const title = document.title;
    const url = window.location.href;
    const text = document.body.innerText;
    
    // Find all application items
    const elements = [...document.querySelectorAll('a, article, [data-testid*="application"], h2, h3, h4, span')].map(el => el.innerText.trim()).filter(t => t.length > 3);
    
    return {
      title,
      url,
      textSnippet: text.slice(0, 1000),
      detectedItems: elements.slice(0, 30)
    };
  });

  console.log('=== REAL WTTJ DASHBOARD CONTENT ===');
  console.log(JSON.stringify(result, null, 2));

  await browser.close();
}

checkDashboard().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
