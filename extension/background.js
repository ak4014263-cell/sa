// Background service worker for JobSwipe Chrome Extension

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'SYNC_WTTJ_COOKIES') {
    handleCookieSync(sendResponse);
    return true; // Keep message channel open for async response
  }
});

async function handleCookieSync(sendResponse) {
  try {
    const cookies = await chrome.cookies.getAll({ domain: 'welcometothejungle.com' });
    
    if (!cookies || cookies.length === 0) {
      sendResponse({ success: false, error: 'Aucun cookie WTTJ trouvé. Connectez-vous d\'abord sur welcometothejungle.com !' });
      return;
    }

    // Format cookies for Puppeteer injection
    const puppeteerCookies = cookies.map(c => ({
      name: c.name,
      value: c.value,
      domain: c.domain.startsWith('.') ? c.domain : `.${c.domain}`,
      path: c.path,
      httpOnly: c.httpOnly,
      secure: c.secure,
      sameSite: c.sameSite === 'no_restriction' ? 'None' : (c.sameSite === 'lax' ? 'Lax' : 'Strict')
    }));

    // Send to JobSwipe server
    const res = await fetch('http://localhost:3000/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wttjCookies: puppeteerCookies,
        isSessionSynced: true
      })
    });

    const data = await res.json();
    if (data.success) {
      sendResponse({ success: true, count: cookies.length, message: 'Session WTTJ synchronisée avec succès avec JobSwipe !' });
    } else {
      sendResponse({ success: false, error: 'Erreur lors de la mise à jour du serveur JobSwipe' });
    }

  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}
