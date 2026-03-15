// ════════════════════════════════════════════════════════════════════════
//  translator.js — Cat Translator UI
//
//  Handles all user interface logic. Translation is delegated to worker.js
//  which runs either as a Web Worker (preferred, background thread) or
//  directly as a loaded script (fallback, for file:// protocol).
//
//  The fallback ensures the translator works when opened directly from the
//  filesystem without a local server.
//
//  Flow:
//    1. Try to start a Web Worker running worker.js
//    2. If Worker fails (file:// protocol, browser restriction, etc.),
//       fall back to calling window._catEngine.doTranslate() directly
//    3. Either way the UI is identical — debounced input, live translation,
//       "Translating…" indicator for slow responses, word counter, swap, copy
// ════════════════════════════════════════════════════════════════════════

// ── Constants ────────────────────────────────────────────────────────────
const WORD_LIMIT       = 100;
const DEBOUNCE_MS      = 60;
const TRANSLATING_MS   = 120;  // show "Translating…" after this many ms
const COPY_CONFIRM_MS  = 1500;

// ── Placeholder HTML ─────────────────────────────────────────────────────
const PLACEHOLDER_HTML  = '<span class="output-placeholder">Translation appears here\u2026</span>';
const TRANSLATING_HTML  = '<span class="translating-msg">Translating\u2026</span>';
const ERROR_HTML        = '<span class="col-low">Could not translate. Reload the page.</span>';

// ════════════════════════════════════════════════════════════════════════
//  WORD COUNTER UTILITY
//  Counts real words (letter-containing tokens) in a string.
// ════════════════════════════════════════════════════════════════════════
function countWords(text) {
  if (!text || !text.trim()) return 0;
  return text.trim()
    .split(/\s+/)
    .filter(w => w.replace(/[^a-zA-Z']/g, '').length > 0)
    .length;
}

// ════════════════════════════════════════════════════════════════════════
//  WORD LIMIT ENFORCER
//  Hard-caps the textarea at WORD_LIMIT words by truncating at the
//  exact position where the limit is exceeded.
// ════════════════════════════════════════════════════════════════════════
function enforceWordLimit(inputEl) {
  const val    = inputEl.value;
  const chunks = val.trim().split(/(\s+)/);
  let   count  = 0;
  let   cutPos = val.length;
  let   charPos= 0;

  for (const chunk of chunks) {
    const isWord = chunk.replace(/[^a-zA-Z']/g, '').length > 0;
    if (isWord) {
      count++;
      if (count > WORD_LIMIT) {
        cutPos = charPos;
        break;
      }
    }
    charPos += chunk.length;
  }
  if (count > WORD_LIMIT) {
    inputEl.value = val.slice(0, cutPos).trimEnd();
  }
}

// ════════════════════════════════════════════════════════════════════════
//  MODE CONFIGURATION
//  Each mode describes the left pane language, right pane label,
//  input placeholder, translation direction, button group, and whether
//  the word limit applies.
// ════════════════════════════════════════════════════════════════════════
const MODES = {
  'en-cat': {
    leftLang:  'English',
    rightHTML: '<strong>Cat</strong>',
    placeholder: 'Type in English\u2026 (max 100 words)',
    dir:       'to-cat',
    group:     'cat',
    hasLimit:  true,
  },
  'en-stormy': {
    leftLang:  'English',
    rightHTML: '<strong>Stormy</strong><span class="stormy-label-badge">extended</span>',
    placeholder: 'Type in English\u2026 (max 100 words)',
    dir:       'to-stormy',
    group:     'stormy',
    hasLimit:  true,
  },
  'cat-en': {
    leftLang:  'Cat',
    rightHTML: '<strong>English</strong>',
    placeholder: 'Type Cat words\u2026',
    dir:       'from-cat',
    group:     'cat',
    hasLimit:  false,
  },
  'stormy-en': {
    leftLang:  'Stormy',
    rightHTML: '<strong>English</strong>',
    placeholder: 'Type Stormy words\u2026',
    dir:       'from-stormy',
    group:     'stormy',
    hasLimit:  false,
  },
};

const SWAP_MAP = {
  'en-cat':    'cat-en',
  'cat-en':    'en-cat',
  'en-stormy': 'stormy-en',
  'stormy-en': 'en-stormy',
};

// ════════════════════════════════════════════════════════════════════════
//  TRANSLATION BRIDGE
//  Abstracts over Worker vs direct-call so the rest of the UI code
//  doesn't need to know which mode is active.
// ════════════════════════════════════════════════════════════════════════
let useWorker  = false;
let workerObj  = null;
let pendingReqs= {};
let reqCounter = 0;

function initBridge(onReady) {
  // Try Web Worker first
  try {
    const w = new Worker('worker.js');
    w.onmessage = function(e) {
      const { id, html } = e.data;
      if (pendingReqs[id]) {
        pendingReqs[id](html);
        delete pendingReqs[id];
      }
    };
    w.onerror = function(err) {
      console.warn('[CatTranslator] Worker error, switching to direct mode:', err.message);
      useWorker = false;
      workerObj = null;
      onReady();
    };
    // Send a test message — if it comes back, worker is running
    const testId = ++reqCounter;
    pendingReqs[testId] = function(html) {
      // Test succeeded: worker is alive
      useWorker = true;
      workerObj = w;
      onReady();
    };
    w.postMessage({ id: testId, type: 'to-cat', text: 'hello' });
    // Timeout fallback: if worker doesn't respond in 2s, use direct mode
    setTimeout(function() {
      if (pendingReqs[testId]) {
        delete pendingReqs[testId];
        console.warn('[CatTranslator] Worker timeout, using direct mode');
        useWorker = false;
        workerObj = null;
        w.terminate();
        onReady();
      }
    }, 2000);
  } catch (e) {
    // Worker not supported (file:// protocol, etc.)
    console.warn('[CatTranslator] Worker unavailable, using direct mode:', e.message);
    useWorker = false;
    workerObj = null;
    onReady();
  }
}

function askTranslate(type, text) {
  return new Promise(function(resolve) {
    if (useWorker && workerObj) {
      const id = ++reqCounter;
      pendingReqs[id] = resolve;
      workerObj.postMessage({ id, type, text });
    } else {
      // Direct mode: call engine synchronously (or micro-async via Promise)
      setTimeout(function() {
        try {
          // window._catEngine is set by worker.js when loaded as a script
          if (window._catEngine) {
            resolve(window._catEngine.doTranslate(type, text));
          } else {
            resolve(ERROR_HTML);
          }
        } catch(err) {
          console.error('[CatTranslator] Direct translate error:', err);
          resolve(ERROR_HTML);
        }
      }, 0);
    }
  });
}

// ════════════════════════════════════════════════════════════════════════
//  UI CONTROLLER
//  All DOM interaction lives here.
// ════════════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', function() {

  // ── DOM refs ──────────────────────────────────────────────────────────
  const inputEl   = document.getElementById('input-text');
  const outputEl  = document.getElementById('output-area');
  const leftLbl   = document.getElementById('left-label');
  const rightLbl  = document.getElementById('right-label');
  const modeBtns  = document.querySelectorAll('.mode-btn');
  const counterEl = document.getElementById('word-counter');
  const clearBtn  = document.getElementById('clear-btn');
  const copyBtn   = document.getElementById('copy-btn');
  const swapBtn   = document.getElementById('swap-btn');

  // ── State ─────────────────────────────────────────────────────────────
  let currentMode = 'en-cat';
  let debounceTimer;
  let latestReqId = 0;

  // ── Word counter update ───────────────────────────────────────────────
  function updateCounter() {
    const cfg = MODES[currentMode];
    if (!cfg.hasLimit) {
      counterEl.style.display = 'none';
      return;
    }
    counterEl.style.display = 'inline';
    const n = countWords(inputEl.value);
    counterEl.textContent = n + ' / ' + WORD_LIMIT;
    counterEl.classList.toggle('over-limit', n > WORD_LIMIT);
  }

  // ── Set active mode ───────────────────────────────────────────────────
  function setMode(mode) {
    currentMode = mode;
    const cfg   = MODES[mode];
    leftLbl.innerHTML   = '<strong>' + cfg.leftLang + '</strong>';
    rightLbl.innerHTML  = cfg.rightHTML;
    inputEl.placeholder = cfg.placeholder;
    modeBtns.forEach(function(btn) {
      const active = btn.dataset.mode === mode;
      btn.classList.toggle('active', active);
      btn.classList.remove('cat-mode', 'stormy-mode');
      if (active) {
        btn.classList.add(cfg.group === 'stormy' ? 'stormy-mode' : 'cat-mode');
      }
    });
    updateCounter();
    scheduleTranslate();
  }

  // ── Core translate call ───────────────────────────────────────────────
  async function doTranslate() {
    const text = inputEl.value.trim();
    if (!text) {
      outputEl.innerHTML = PLACEHOLDER_HTML;
      return;
    }
    const myId = ++latestReqId;
    const cfg  = MODES[currentMode];
    // Show "Translating…" indicator if worker is slow
    const indicator = setTimeout(function() {
      if (latestReqId === myId) {
        outputEl.innerHTML = TRANSLATING_HTML;
      }
    }, TRANSLATING_MS);
    let html;
    try {
      html = await askTranslate(cfg.dir, text);
    } catch (err) {
      html = ERROR_HTML;
    }
    clearTimeout(indicator);
    // Only update if this is still the most recent request
    if (latestReqId === myId) {
      outputEl.innerHTML = html || PLACEHOLDER_HTML;
    }
  }

  // ── Debounced translate ───────────────────────────────────────────────
  function scheduleTranslate() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(doTranslate, DEBOUNCE_MS);
  }

  // ── Input event ───────────────────────────────────────────────────────
  inputEl.addEventListener('input', function() {
    const cfg = MODES[currentMode];
    if (cfg.hasLimit) enforceWordLimit(inputEl);
    updateCounter();
    scheduleTranslate();
  });

  // ── Mode buttons ──────────────────────────────────────────────────────
  modeBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      setMode(btn.dataset.mode);
    });
  });

  // ── Clear button ──────────────────────────────────────────────────────
  clearBtn.addEventListener('click', function() {
    inputEl.value      = '';
    outputEl.innerHTML = PLACEHOLDER_HTML;
    updateCounter();
    inputEl.focus();
  });

  // ── Copy button ───────────────────────────────────────────────────────
  copyBtn.addEventListener('click', function() {
    const text = outputEl.innerText.replace(/\s+/g, ' ').trim();
    if (!text || text === 'Translation appears here\u2026' || text === 'Translating\u2026') return;
    navigator.clipboard.writeText(text).then(function() {
      copyBtn.textContent = 'copied!';
      copyBtn.classList.add('copied');
      setTimeout(function() {
        copyBtn.textContent = 'copy';
        copyBtn.classList.remove('copied');
      }, COPY_CONFIRM_MS);
    }).catch(function() {
      // Fallback for browsers where clipboard API is unavailable
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity  = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      copyBtn.textContent = 'copied!';
      copyBtn.classList.add('copied');
      setTimeout(function() {
        copyBtn.textContent = 'copy';
        copyBtn.classList.remove('copied');
      }, COPY_CONFIRM_MS);
    });
  });

  // ── Swap button ───────────────────────────────────────────────────────
  swapBtn.addEventListener('click', function() {
    const currentOutput = outputEl.innerText.replace(/\s+/g, ' ').trim();
    const targetMode    = SWAP_MAP[currentMode];
    if (!targetMode) return;
    setMode(targetMode);
    const skip = ['Translation appears here\u2026', 'Translating\u2026', ''];
    if (currentOutput && !skip.includes(currentOutput)) {
      inputEl.value = currentOutput;
      const cfg = MODES[targetMode];
      if (cfg.hasLimit) enforceWordLimit(inputEl);
      updateCounter();
      doTranslate();
    }
  });

  // ── Keyboard shortcut: Enter in input triggers immediate translate ────
  inputEl.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      clearTimeout(debounceTimer);
      doTranslate();
    }
  });

  // ── Initialise bridge, then set initial mode ──────────────────────────
  initBridge(function() {
    setMode('en-cat');
  });

}); // end DOMContentLoaded
