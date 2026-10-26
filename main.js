// ==UserScript==
// @name         MSMGsite extras
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Mods and other stuff for MSMGsite. Made with 70% AI and 30% idiot
// @author       getawax.mp4
// @match        https://msmemergroup.com/*
// @icon         https://i.imgflip.com/b4dimn.jpg
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      *
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
</style>
<button id="gear" title="MSMGsite extras">🎨</button>
<div id="panel" hidden>
  <div class="head"><img id="logo" alt="" hidden><div><h3>MSMGsite extras</h3><div class="ver">version 0.1 beta</div></div></div>

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

    $('#gear').addEventListener('click', () => { $('#panel').hidden = !$('#panel').hidden; });
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

    syncFields();
    document.documentElement.appendChild(host);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildUi);
  else buildUi();

  GM_registerMenuCommand('Open MSMGsite extras', () => {
    const host = document.getElementById('msmg-host');
    if (host) host.shadowRoot.querySelector('#panel').hidden = false;
  });
})();
