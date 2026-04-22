// ============================================================
// PIXICHAT — config.js
// Gestion robuste de la connexion pour Web + APK Android
// ============================================================

const SERVER_URL = "https://nodemes-3.onrender.com";

// ─── RENDER WAKE-UP ────────────────────────────────────────
(function pingServer() {
  const MAX_ATTEMPTS = 8;
  const INTERVAL_MS  = 4000;
  let attempts = 0;

  function showWakeUpBanner() {
    if (document.getElementById("wakeup-banner")) return;
    const b = document.createElement("div");
    b.id = "wakeup-banner";
    b.style.cssText = [
      "position:fixed;top:0;left:0;right:0;z-index:99999",
      "background:#7c6aff;color:#fff;text-align:center",
      "padding:10px 16px;font-size:0.85rem",
      "font-family:'DM Sans',sans-serif",
      "display:flex;align-items:center;justify-content:center;gap:10px"
    ].join(";");
    b.innerHTML =
      '<svg id="wakeup-spinner" width="18" height="18" viewBox="0 0 24 24" fill="none"' +
      ' stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"' +
      ' style="animation:wk-spin 1s linear infinite">' +
      '<polyline points="23 4 23 10 17 10"/>' +
      '<path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>' +
      '<span id="wakeup-text">Connexion au serveur\u2026</span>' +
      '<style>@keyframes wk-spin{to{transform:rotate(360deg)}}</style>';
    document.body.appendChild(b);
  }

  function setWakeUpOk() {
    const b = document.getElementById("wakeup-banner");
    if (!b) return;
    b.style.background = "#00d4a0";
    const sp = document.getElementById("wakeup-spinner");
    if (sp) sp.style.display = "none";
    document.getElementById("wakeup-text").textContent = "Connect\u00e9 \u2713";
    setTimeout(function() { if (b.parentNode) b.parentNode.removeChild(b); }, 1800);
  }

  function setWakeUpError() {
    const b = document.getElementById("wakeup-banner");
    if (!b) return;
    b.style.background = "#ff4d6a";
    const sp = document.getElementById("wakeup-spinner");
    if (sp) sp.style.display = "none";
    document.getElementById("wakeup-text").textContent =
      "Serveur inaccessible. V\u00e9rifiez votre connexion.";
  }

  async function tryPing() {
    try {
      const ctrl = new AbortController();
      const tid  = setTimeout(function() { ctrl.abort(); }, 5000);
      const res  = await fetch(SERVER_URL + "/ping", {
        method: "GET", signal: ctrl.signal, cache: "no-store"
      });
      clearTimeout(tid);
      // 404 = serveur réveillé mais route inconnue → OK quand même
      if (res.ok || res.status === 404) return true;
    } catch (e) { /* timeout ou réseau indisponible */ }
    return false;
  }

  async function wakeUp() {
    const first = await tryPing();
    if (first) return;          // connexion instantanée, pas besoin de bannière

    showWakeUpBanner();

    const timer = setInterval(async function() {
      attempts++;
      const ok = await tryPing();
      if (ok) { clearInterval(timer); setWakeUpOk(); return; }
      if (attempts >= MAX_ATTEMPTS) { clearInterval(timer); setWakeUpError(); }
    }, INTERVAL_MS);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wakeUp);
  } else {
    wakeUp();
  }
})();

// ─── fetchWithRetry ────────────────────────────────────────
async function fetchWithRetry(url, options, retries, delay) {
  retries = retries || 3;
  delay   = delay   || 1500;
  options = options || {};
  for (var i = 0; i < retries; i++) {
    try {
      var ctrl    = new AbortController();
      var timeout = setTimeout(function() { ctrl.abort(); }, 10000);
      var res     = await fetch(url, Object.assign({}, options, { signal: ctrl.signal }));
      clearTimeout(timeout);
      return res;
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(function(r) { setTimeout(r, delay * (i + 1)); });
    }
  }
}

// ─── Détection APK Capacitor ───────────────────────────────
var IS_NATIVE = !!(window.Capacitor &&
                   window.Capacitor.isNativePlatform &&
                   window.Capacitor.isNativePlatform());
if (IS_NATIVE) console.log("[PixiChat] Mode APK Android");
