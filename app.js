'use strict';
// Live Google Apps Script deployment URL, intentionally public as a navigation
// destination. Authentication stays with Google; never store Google credentials.
const LIVE_APP_URL = 'https://script.google.com/macros/s/AKfycbw6krfQ8lULe84nUZd88rRnFUffndcUTirt8HQf9TGTDB5B0F6diGn5JA5W5OO5qhix/exec';
const GET = id => document.getElementById(id);
const link = GET('openLive');
let deferredInstallPrompt = null;
link.href = LIVE_APP_URL;

function showInstallInstructions() {
  const installed = window.matchMedia('(display-mode: standalone)').matches ||
    navigator.standalone === true;
  const hint = GET('installHint');
  hint.classList.remove('hide');
  hint.textContent = installed
    ? 'Automate CV is installed. Use Open job dashboard to reach the Google-hosted workspace.'
    : 'Android Chrome: tap the menu (⋮) → Add to Home screen → Install app, then confirm. The icon appears in your app drawer.';
}
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstallPrompt = e;
  GET('installButton').textContent = 'Install app';
  GET('installHint').classList.add('hide');
});
GET('installButton').addEventListener('click', async () => {
  if (!deferredInstallPrompt) return showInstallInstructions();
  const prompt = deferredInstallPrompt;
  deferredInstallPrompt = null;
  await prompt.prompt();
  const {outcome} = await prompt.userChoice;
  if (outcome === 'accepted') {
    GET('installButton').textContent = 'Installed ✓';
    GET('installHint').classList.add('hide');
  } else showInstallInstructions();
});
window.addEventListener('appinstalled', () => {
  GET('installButton').textContent = 'Installed ✓';
  GET('installHint').classList.add('hide');
});
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js', {scope:'./'}).catch(() => {
      // Google authentication and dashboard remain online-only.
    });
  });
}
// Launch the secure, existing dashboard directly from the app drawer. A
// cross-origin Google-authenticated page cannot remain inside our PWA scope;
// Android may transition to Chrome. No manual URL entry is required.
const launchedFromAppDrawer = window.matchMedia('(display-mode: standalone)').matches ||
  navigator.standalone === true ||
  new URLSearchParams(window.location.search).get('source') === 'installed';
if (launchedFromAppDrawer) window.location.replace(LIVE_APP_URL);
