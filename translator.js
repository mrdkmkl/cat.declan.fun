// ════════════════════════════════════════════════════════════════════════
//  translator.js — Cat Translator UI  v5.0
//  Connects UI to the worker engine.
//  New in v5: random phrase button, confidence bar, word segmenter support.
// ════════════════════════════════════════════════════════════════════════

const WORD_LIMIT      = 100;
const DEBOUNCE_MS     = 60;
const TRANSLATING_MS  = 120;
const COPY_CONFIRM_MS = 1500;

const PLACEHOLDER_HTML = '<span class="output-placeholder">Translation appears here\u2026</span>';
const TRANSLATING_HTML = '<span class="translating-msg">Translating\u2026</span>';
const ERROR_HTML       = '<span class="col-low">Error \u2014 reload the page.</span>';

// ── Word count ────────────────────────────────────────────────────────────
function countWords(text) {
  if (!text || !text.trim()) return 0;
  return text.trim().split(/\s+/).filter(w => w.replace(/[^a-zA-Z']/g,'').length > 0).length;
}

// ── Enforce word limit ────────────────────────────────────────────────────
function enforceWordLimit(el) {
  const chunks = el.value.trim().split(/(\s+)/);
  let count = 0, pos = 0, cut = el.value.length;
  for (const c of chunks) {
    if (c.replace(/[^a-zA-Z']/g,'').length > 0) {
      if (++count > WORD_LIMIT) { cut = pos; break; }
    }
    pos += c.length;
  }
  if (count > WORD_LIMIT) el.value = el.value.slice(0, cut).trimEnd();
}

// ════════════════════════════════════════════════════════════════════════
//  MODE CONFIG
// ════════════════════════════════════════════════════════════════════════
const MODES = {
  'en-cat': {
    leftLang: 'English',
    rightHTML: '<strong>Cat</strong>',
    ph: 'Type in English\u2026 (max 100 words)',
    dir: 'to-cat', group: 'cat', hasLimit: true, showRandom: false, randomLang: null,
  },
  'en-stormy': {
    leftLang: 'English',
    rightHTML: '<strong>Stormy</strong><span class="stormy-label-badge">extended</span>',
    ph: 'Type in English\u2026 (max 100 words)',
    dir: 'to-stormy', group: 'stormy', hasLimit: true, showRandom: false, randomLang: null,
  },
  'cat-en': {
    leftLang: 'Cat',
    rightHTML: '<strong>English</strong>',
    ph: 'Type Cat words\u2026 or press Random',
    dir: 'from-cat', group: 'cat', hasLimit: false, showRandom: true, randomLang: 'cat',
  },
  'stormy-en': {
    leftLang: 'Stormy',
    rightHTML: '<strong>English</strong>',
    ph: 'Type Stormy words\u2026 or press Random',
    dir: 'from-stormy', group: 'stormy', hasLimit: false, showRandom: true, randomLang: 'stormy',
  },
};
const SWAP_MAP = {
  'en-cat':'cat-en','cat-en':'en-cat','en-stormy':'stormy-en','stormy-en':'en-stormy',
};

// ════════════════════════════════════════════════════════════════════════
//  WORKER BRIDGE
// ════════════════════════════════════════════════════════════════════════
let useWorker = false, workerObj = null;
const pendingReqs = {};
let reqCounter = 0;

function initBridge(onReady) {
  try {
    const w = new Worker('worker.js');
    w.onmessage = function(e) {
      const { id, html, confHTML, confidence, text } = e.data;
      if (pendingReqs[id]) { pendingReqs[id]({ html, confHTML, confidence, text }); delete pendingReqs[id]; }
    };
    w.onerror = function() {
      useWorker = false; workerObj = null; onReady();
    };
    const testId = ++reqCounter;
    pendingReqs[testId] = function() { useWorker = true; workerObj = w; onReady(); };
    w.postMessage({ id: testId, type: 'to-cat', text: 'hello' });
    setTimeout(function() {
      if (pendingReqs[testId]) {
        delete pendingReqs[testId]; useWorker = false; workerObj = null;
        try { w.terminate(); } catch(e) {}
        onReady();
      }
    }, 2000);
  } catch(e) { useWorker = false; workerObj = null; onReady(); }
}

function ask(type, text, lang) {
  return new Promise(function(resolve) {
    if (useWorker && workerObj) {
      const id = ++reqCounter;
      pendingReqs[id] = resolve;
      workerObj.postMessage({ id, type, text, lang, toneLevel: extra || undefined });
    } else {
      setTimeout(function() {
        try {
          const eng = window._catEngine;
          if (!eng) { resolve({ html: ERROR_HTML, confHTML: '', confidence: 0 }); return; }
          if (type === 'random') {
            resolve({ text: eng.getRandomPhrase(lang || 'cat') }); return;
          }
          const tl = toneLevel || undefined;
          const result = eng.doTranslate
            ? eng.doTranslate(type, text, tl)
            : { html: '', confidence: 1.0, label: 'confident' };
          const confHTML = (type === 'from-cat' || type === 'from-stormy') && eng.buildConfidenceHTML
            ? eng.buildConfidenceHTML(result.confidence, result.label)
            : '';
          resolve({ html: result.html, confHTML, confidence: result.confidence });
        } catch(err) {
          resolve({ html: ERROR_HTML, confHTML: '', confidence: 0 });
        }
      }, 0);
    }
  });
}

// ════════════════════════════════════════════════════════════════════════
//  UI CONTROLLER
// ════════════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', function() {

  const inputEl   = document.getElementById('input-text');
  const outputEl  = document.getElementById('output-area');
  const confEl    = document.getElementById('conf-area');
  const leftLbl   = document.getElementById('left-label');
  const rightLbl  = document.getElementById('right-label');
  const modeBtns  = document.querySelectorAll('.mode-btn');
  const counterEl = document.getElementById('word-counter');
  const clearBtn  = document.getElementById('clear-btn');
  const toneBtnCat    = document.getElementById('tone-btn-cat');
  const toneBtnStormy = document.getElementById('tone-btn-stormy');
  const tonePopupCat    = document.getElementById('tone-popup-cat');
  const tonePopupStormy = document.getElementById('tone-popup-stormy');
  const toneSliderCat    = document.getElementById('tone-slider-cat');
  const toneSliderStormy = document.getElementById('tone-slider-stormy');
  const toneLabelCat     = document.getElementById('tone-label-cat');
  const toneLabelStormy  = document.getElementById('tone-label-stormy');

  const CAT_TONE_LABELS    = ['','Normal','Louder','Very Loud'];
  const STORMY_TONE_LABELS = ['','Whisper','Quiet','Normal','Intense','Maximum'];
  const copyBtn   = document.getElementById('copy-btn');
  const swapBtn   = document.getElementById('swap-btn');
  const randBtn   = document.getElementById('random-btn');

  let currentMode = 'en-cat';
  let debounceTimer, latestReqId = 0;
  let catToneLevel    = 1; // 1-3, default 1 (normal)
  let stormyToneLevel = 3; // 1-5, default 3 (normal)

  // ── Counter ────────────────────────────────────────────────────────────
  function updateCounter() {
    const cfg = MODES[currentMode];
    if (!cfg.hasLimit) { counterEl.style.display = 'none'; return; }
    counterEl.style.display = 'inline';
    const n = countWords(inputEl.value);
    counterEl.textContent = n + ' / ' + WORD_LIMIT;
    counterEl.classList.toggle('over-limit', n > WORD_LIMIT);
  }

  // ── Set mode ────────────────────────────────────────────────────────────
  function setMode(mode) {
    currentMode = mode;
    const cfg = MODES[mode];
    leftLbl.innerHTML   = '<strong>' + cfg.leftLang + '</strong>';
    rightLbl.innerHTML  = cfg.rightHTML;
    inputEl.placeholder = cfg.ph;
    modeBtns.forEach(function(btn) {
      const on = btn.dataset.mode === mode;
      btn.classList.toggle('active', on);
      btn.classList.remove('cat-mode','stormy-mode');
      if (on) btn.classList.add(cfg.group === 'stormy' ? 'stormy-mode' : 'cat-mode');
    });
    // Show/hide random button
    if (randBtn) {
      randBtn.style.display = cfg.showRandom ? 'inline' : 'none';
      randBtn.className = 'random-btn' + (cfg.group === 'stormy' ? ' stormy-mode' : '');
    }
    // Hide confidence bar when switching to forward mode
    if (confEl) confEl.innerHTML = '';
    updateCounter();
    // Show correct tone button
    if (toneBtnCat)    toneBtnCat.style.display    = (cfg.group === 'cat'    && cfg.dir.startsWith('to')) ? 'inline' : 'none';
    if (toneBtnStormy) toneBtnStormy.style.display = (cfg.group === 'stormy' && cfg.dir.startsWith('to')) ? 'inline' : 'none';
    // Close any open popups
    if (tonePopupCat)    tonePopupCat.classList.remove('open');
    if (tonePopupStormy) tonePopupStormy.classList.remove('open');
    scheduleTranslate();
  }

  // ── Main translate ─────────────────────────────────────────────────────
  async function doTranslate() {
    const text = inputEl.value.trim();
    if (!text) { outputEl.innerHTML = PLACEHOLDER_HTML; if (confEl) confEl.innerHTML = ''; return; }
    const myId = ++latestReqId;
    const cfg  = MODES[currentMode];
    const indicator = setTimeout(function() {
      if (latestReqId === myId) outputEl.innerHTML = TRANSLATING_HTML;
    }, TRANSLATING_MS);
    let result;
    try { result = await ask(cfg.dir, text); }
    catch(e) { result = { html: ERROR_HTML, confHTML: '', confidence: 0 }; }
    clearTimeout(indicator);
    if (latestReqId === myId) {
      outputEl.innerHTML = result.html || PLACEHOLDER_HTML;
      // Show confidence bar only for reverse modes
      if (confEl) {
        confEl.innerHTML = (cfg.dir === 'from-cat' || cfg.dir === 'from-stormy')
          ? (result.confHTML || '') : '';
      }
    }
  }

  function scheduleTranslate() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(doTranslate, DEBOUNCE_MS);
  }

  // ── Random button ──────────────────────────────────────────────────────
  if (randBtn) {
    randBtn.addEventListener('click', async function() {
      const cfg  = MODES[currentMode];
      if (!cfg.showRandom) return;
      randBtn.textContent = '\u231B'; // hourglass
      randBtn.disabled = true;
      try {
        const result = await ask('random', '', cfg.randomLang);
        if (result && result.text) {
          inputEl.value = result.text;
          updateCounter();
          await doTranslate();
        }
      } catch(e) { /* ignore */ }
      randBtn.textContent = 'random';
      randBtn.disabled = false;
    });
  }

  // ── Events ─────────────────────────────────────────────────────────────
  inputEl.addEventListener('input', function() {
    const cfg = MODES[currentMode];
    if (cfg.hasLimit) enforceWordLimit(inputEl);
    updateCounter();
    // Show correct tone button
    if (toneBtnCat)    toneBtnCat.style.display    = (cfg.group === 'cat'    && cfg.dir.startsWith('to')) ? 'inline' : 'none';
    if (toneBtnStormy) toneBtnStormy.style.display = (cfg.group === 'stormy' && cfg.dir.startsWith('to')) ? 'inline' : 'none';
    // Close any open popups
    if (tonePopupCat)    tonePopupCat.classList.remove('open');
    if (tonePopupStormy) tonePopupStormy.classList.remove('open');
    scheduleTranslate();
  });

  inputEl.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) { clearTimeout(debounceTimer); doTranslate(); }
  });

  modeBtns.forEach(function(btn) {
    btn.addEventListener('click', function() { setMode(btn.dataset.mode); });
  });

  clearBtn.addEventListener('click', function() {
    inputEl.value = ''; outputEl.innerHTML = PLACEHOLDER_HTML;
    if (confEl) confEl.innerHTML = '';
    updateCounter(); inputEl.focus();
  });

  copyBtn.addEventListener('click', function() {
    const text = outputEl.innerText.replace(/\s+/g,' ').trim();
    if (!text || text === 'Translation appears here\u2026') return;
    const doCopy = function() {
      copyBtn.textContent = 'copied!'; copyBtn.classList.add('copied');
      setTimeout(function() { copyBtn.textContent = 'copy'; copyBtn.classList.remove('copied'); }, COPY_CONFIRM_MS);
    };
    navigator.clipboard ? navigator.clipboard.writeText(text).then(doCopy).catch(doCopy) : doCopy();
  });

  swapBtn.addEventListener('click', function() {
    const out    = outputEl.innerText.replace(/\s+/g,' ').trim();
    const target = SWAP_MAP[currentMode];
    if (!target) return;
    setMode(target);
    const skip = ['Translation appears here\u2026','Translating\u2026',''];
    if (out && !skip.includes(out)) {
      inputEl.value = out;
      const cfg = MODES[target];
      if (cfg.hasLimit) enforceWordLimit(inputEl);
      updateCounter(); doTranslate();
    }
  });

  // Tone button events
  function updateToneLabel(slider, labelEl, labels) {
    if (labelEl) labelEl.textContent = labels[parseInt(slider.value)] || '';
  }
  if (toneBtnCat) {
    toneBtnCat.addEventListener('click', function(e) {
      e.stopPropagation();
      if (tonePopupCat) tonePopupCat.classList.toggle('open');
      if (tonePopupStormy) tonePopupStormy.classList.remove('open');
    });
  }
  if (toneBtnStormy) {
    toneBtnStormy.addEventListener('click', function(e) {
      e.stopPropagation();
      if (tonePopupStormy) tonePopupStormy.classList.toggle('open');
      if (tonePopupCat) tonePopupCat.classList.remove('open');
    });
  }
  if (toneSliderCat) {
    toneSliderCat.addEventListener('input', function() {
      catToneLevel = parseInt(this.value);
      updateToneLabel(this, toneLabelCat, CAT_TONE_LABELS);
      scheduleTranslate();
    });
    updateToneLabel(toneSliderCat, toneLabelCat, CAT_TONE_LABELS);
  }
  if (toneSliderStormy) {
    toneSliderStormy.addEventListener('input', function() {
      stormyToneLevel = parseInt(this.value);
      updateToneLabel(this, toneLabelStormy, STORMY_TONE_LABELS);
      scheduleTranslate();
    });
    updateToneLabel(toneSliderStormy, toneLabelStormy, STORMY_TONE_LABELS);
  }
  // Close popups when clicking outside
  document.addEventListener('click', function() {
    if (tonePopupCat)    tonePopupCat.classList.remove('open');
    if (tonePopupStormy) tonePopupStormy.classList.remove('open');
  });
  // Close buttons inside popups
  document.querySelectorAll('.tone-popup-close').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (tonePopupCat)    tonePopupCat.classList.remove('open');
      if (tonePopupStormy) tonePopupStormy.classList.remove('open');
    });
  });

  initBridge(function() { setMode('en-cat'); });
});
