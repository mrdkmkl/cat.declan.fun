// ─────────────────────────────────────────────────────
//  translator.js — UI shell only
//  All translation logic lives in worker.js (Web Worker)
//  The worker runs on a background thread so the UI
//  stays responsive and can show "Translating..."
// ─────────────────────────────────────────────────────

const WORD_LIMIT = 100;

function countWords(text) {
  return text.trim().split(/\s+/).filter(w => w.replace(/[^a-zA-Z']/g,'').length > 0).length;
}

document.addEventListener('DOMContentLoaded', function () {

  // ── Spin up the Web Worker ──────────────────────────
  // The worker stays alive for the whole session so its
  // session maps (unknown word round-trips) are preserved.
  const worker = new Worker('worker.js');
  let pendingId = 0;
  let debounceTimer = null;

  // Map of request id → resolve function (only last matters)
  const pending = {};

  worker.onmessage = function(e) {
    const { id, html } = e.data;
    if (pending[id]) {
      pending[id](html);
      delete pending[id];
    }
  };

  function requestTranslation(type, text) {
    return new Promise(resolve => {
      const id = ++pendingId;
      pending[id] = resolve;
      worker.postMessage({ id, type, text });
    });
  }

  // ── Mode config ─────────────────────────────────────
  let currentMode = 'en-cat';

  const modeConfig = {
    'en-cat':    { leftLang:'English', rightLabelHTML:'<strong>Cat</strong>',
                   placeholder:'Type in English… (max 100 words)', dir:'to-cat', group:'cat', showLimit:true },
    'en-stormy': { leftLang:'English', rightLabelHTML:'<strong>Stormy</strong><span class="stormy-label-badge">extended</span>',
                   placeholder:'Type in English… (max 100 words)', dir:'to-stormy', group:'stormy', showLimit:true },
    'cat-en':    { leftLang:'Cat',     rightLabelHTML:'<strong>English</strong>',
                   placeholder:'Type Cat words…', dir:'from-cat', group:'cat', showLimit:false },
    'stormy-en': { leftLang:'Stormy',  rightLabelHTML:'<strong>English</strong>',
                   placeholder:'Type Stormy words…', dir:'from-stormy', group:'stormy', showLimit:false },
  };

  const swapPair = { 'en-cat':'cat-en','cat-en':'en-cat','en-stormy':'stormy-en','stormy-en':'en-stormy' };

  // ── DOM refs ─────────────────────────────────────────
  const inputEl    = document.getElementById('input-text');
  const outputEl   = document.getElementById('output-area');
  const leftLabel  = document.getElementById('left-label');
  const rightLabel = document.getElementById('right-label');
  const modeBtns   = document.querySelectorAll('.mode-btn');
  const wordCounter= document.getElementById('word-counter');

  // ── Word counter ─────────────────────────────────────
  function updateWordCounter() {
    const cfg = modeConfig[currentMode];
    if (!cfg.showLimit) { wordCounter.style.display = 'none'; return; }
    wordCounter.style.display = 'inline';
    const count = countWords(inputEl.value);
    wordCounter.textContent = `${count} / ${WORD_LIMIT}`;
    wordCounter.classList.toggle('over-limit', count > WORD_LIMIT);
  }

  function enforceWordLimit() {
    const cfg = modeConfig[currentMode];
    if (!cfg.showLimit) return;
    const chunks = inputEl.value.trim().split(/(\s+)/);
    let count = 0, cutIndex = inputEl.value.length, charPos = 0;
    for (const chunk of chunks) {
      if (chunk.replace(/[^a-zA-Z']/g,'').length > 0) {
        count++;
        if (count > WORD_LIMIT) { cutIndex = charPos; break; }
      }
      charPos += chunk.length;
    }
    if (count > WORD_LIMIT) inputEl.value = inputEl.value.slice(0, cutIndex).trimEnd();
  }

  // ── Set mode ─────────────────────────────────────────
  function setMode(mode) {
    currentMode = mode;
    const cfg = modeConfig[mode];
    leftLabel.innerHTML  = `<strong>${cfg.leftLang}</strong>`;
    rightLabel.innerHTML = cfg.rightLabelHTML;
    inputEl.placeholder  = cfg.placeholder;
    modeBtns.forEach(btn => {
      const active = btn.dataset.mode === mode;
      btn.classList.toggle('active', active);
      btn.classList.remove('cat-mode', 'stormy-mode');
      if (active) btn.classList.add(cfg.group === 'stormy' ? 'stormy-mode' : 'cat-mode');
    });
    updateWordCounter();
    doTranslate();
  }

  // ── Translate — debounced, shows "Translating…" ──────
  const TRANSLATING_HTML = '<span class="translating-msg">Translating…</span>';
  const PLACEHOLDER_HTML = '<span class="output-placeholder">Translation appears here…</span>';
  const TRANSLATING_DELAY_MS = 120; // wait this long before showing spinner text

  async function doTranslate() {
    const text = inputEl.value.trim();
    if (!text) { outputEl.innerHTML = PLACEHOLDER_HTML; return; }

    const { dir } = modeConfig[currentMode];
    const myId = ++pendingId; // snapshot current request id

    // Show "Translating…" only if the worker takes a moment
    const showTimer = setTimeout(() => {
      if (pendingId === myId) outputEl.innerHTML = TRANSLATING_HTML;
    }, TRANSLATING_DELAY_MS);

    const html = await requestTranslation(dir, text);

    clearTimeout(showTimer);

    // Only render if this is still the latest request
    if (pendingId === myId) outputEl.innerHTML = html || PLACEHOLDER_HTML;
  }

  // Debounce so fast typing doesn't flood the worker
  function scheduledTranslate() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(doTranslate, 80);
  }

  // ── Events ────────────────────────────────────────────
  inputEl.addEventListener('input', () => {
    enforceWordLimit();
    updateWordCounter();
    scheduledTranslate();
  });

  modeBtns.forEach(btn => btn.addEventListener('click', () => setMode(btn.dataset.mode)));

  document.getElementById('clear-btn').addEventListener('click', () => {
    inputEl.value = '';
    outputEl.innerHTML = PLACEHOLDER_HTML;
    updateWordCounter();
    inputEl.focus();
  });

  document.getElementById('copy-btn').addEventListener('click', () => {
    navigator.clipboard.writeText(outputEl.innerText.replace(/\s+/g,' ').trim()).then(() => {
      const btn = document.getElementById('copy-btn');
      btn.textContent = 'copied!';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = 'copy'; btn.classList.remove('copied'); }, 1500);
    });
  });

  document.getElementById('swap-btn').addEventListener('click', () => {
    const outText = outputEl.innerText.replace(/\s+/g,' ').trim();
    const target = swapPair[currentMode];
    setMode(target);
    if (outText && outText !== 'Translation appears here…' && outText !== 'Translating…') {
      inputEl.value = outText;
      enforceWordLimit();
      updateWordCounter();
      doTranslate();
    }
  });

  setMode('en-cat');
}); // end DOMContentLoaded
