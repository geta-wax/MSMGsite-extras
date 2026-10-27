// ==UserScript==
// @name         MSMGsite extras
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Mods and other stuff for MSMGsite. Made with 70% AI and 30% idiot
// @author       getawax.mp4
// @match        https://msmemergroup.com/*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      *
// @connect      raw.githubusercontent.com
// ==/UserScript==

(function () {
  'use strict';

  /* ---------- settings ---------- */
  const DEFAULTS = { font: '', googleFont: false, fontSize: 100, packId: 'none', customCss: '', packs: {} };
  let state = Object.assign({}, DEFAULTS, GM_getValue('settings', {}));
  state.packs = state.packs || {};
  const save = () => GM_setValue('settings', state);


  /* ---------- built-in packs ---------- */
  // A pack is: { name, author, css, font? }
  const BUILTIN = {
    midnight: {
      name: 'Midnight', author: 'built-in',
      css: `:root{color-scheme:dark}
html,body{background:#0d1117 !important;color:#c9d1d9 !important}
a{color:#58a6ff !important}`
    },
    terminal: {
      name: 'Terminal', author: 'built-in', font: 'Courier New',
      css: `html,body{background:#000 !important;color:#33ff66 !important}
a{color:#9dffb5 !important}`
    },
    parchment: {
      name: 'Parchment', author: 'built-in', font: 'Georgia',
      css: `html,body{background:#f4ecd8 !important;color:#3b2f1e !important}
a{color:#8a4b14 !important}`
    }
  };

  const getPack = (id) => BUILTIN[id] || state.packs[id] || null;

  /* ---------- css building ---------- */
  // Strip the most obviously risky things from third-party CSS.
  const clean = (css) => String(css)
    .replace(/@import[^;]*;?/gi, '')
    .replace(/expression\s*\(/gi, '')
    .replace(/javascript:/gi, '');

  const cssFont = (name) => "'" + String(name).replace(/['"\\;{}<>]/g, '') + "'";

  function buildCss() {
    const pack = getPack(state.packId);
    let css = '';
    if (pack) css += clean(pack.css) + '\n';

    const font = state.font || (pack && pack.font) || '';
    if (font) {
      css += 'body, body *:not([class*="icon" i]):not(.fa):not(.fas):not(.far):not(.fab):not(.material-icons):not(code):not(pre)' +
        '{font-family:' + cssFont(font) + ',sans-serif !important}\n';
    }
    if (Number(state.fontSize) !== 100) {
      css += 'html{font-size:' + Number(state.fontSize) + '% !important}\n';
    }
    if (state.customCss) css += clean(state.customCss) + '\n';
    return css;
  }

  /* ---------- applying ---------- */
  const styleEl = document.createElement('style');
  styleEl.id = 'msmg-customizer-style';
  const fontLink = document.createElement('link');
  fontLink.rel = 'stylesheet';

  function apply() {
    styleEl.textContent = buildCss();
    if (!styleEl.isConnected) document.documentElement.appendChild(styleEl);

    if (state.googleFont && state.font) {
      fontLink.href = 'https://fonts.googleapis.com/css2?family=' +
        encodeURIComponent(state.font).replace(/%20/g, '+') + '&display=swap';
      if (!fontLink.isConnected) document.documentElement.appendChild(fontLink);
    } else if (fontLink.isConnected) {
      fontLink.remove();
    }
  }

  apply(); // run immediately at document-start to avoid a flash of the default look

  /* ---------- pack import ---------- */
  function importText(text, fallbackName) {
    text = String(text || '').trim();
    if (!text) throw new Error('Nothing to import.');
    let pack;
    try { pack = JSON.parse(text); }
    catch (e) { pack = { name: fallbackName || 'Imported pack', author: 'unknown', css: text }; }
    if (!pack || typeof pack.css !== 'string') throw new Error('A pack needs a "css" field.');

    const name = String(pack.name || 'Imported pack').slice(0, 60);
    const id = 'user-' + (name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'pack');
    state.packs[id] = {
      name, author: String(pack.author || 'unknown').slice(0, 60),
      css: pack.css, font: pack.font ? String(pack.font).slice(0, 60) : ''
    };
    state.packId = id;
    save(); apply();
    return name;
  }

  /* ---------- announcements (broadcast) ---------- */
  const VERSION = '0.1.0';
  // Point this at the RAW announcements.json in your GitHub repo (replace YOUR-USERNAME).
  const ANNOUNCEMENTS_URL = 'https://raw.githubusercontent.com/geta-wax/MSMGsite-extras/main/announcements.json';
  const CHECK_EVERY_MS = 10 * 60 * 1000; // don't check more than once per 10 minutes
  const EMPTY_NEWS = { messages: [], latest: null };

  const newerThan = (a, b) => { // is version a newer than version b?
    const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const x = pa[i] || 0, y = pb[i] || 0;
      if (x !== y) return x > y;
    }
    return false;
  };

  const httpsOnly = (u) => (/^https:\/\//i.test(u || '') ? String(u) : '');

  // Everything from the remote file is treated as untrusted: trimmed, typed, and later shown as plain text only.
  function parseAnnouncements(text) {
    const data = JSON.parse(text);
    const now = Date.now();
    const messages = (Array.isArray(data.messages) ? data.messages : [])
      .filter((m) => m && m.id && (m.title || m.body))
      .filter((m) => !m.expires || isNaN(Date.parse(m.expires)) || Date.parse(m.expires) > now)
      .slice(0, 20)
      .map((m) => ({
        id: String(m.id).slice(0, 80),
        title: String(m.title || '').slice(0, 100),
        body: String(m.body || '').slice(0, 600),
        date: String(m.date || '').slice(0, 20),
        type: ['info', 'update', 'warning'].includes(m.type) ? m.type : 'info',
        link: httpsOnly(m.link)
      }));
    const l = data.latest;
    const latest = l && l.version
      ? { version: String(l.version).slice(0, 20), url: httpsOnly(l.url), notes: String(l.notes || '').slice(0, 200) }
      : null;
    return { messages, latest };
  }

  function loadAnnouncements(done, force) {
    const cached = GM_getValue('annCache', null);
    if (/YOUR-USERNAME/.test(ANNOUNCEMENTS_URL)) {
      done(EMPTY_NEWS, 'Not set up yet: replace YOUR-USERNAME in ANNOUNCEMENTS_URL at the top of the script.');
      return;
    }
    const age = Date.now() - GM_getValue('annChecked', 0);
    if (!force && cached && age < CHECK_EVERY_MS) {
      done(cached, 'Up to date (checked ' + Math.max(1, Math.round(age / 60000)) + ' min ago).');
      return;
    }
    GM_setValue('annChecked', Date.now());
    const fail = (why) => done(cached || EMPTY_NEWS, why);
    GM_xmlhttpRequest({
      method: 'GET', url: ANNOUNCEMENTS_URL + '?t=' + Date.now(), timeout: 15000,
      onload: (r) => {
        if (r.status !== 200) {
          fail('Could not load announcements (HTTP ' + r.status + '). Check the URL, that the repo is public, and that the file is on the main branch.');
          return;
        }
        try {
          const parsed = parseAnnouncements(r.responseText);
          GM_setValue('annCache', parsed);
          done(parsed, 'Loaded ' + parsed.messages.length + ' message(s).');
        } catch (e) { fail('announcements.json has a formatting error: ' + e.message); }
      },
      onerror: () => fail('Could not reach GitHub. If Tampermonkey asked for permission, choose "Always allow".'),
      ontimeout: () => fail('Timed out reaching GitHub.')
    });
  }

  /* ---------- logo ---------- */
  // Fetched through Tampermonkey (so the site's image restrictions can't block it) and cached as a data URL.
  const LOGO_URL = 'https://i.imgflip.com/b4dimn.jpg';
  function loadLogo(img) {
    const show = (src) => { img.src = src; img.hidden = false; };
    const cached = GM_getValue('logoDataUrl', '');
    if (cached) { show(cached); return; }
    GM_xmlhttpRequest({
      method: 'GET', url: LOGO_URL, responseType: 'blob',
      onload: (r) => {
        const fr = new FileReader();
        fr.onload = () => { show(fr.result); GM_setValue('logoDataUrl', fr.result); };
        fr.readAsDataURL(r.response);
      },
      onerror: () => { /* no logo, the title still shows */ }
    });
  }

  /* ---------- UI (shadow DOM so site themes never restyle it) ---------- */
  function buildUi() {
    if (document.getElementById('msmg-host')) return;
    const host = document.createElement('div');
    host.id = 'msmg-host';
    const root = host.attachShadow({ mode: 'open' });

    root.innerHTML = `
<style>
  :host { all: initial; }
  * { box-sizing: border-box; font-family: system-ui, sans-serif; }
  #gear { position: fixed; right: 14px; bottom: 14px; z-index: 2147483647; width: 40px; height: 40px;
          border-radius: 50%; border: 1px solid #555; background: #222; color: #fff; font-size: 18px; cursor: pointer; }
  #panel { position: fixed; right: 14px; bottom: 62px; z-index: 2147483647; width: 320px; max-height: 80vh;
           overflow: auto; background: #1b1b1f; color: #eee; border: 1px solid #444; border-radius: 10px;
           padding: 12px; font-size: 13px; box-shadow: 0 6px 24px rgba(0,0,0,.5); }
  #panel[hidden] { display: none; }
  .head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  h3 { margin: 0; font-size: 14px; }
  .ver { font-size: 11px; color: #999; margin-top: 1px; }
  #logo { width: 24px; height: 24px; object-fit: contain; border-radius: 4px; }
  h4 { margin: 12px 0 4px; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: #aaa; }
  input[type=text], select, textarea { width: 100%; background: #111; color: #eee; border: 1px solid #444;
          border-radius: 6px; padding: 6px; font-size: 13px; }
  textarea { min-height: 70px; resize: vertical; font-family: ui-monospace, monospace; }
  button.b { background: #3a3a44; color: #eee; border: 1px solid #555; border-radius: 6px; padding: 5px 9px;
          cursor: pointer; margin-top: 4px; font-size: 12px; }
  button.b:hover { background: #4a4a56; }
  label { display: flex; align-items: center; gap: 6px; margin-top: 4px; }
  #msg { margin-top: 8px; color: #9fd; min-height: 1em; }
  .row { display: flex; gap: 6px; }

  #badge { position: absolute; top: -5px; right: -5px; min-width: 18px; height: 18px; padding: 0 4px; border-radius: 9px;
           background: #e5484d; color: #fff; font-size: 11px; font-weight: 700; line-height: 18px; text-align: center; }
  #badge[hidden], #toast[hidden], #news[hidden] { display: none; }
  #toast { position: fixed; right: 14px; bottom: 62px; z-index: 2147483647; max-width: 260px; cursor: pointer;
           background: #1b1b1f; color: #eee; border: 1px solid #555; border-left: 3px solid #4da3ff; border-radius: 8px;
           padding: 8px 10px; font-size: 13px; box-shadow: 0 6px 24px rgba(0,0,0,.5); }
  .note { border: 1px solid #333; border-left: 3px solid #4da3ff; border-radius: 6px; padding: 6px 8px;
          margin-top: 6px; background: #17171b; }
  .note.update { border-left-color: #3fb950; }
  .note.warning { border-left-color: #e3b341; }
  .note.fresh { background: #20263a; }
  .nt { display: flex; justify-content: space-between; gap: 8px; }
  .nd { color: #999; font-size: 11px; white-space: nowrap; }
  .nb { margin-top: 3px; color: #ccc; white-space: pre-wrap; }
  .status { color: #888; font-size: 11px; margin-top: 8px; }
  .lnk { display: inline-block; margin-top: 4px; color: #6cb6ff; font-size: 12px; }
</style>
<button id="gear" title="MSMGsite extras">🎨<span id="badge" hidden></span></button>
<div id="toast" hidden></div>
<div id="panel" hidden>
  <div class="head"><img id="logo" alt="" hidden><div><h3>MSMGsite extras</h3><div class="ver">version 0.1 beta</div></div></div>

  <div id="news"></div>

  <h4>Font</h4>
  <input type="text" id="font" list="fonts" placeholder="Default (site font)">
  <datalist id="fonts">
    <option value="Comic Sans MS"><option value="Georgia"><option value="Verdana"><option value="Trebuchet MS">
    <option value="Courier New"><option value="Impact"><option value="Tahoma"><option value="Times New Roman">
  </datalist>
  <label><input type="checkbox" id="gfont"> Load from Google Fonts</label>
  <h4>Text size: <span id="sizeVal"></span>%</h4>
  <input type="range" id="size" min="70" max="160" step="5" style="width:100%">

  <h4>Texture pack</h4>
  <div class="row"><select id="pack"></select><button class="b" id="delPack" title="Delete imported pack">🗑</button></div>

  <h4>Import a pack</h4>
  <textarea id="paste" placeholder='Paste pack JSON {"name":"...","author":"...","css":"..."} or raw CSS'></textarea>
  <button class="b" id="importPaste">Import pasted</button>
  <div class="row" style="margin-top:6px"><input type="text" id="url" placeholder="https://… (pack JSON or .css)"><button class="b" id="importUrl">Fetch</button></div>

  <h4>Your own CSS</h4>
  <textarea id="css" placeholder="Extra CSS applied last"></textarea>

  <button class="b" id="reset">Reset everything</button>
  <div id="msg"></div>
</div>`;

    const $ = (s) => root.querySelector(s);
    const msg = (t) => { $('#msg').textContent = t; };
    loadLogo($('#logo'));

    function refreshPacks() {
      const sel = $('#pack');
      sel.innerHTML = '';
      const add = (id, label) => { const o = document.createElement('option'); o.value = id; o.textContent = label; sel.appendChild(o); };
      add('none', 'None (site default)');
      Object.keys(BUILTIN).forEach((id) => add(id, BUILTIN[id].name + ' · built-in'));
      Object.keys(state.packs).forEach((id) => add(id, state.packs[id].name + ' · ' + state.packs[id].author));
      sel.value = getPack(state.packId) ? state.packId : 'none';
      $('#delPack').disabled = !state.packs[sel.value];
    }

    function syncFields() {
      $('#font').value = state.font;
      $('#gfont').checked = state.googleFont;
      $('#size').value = state.fontSize;
      $('#sizeVal').textContent = state.fontSize;
      $('#css').value = state.customCss;
      refreshPacks();
    }

    const change = () => { save(); apply(); };

    $('#gear').addEventListener('click', () => {
      const p = $('#panel'); p.hidden = !p.hidden;
      if (!p.hidden) openedPanel();
    });
    $('#font').addEventListener('input', (e) => { state.font = e.target.value.trim(); change(); });
    $('#gfont').addEventListener('change', (e) => { state.googleFont = e.target.checked; change(); });
    $('#size').addEventListener('input', (e) => {
      state.fontSize = Number(e.target.value); $('#sizeVal').textContent = state.fontSize; change();
    });
    $('#pack').addEventListener('change', (e) => {
      state.packId = e.target.value; change(); $('#delPack').disabled = !state.packs[state.packId];
    });
    $('#delPack').addEventListener('click', () => {
      if (!state.packs[state.packId]) return;
      delete state.packs[state.packId]; state.packId = 'none'; change(); refreshPacks(); msg('Pack deleted.');
    });
    $('#css').addEventListener('input', (e) => { state.customCss = e.target.value; change(); });

    $('#importPaste').addEventListener('click', () => {
      try { const n = importText($('#paste').value); $('#paste').value = ''; refreshPacks(); msg('Imported "' + n + '" and applied it.'); }
      catch (err) { msg(err.message); }
    });

    $('#importUrl').addEventListener('click', () => {
      const url = $('#url').value.trim();
      if (!/^https:\/\//i.test(url)) { msg('Please use an https:// URL.'); return; }
      msg('Fetching…');
      GM_xmlhttpRequest({
        method: 'GET', url,
        onload: (r) => {
          try {
            const guess = url.split('/').pop().replace(/\.[a-z]+$/i, '') || 'Imported pack';
            const n = importText(r.responseText, guess);
            $('#url').value = ''; refreshPacks(); msg('Imported "' + n + '" and applied it.');
          } catch (err) { msg(err.message); }
        },
        onerror: () => msg('Could not fetch that URL.')
      });
    });

    $('#reset').addEventListener('click', () => {
      if (!confirm('Reset all Customizer settings and imported packs?')) return;
      state = Object.assign({}, DEFAULTS, { packs: {} });
      change(); syncFields(); msg('Reset.');
    });

    /* ----- announcements ----- */
    let news = EMPTY_NEWS;
    let newsStatus = 'Checking…';
    const readSet = () => new Set(GM_getValue('annRead', []));
    const unread = () => { const r = readSet(); return news.messages.filter((m) => !r.has(m.id)); };
    const updateAvailable = () => !!(news.latest && newerThan(news.latest.version, VERSION));
    const updateUnseen = () => updateAvailable() && GM_getValue('annUpdateSeen', '') !== news.latest.version;

    function updateBadge() {
      const n = unread().length + (updateUnseen() ? 1 : 0);
      const b = $('#badge');
      b.hidden = n === 0;
      b.textContent = n > 9 ? '9+' : String(n);
    }

    function markAllRead() {
      GM_setValue('annRead', news.messages.map((m) => m.id));
      if (news.latest) GM_setValue('annUpdateSeen', news.latest.version);
    }

    function renderNews() {
      const box = $('#news');
      box.innerHTML = '';
      const r = readSet();
      const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
      const link = (url, label) => { const a = el('a', 'lnk', label); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; };

      if (updateAvailable()) {
        const d = el('div', 'note update' + (updateUnseen() ? ' fresh' : ''));
        d.appendChild(el('b', '', 'Update available: v' + news.latest.version));
        if (news.latest.notes) d.appendChild(el('div', 'nb', news.latest.notes));
        if (news.latest.url) d.appendChild(link(news.latest.url, 'Get the update'));
        box.appendChild(d);
      }
      news.messages.forEach((m) => {
        const d = el('div', 'note ' + m.type + (r.has(m.id) ? '' : ' fresh'));
        const t = el('div', 'nt');
        t.appendChild(el('b', '', m.title || 'Message'));
        if (m.date) t.appendChild(el('span', 'nd', m.date));
        d.appendChild(t);
        if (m.body) d.appendChild(el('div', 'nb', m.body));
        if (m.link) d.appendChild(link(m.link, 'Open link'));
        box.appendChild(d);
      });
      box.prepend(el('h4', '', 'Announcements'));
      box.appendChild(el('div', 'status', newsStatus));
      const again = el('button', 'b', 'Check now');
      again.addEventListener('click', () => { newsStatus = 'Checking…'; renderNews(); fetchNews(true); });
      box.appendChild(again);
    }

    function openedPanel() {
      $('#toast').hidden = true;
      renderNews();     // shows new items highlighted...
      markAllRead();    // ...then marks them as read
      updateBadge();
    }

    let toastTimer = null;
    function showToast() {
      const fresh = unread();
      let text = '';
      if (updateUnseen()) text = 'Update available: v' + news.latest.version;
      else if (fresh.length === 1) text = fresh[0].title || 'New message';
      else if (fresh.length > 1) text = fresh.length + ' new messages';
      if (!text) return;
      const t = $('#toast');
      t.textContent = '📢 ' + text;
      t.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { t.hidden = true; }, 10000);
    }
    $('#toast').addEventListener('click', () => { $('#panel').hidden = false; openedPanel(); });

    function fetchNews(force) {
      loadAnnouncements((data, status) => {
        news = data;
        newsStatus = status;
        updateBadge();
        if (!$('#panel').hidden) openedPanel();
        else showToast();
      }, force);
    }
    fetchNews(false);

    syncFields();
    document.documentElement.appendChild(host);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildUi);
  else buildUi();

  GM_registerMenuCommand('Open MSMGsite extras', () => {
    const host = document.getElementById('msmg-host');
    if (host && host.shadowRoot.querySelector('#panel').hidden) host.shadowRoot.querySelector('#gear').click();
  });
})();
