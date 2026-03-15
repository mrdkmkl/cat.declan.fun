// ─────────────────────────────────────────────────────
//  translator.js — UI shell only
//  All translation logic lives in worker.js
// ─────────────────────────────────────────────────────

const WORD_LIMIT = 100;

function countWords(t) {
  return t.trim().split(/\s+/).filter(w => w.replace(/[^a-zA-Z']/g,'').length > 0).length;
}

document.addEventListener('DOMContentLoaded', () => {

  // ── Start worker ─────────────────────────────────
  const worker  = new Worker('worker.js');
  let   reqId   = 0;
  let   pending = {};
  let   debounce;

  worker.onmessage = e => {
    const { id, html } = e.data;
    if (pending[id]) { pending[id](html); delete pending[id]; }
  };
  worker.onerror = () => {
    outputEl.innerHTML = '<span class="col-low">Worker error — reload the page</span>';
  };

  function ask(type, text) {
    return new Promise(resolve => {
      const id = ++reqId;
      pending[id] = resolve;
      worker.postMessage({ id, type, text });
    });
  }

  // ── Mode config ───────────────────────────────────
  let mode = 'en-cat';

  const MODES = {
    'en-cat':    { left:'English', right:'<strong>Cat</strong>',
                   ph:'Type in English\u2026 (max 100 words)',
                   dir:'to-cat',      group:'cat',    limit:true  },
    'en-stormy': { left:'English', right:'<strong>Stormy</strong><span class="stormy-label-badge">extended</span>',
                   ph:'Type in English\u2026 (max 100 words)',
                   dir:'to-stormy',   group:'stormy', limit:true  },
    'cat-en':    { left:'Cat',     right:'<strong>English</strong>',
                   ph:'Type Cat words\u2026',
                   dir:'from-cat',    group:'cat',    limit:false },
    'stormy-en': { left:'Stormy',  right:'<strong>English</strong>',
                   ph:'Type Stormy words\u2026',
                   dir:'from-stormy', group:'stormy', limit:false },
  };
  const SWAP = {
    'en-cat':'cat-en', 'cat-en':'en-cat',
    'en-stormy':'stormy-en', 'stormy-en':'en-stormy',
  };

  // ── DOM ───────────────────────────────────────────
  const inputEl  = document.getElementById('input-text');
  const outputEl = document.getElementById('output-area');
  const leftLbl  = document.getElementById('left-label');
  const rightLbl = document.getElementById('right-label');
  const modeBtns = document.querySelectorAll('.mode-btn');
  const counter  = document.getElementById('word-counter');

  const PLACEHOLDER = '<span class="output-placeholder">Translation appears here\u2026</span>';
  const TRANSLATING = '<span class="translating-msg">Translating\u2026</span>';

  // ── Word counter ──────────────────────────────────
  function updateCounter() {
    const cfg = MODES[mode];
    if (!cfg.limit) { counter.style.display = 'none'; return; }
    counter.style.display = 'inline';
    const n = countWords(inputEl.value);
    counter.textContent = n + ' / ' + WORD_LIMIT;
    counter.classList.toggle('over-limit', n > WORD_LIMIT);
  }

  function enforceLimit() {
    if (!MODES[mode].limit) return;
    const chunks = inputEl.value.trim().split(/(\s+)/);
    let count = 0, cut = inputEl.value.length, pos = 0;
    for (const c of chunks) {
      if (c.replace(/[^a-zA-Z']/g,'').length > 0) {
        count++;
        if (count > WORD_LIMIT) { cut = pos; break; }
      }
      pos += c.length;
    }
    if (count > WORD_LIMIT) inputEl.value = inputEl.value.slice(0, cut).trimEnd();
  }

  // ── Set mode ──────────────────────────────────────
  function setMode(m) {
    mode = m;
    const cfg = MODES[m];
    leftLbl.innerHTML   = '<strong>' + cfg.left + '</strong>';
    rightLbl.innerHTML  = cfg.right;
    inputEl.placeholder = cfg.ph;
    modeBtns.forEach(btn => {
      const on = btn.dataset.mode === m;
      btn.classList.toggle('active', on);
      btn.classList.remove('cat-mode', 'stormy-mode');
      if (on) btn.classList.add(cfg.group === 'stormy' ? 'stormy-mode' : 'cat-mode');
    });
    updateCounter();
    doTranslate();
  }

  // ── Translate ─────────────────────────────────────
  let latestReq = 0;

  async function doTranslate() {
    const text = inputEl.value.trim();
    if (!text) { outputEl.innerHTML = PLACEHOLDER; return; }
    const myReq = ++latestReq;
    // Show "Translating…" only if worker takes more than 120ms
    const t = setTimeout(() => {
      if (latestReq === myReq) outputEl.innerHTML = TRANSLATING;
    }, 120);
    const html = await ask(MODES[mode].dir, text);
    clearTimeout(t);
    if (latestReq === myReq) outputEl.innerHTML = html || PLACEHOLDER;
  }

  function schedule() {
    clearTimeout(debounce);
    debounce = setTimeout(doTranslate, 60);
  }

  // ── Events ────────────────────────────────────────
  inputEl.addEventListener('input', () => {
    enforceLimit();
    updateCounter();
    schedule();
  });

  modeBtns.forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));

  document.getElementById('clear-btn').addEventListener('click', () => {
    inputEl.value = '';
    outputEl.innerHTML = PLACEHOLDER;
    updateCounter();
    inputEl.focus();
  });

  document.getElementById('copy-btn').addEventListener('click', () => {
    navigator.clipboard.writeText(
      outputEl.innerText.replace(/\s+/g,' ').trim()
    ).then(() => {
      const btn = document.getElementById('copy-btn');
      btn.textContent = 'copied!';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = 'copy'; btn.classList.remove('copied'); }, 1500);
    });
  });

  document.getElementById('swap-btn').addEventListener('click', () => {
    const out = outputEl.innerText.replace(/\s+/g,' ').trim();
    setMode(SWAP[mode]);
    if (out && out !== 'Translation appears here\u2026' && out !== 'Translating\u2026') {
      inputEl.value = out;
      enforceLimit();
      updateCounter();
      doTranslate();
    }
  });

  setMode('en-cat');
});
