document.getElementById('btn-sync').addEventListener('click', () => {
  const btn = document.getElementById('btn-sync');
  const statusBox = document.getElementById('status-box');
  btn.disabled = true;
  btn.innerText = 'Synchronisation en cours...';

  chrome.runtime.sendMessage({ action: 'SYNC_WTTJ_COOKIES' }, (response) => {
    btn.disabled = false;
    btn.innerHTML = '<span>⚡ Synchroniser ma session WTTJ</span>';
    statusBox.style.display = 'block';

    if (response && response.success) {
      statusBox.className = 'status-box success';
      statusBox.innerHTML = `<strong>✓ Succès !</strong><br>${response.count} cookies de session transférés vers JobSwipe.`;
    } else {
      statusBox.className = 'status-box error';
      statusBox.innerHTML = `<strong>✕ Erreur</strong><br>${(response && response.error) || 'Impossible de synchroniser les cookies.'}`;
    }
  });
});
