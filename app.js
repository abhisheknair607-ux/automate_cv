'use strict';
// Only a Google Apps Script deployment URL is stored. No CV data, tokens, email,
// Google Sheets content or passwords ever enter local storage or the SW cache.
const STORAGE_KEY = 'automate_cv_google_apps_script_exec_v1';
const GET = name => document.getElementById(name);
const openButton = GET('openLive');
const input = GET('appUrl');
const err = GET('linkError');
let deferredInstallPrompt = null;

function normalizeGoogleWebApp(value) {
  let parsed;
  try { parsed = new URL(String(value || '').trim()); } catch { throw Error('Paste the complete Google Apps Script /exec URL.'); }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'script.google.com'
    || !/^\/macros\/s\/[A-Za-z0-9_-]+\/exec\/?$/.test(parsed.pathname)) {
    throw Error('Use the HTTPS deployment URL ending in /exec from Google Apps Script.');
  }
  // Fragments and query parameters are not required to open the deployed app.
  return `https://script.google.com${parsed.pathname.replace(/\/$/, '')}`;
}
function readSavedLink() {
  try { return normalizeGoogleWebApp(localStorage.getItem(STORAGE_KEY)); } catch { return ''; }
}
function render() {
  const saved = readSavedLink(), has = !!saved;
  openButton.disabled = !has;
  GET('status').classList.toggle('unlinked', !has);
  GET('statusText').textContent = has ? 'Secure workspace connected on this device' : 'Connect your secure workspace';
  GET('linkBadge').textContent = has ? 'Linked' : 'Setup';
  GET('linkBadge').classList.toggle('wait', !has);
  GET('setupTitle').textContent = has ? 'Change workspace link' : 'Connect the live webpage';
  GET('setupHint').textContent = has ? 'Update the saved link if you redeploy Google Apps Script.' : 'Paste the Google Apps Script /exec URL from your deployment. This saves the link on this device only.';
  GET('forgetLink').classList.toggle('hide', !has);
  GET('targetPreview').textContent = has ? saved : 'Add your Apps Script web app link once below.';
  if (has) input.value = saved;
}
function showError(message) { err.textContent = message; err.style.display = 'block'; }
GET('setupForm').addEventListener('submit', e => {
  e.preventDefault();
  try {
    const url = normalizeGoogleWebApp(input.value);
    localStorage.setItem(STORAGE_KEY, url);
    err.textContent = ''; err.style.display = 'none';
    render();
  } catch (error) { showError(error.message); }
});
GET('forgetLink').addEventListener('click', () => {
  if (!confirm('Forget the saved Apps Script URL on this device? No Google Sheet data will be changed.')) return;
  localStorage.removeItem(STORAGE_KEY); input.value = ''; render();
});
openButton.addEventListener('click', () => {
  const url = readSavedLink();
  if (!url) return showError('Save a valid deployment link first.');
  // The Google-hosted app opens directly (not inside an iframe, which breaks
  // Google authentication). Sheets are written there after confirmed saves.
  window.open(url, '_blank', 'noopener,noreferrer');
});
function showInstallInstructions() {
  const isInstalled = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const hint = GET('installHint'); hint.classList.remove('hide');
  hint.textContent = isInstalled
    ? 'Automate CV is already running as an installed app.'
    : 'In Chrome on Android: tap ⋮ → Add to Home screen → Install app. If asked, confirm Install. Make sure this page is opened on HTTPS.';
}
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); deferredInstallPrompt = e;
  GET('installButton').textContent = 'Install app';
  GET('installHint').classList.add('hide');
});
GET('installButton').addEventListener('click', async () => {
  if (!deferredInstallPrompt) return showInstallInstructions();
  const prompt = deferredInstallPrompt; deferredInstallPrompt = null;
  await prompt.prompt();
  const { outcome } = await prompt.userChoice;
  if (outcome === 'accepted') {
    GET('installButton').textContent = 'Installed ✓';
    GET('installHint').classList.add('hide');
  } else { showInstallInstructions(); }
});
window.addEventListener('appinstalled', () => {
  GET('installButton').textContent = 'Installed ✓';
  GET('installHint').classList.add('hide');
});
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js', { scope: './' }).catch(() => {
      // Installation may still be offered; show no misleading offline guarantee.
    });
  });
}
render();
