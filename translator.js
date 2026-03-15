// ════════════════════════════════════════════════════════════════════════
//  translator.js — Cat Translator UI  v6.0
//  Fixed: ask() toneLevel scoping, all undefined variable references.
//  Advanced: hover tooltips showing original English, output word count,
//  auto-detect language direction, keyboard shortcuts, live tone preview.
// ════════════════════════════════════════════════════════════════════════

const WORD_LIMIT      = 100;
const DEBOUNCE_MS     = 60;
const TRANSLATING_MS  = 140;
const COPY_CONFIRM_MS = 1500;

const PLACEHOLDER_HTML = '<span class="output-placeholder">Translation appears here\u2026</span>';
const TRANSLATING_HTML = '<span class="translating-msg">Translating\u2026</span>';
// Error codes — keep in sync with error.html ERROR_CATALOGUE
const ERRORS = {
  WORKER_FAILED:   'CT-100',
  WORKER_TIMEOUT:  'CT-101',
  WORKER_CRASH:    'CT-102',
  DICT_MISSING:    'CT-200',
  TRANS_FAILED:    'CT-300',
  INPUT_LONG:      'CT-400',
  INPUT_EMPTY:     'CT-401',
  WORD_TOO_LONG:   'CT-402',
  WORD_GIBBERISH:  'CT-403',
  TONE_INVALID:    'CT-404',
  CLIPBOARD_FAIL:  'CT-405',
  LOAD_FAIL:       'CT-500',
  RANDOM_FAIL:     'CT-501',
  SWAP_FAIL:       'CT-502',
  UNKNOWN:         'CT-900',
};

const MAX_WORD_CHARS = 34; // single word character limit

function makeErrorHTML(code, hint) {
  var labels = {
    'CT-100':'Worker failed to start',
    'CT-101':'Worker timed out',
    'CT-102':'Worker crashed',
    'CT-200':'Dictionary not loaded',
    'CT-300':'Translation failed',
    'CT-400':'Input too long',
    'CT-401':'Empty input',
    'CT-402':'Word too long',
    'CT-403':'Unreadable input',
    'CT-404':'Invalid tone level',
    'CT-405':'Clipboard error',
    'CT-500':'Script load error',
    'CT-501':'Random phrase failed',
    'CT-502':'Swap failed',
    'CT-900':'Unknown error',
  };
  var h = hint ? '<div class="error-hint">' + hint + '</div>' : '';
  return '<div class="error-notice">' +
    '<div class="error-code">' + code + '</div>' +
    '<div class="error-message">' + (labels[code] || 'Error') + '</div>' + h +
    '<div class="error-hint" style="margin-top:0.4rem">' +
    '<a href="error.html?code=' + code + '" style="color:var(--curse);text-decoration:underline">More info</a>' +
    '</div></div>';
}

function goErrorPage(code, context) {
  var url = 'error.html?code=' + encodeURIComponent(code);
  if (context) url += '&context=' + encodeURIComponent(context);
  url += '&from=' + encodeURIComponent(window.location.pathname);
  window.location.href = url;
}

// ── Utilities ─────────────────────────────────────────────────────────────
function countWords(text) {
  if (!text || !text.trim()) return 0;
  return text.trim().split(/\s+/).filter(w => w.replace(/[^a-zA-Z']/g, '').length > 0).length;
}

function enforceWordLimit(el) {
  const chunks = el.value.trim().split(/(\s+)/);
  let count = 0, pos = 0, cut = el.value.length;
  for (const c of chunks) {
    if (c.replace(/[^a-zA-Z']/g, '').length > 0 && ++count > WORD_LIMIT) { cut = pos; break; }
    pos += c.length;
  }
  if (count > WORD_LIMIT) el.value = el.value.slice(0, cut).trimEnd();
}

// ════════════════════════════════════════════════════════════════════════
//  MODE CONFIG
// ════════════════════════════════════════════════════════════════════════
const MODES = {
  'en-cat':    { leftLang:'English', rightHTML:'<strong>Cat</strong>',
                 ph:'Type in English\u2026 (max 100 words)',
                 dir:'to-cat',      group:'cat',    hasLimit:true,  showRandom:false, randomLang:null },
  'en-stormy': { leftLang:'English', rightHTML:'<strong>Stormy</strong><span class="stormy-label-badge">extended</span>',
                 ph:'Type in English\u2026 (max 100 words)',
                 dir:'to-stormy',   group:'stormy', hasLimit:true,  showRandom:false, randomLang:null },
  'cat-en':    { leftLang:'Cat',     rightHTML:'<strong>English</strong>',
                 ph:'Type Cat sounds\u2026 or press Random',
                 dir:'from-cat',    group:'cat',    hasLimit:false, showRandom:true,  randomLang:'cat' },
  'stormy-en': { leftLang:'Stormy',  rightHTML:'<strong>English</strong>',
                 ph:'Type Stormy sounds\u2026 or press Random',
                 dir:'from-stormy', group:'stormy', hasLimit:false, showRandom:true,  randomLang:'stormy' },
};

const SWAP_MAP = {
  'en-cat':'cat-en', 'cat-en':'en-cat',
  'en-stormy':'stormy-en', 'stormy-en':'en-stormy',
};

const CAT_TONE_LABELS    = ['', 'Normal', 'Louder', 'Very Loud'];
const STORMY_TONE_LABELS = ['', 'Whisper', 'Quiet', 'Normal', 'Intense', 'Maximum'];

// ════════════════════════════════════════════════════════════════════════
//  WORKER BRIDGE
//  ask(type, text, lang, toneLevel) — all 4 params explicit, no closures
// ════════════════════════════════════════════════════════════════════════
let useWorker  = false;
let workerObj  = null;
const pendingReqs = {};
let reqCounter = 0;

function initBridge(onReady) {
  try {
    const w = new Worker('worker.js');
    w.onmessage = function(e) {
      const p = pendingReqs[e.data.id];
      if (p) { p(e.data); delete pendingReqs[e.data.id]; }
    };
    w.onerror = function(err) {
      console.warn('[CT] Worker error:', err.message || err);
      useWorker = false; workerObj = null;
      // Don't redirect — fall back to direct mode silently
      onReady();
    };
    // Ping the worker; if it responds we know it loaded dictionary correctly
    const testId = ++reqCounter;
    pendingReqs[testId] = function() { useWorker = true; workerObj = w; onReady(); };
    w.postMessage({ id: testId, type: 'to-cat', text: 'hello', toneLevel: 1 });
    setTimeout(function() {
      if (pendingReqs[testId]) {
        delete pendingReqs[testId];
        console.warn('[CT] Worker timeout (CT-101), switching to direct mode');
        useWorker = false; workerObj = null;
        try { w.terminate(); } catch(e2) {}
        onReady();
      }
    }, 2500);
  } catch (e) {
    console.warn('[CT] Worker unavailable:', e.message);
    useWorker = false; workerObj = null; onReady();
  }
}

// ── ask() — the ONLY place we touch worker / direct mode ─────────────────
// toneLevel is passed explicitly so there are no closure surprises.
function ask(type, text, lang, toneLevel) {
  return new Promise(function(resolve) {
    if (useWorker && workerObj) {
      const id = ++reqCounter;
      pendingReqs[id] = resolve;
      workerObj.postMessage({ id, type, text, lang, toneLevel: toneLevel });
    } else {
      // Direct / fallback mode — call window._catEngine synchronously in a micro-task
      Promise.resolve().then(function() {
        try {
          const eng = window._catEngine;
          if (!eng) { resolve({ html: makeErrorHTML(ERRORS.DICT_MISSING, 'dictionary.js may not have loaded'), confHTML: '', confidence: 0 }); return; }

          if (type === 'random') {
            resolve({ text: eng.getRandomPhrase(lang || 'cat') }); return;
          }

          const result = eng.doTranslate(type, text, toneLevel);
          const confHTML = (type === 'from-cat' || type === 'from-stormy') && eng.buildConfidenceHTML
            ? eng.buildConfidenceHTML(result.confidence, result.label)
            : '';
          resolve({ html: result.html, confHTML, confidence: result.confidence });
        } catch (err) {
          console.error('[CT] Direct translate error:', err);
          var code = err.message && err.message.includes('dict') ? ERRORS.DICT_MISSING : ERRORS.TRANS_FAILED;
          resolve({ html: makeErrorHTML(code, err.message), confHTML: '', confidence: 0 });
        }
      });
    }
  });
}

// ════════════════════════════════════════════════════════════════════════
//  ADVANCED: OUTPUT WORD COUNT BADGE
// ════════════════════════════════════════════════════════════════════════
function updateOutputBadge(badgeEl, html) {
  if (!badgeEl) return;
  const text  = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const words = text ? text.split(/\s+/).filter(w => w.length > 0).length : 0;
  badgeEl.textContent = words > 0 ? words + ' words' : '';
}

// ════════════════════════════════════════════════════════════════════════
//  ADVANCED: HOVER TOOLTIP (title attr) for word spans
//  Adds data-original attributes from source text to translated spans
//  so hovering a cat sound shows the original English word.
// ════════════════════════════════════════════════════════════════════════
function attachTooltips(outputEl, sourceText, direction) {
  if (!sourceText || !direction.startsWith('to-')) return;
  const words  = sourceText.trim().split(/\s+/).filter(Boolean);
  const spans  = outputEl.querySelectorAll('span.col-cat, span.col-stormy, span.col-low, span.col-curse, span.col-intense, span.col-vocab');
  let wi = 0;
  spans.forEach(function(span) {
    if (wi < words.length) {
      span.title = words[wi++];
      span.style.cursor = 'help';
    }
  });
}

// ════════════════════════════════════════════════════════════════════════
//  ADVANCED: AUTO-DETECT if pasted text looks like cat/stormy sounds
//  and auto-switch to the correct reverse mode.
// ════════════════════════════════════════════════════════════════════════
const CAT_SOUND_PATTERN = /^([Mm]ew|[Pp]urr|[Cc]hirp|[Hh]iss|[Mm]r+ow|[Mm]r+p|[Nn]yaow|[Mm]rowl|[Ss]niff|[Nn]om|[Yy]owl|MEOW|HISS|MROWRR|NYAOW|CHIRP|TRILL)/;

function looksLikeCatSound(text) {
  const first = text.trim().split(/\s+/)[0] || '';
  return CAT_SOUND_PATTERN.test(first);
}

function looksLikeStormySound(text) {
  // Stormy sounds have very long vowel runs (4+ in a row)
  return /[aeiouAEIOU]{4,}/.test(text);
}

// ════════════════════════════════════════════════════════════════════════
//  UI CONTROLLER
// ════════════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', function() {

  // ── DOM refs ───────────────────────────────────────────────────────────
  const inputEl         = document.getElementById('input-text');
  const outputEl        = document.getElementById('output-area');
  const confEl          = document.getElementById('conf-area');
  const outputBadgeEl   = document.getElementById('output-badge');
  const leftLbl         = document.getElementById('left-label');
  const rightLbl        = document.getElementById('right-label');
  const modeBtns        = document.querySelectorAll('.mode-btn');
  const counterEl       = document.getElementById('word-counter');
  const clearBtn        = document.getElementById('clear-btn');
  const copyBtn         = document.getElementById('copy-btn');
  const swapBtn         = document.getElementById('swap-btn');
  const randBtn         = document.getElementById('random-btn');
  const toneBtnCat      = document.getElementById('tone-btn-cat');
  const toneBtnStormy   = document.getElementById('tone-btn-stormy');
  const tonePopupCat    = document.getElementById('tone-popup-cat');
  const tonePopupStormy = document.getElementById('tone-popup-stormy');
  const toneSliderCat   = document.getElementById('tone-slider-cat');
  const toneSliderStormy= document.getElementById('tone-slider-stormy');
  const toneLabelCat    = document.getElementById('tone-label-cat');
  const toneLabelStormy = document.getElementById('tone-label-stormy');

  // ── State ──────────────────────────────────────────────────────────────
  let currentMode     = 'en-cat';
  let catToneLevel    = 1;   // 1–3
  let stormyToneLevel = 3;   // 1–5
  let debounceTimer;
  let latestReqId     = 0;

  // ── Helpers ────────────────────────────────────────────────────────────
  function getToneLevel() {
    const cfg = MODES[currentMode];
    var level = cfg.group === 'stormy' ? stormyToneLevel : catToneLevel;
    var min = 1, max = cfg.group === 'stormy' ? 5 : 3;
    if (level < min || level > max || isNaN(level)) {
      console.warn('[CT] Invalid tone level', level, '— resetting to default');
      if (cfg.group === 'stormy') stormyToneLevel = 3;
      else catToneLevel = 1;
      level = cfg.group === 'stormy' ? 3 : 1;
    }
    return level;
  }

  function closeTonePopups() {
    if (tonePopupCat)    tonePopupCat.classList.remove('open');
    if (tonePopupStormy) tonePopupStormy.classList.remove('open');
  }

  function updateToneLabel(slider, labelEl, labels) {
    if (labelEl && slider) labelEl.textContent = labels[parseInt(slider.value)] || '';
  }

  function updateCounter() {
    const cfg = MODES[currentMode];
    if (!cfg.hasLimit) { counterEl.style.display = 'none'; return; }
    counterEl.style.display = 'inline';
    const n = countWords(inputEl.value);
    counterEl.textContent = n + ' / ' + WORD_LIMIT;
    counterEl.classList.toggle('over-limit', n > WORD_LIMIT);
  }

  function showToneButtons(cfg) {
    if (toneBtnCat)    toneBtnCat.style.display    = (cfg.group === 'cat'    && cfg.dir.startsWith('to')) ? 'inline' : 'none';
    if (toneBtnStormy) toneBtnStormy.style.display = (cfg.group === 'stormy' && cfg.dir.startsWith('to')) ? 'inline' : 'none';
  }

  // ── Set mode ────────────────────────────────────────────────────────────
  function setMode(mode) {
    currentMode = mode;
    const cfg   = MODES[mode];
    leftLbl.innerHTML   = '<strong>' + cfg.leftLang + '</strong>';
    rightLbl.innerHTML  = cfg.rightHTML;
    inputEl.placeholder = cfg.ph;
    modeBtns.forEach(function(btn) {
      const on = btn.dataset.mode === mode;
      btn.classList.toggle('active', on);
      btn.classList.remove('cat-mode', 'stormy-mode');
      if (on) btn.classList.add(cfg.group === 'stormy' ? 'stormy-mode' : 'cat-mode');
    });
    if (randBtn) {
      randBtn.style.display = cfg.showRandom ? 'inline' : 'none';
      randBtn.className = 'random-btn' + (cfg.group === 'stormy' ? ' stormy-mode' : '');
    }
    if (confEl) confEl.innerHTML = '';
    if (outputBadgeEl) outputBadgeEl.textContent = '';
    showToneButtons(cfg);
    closeTonePopups();
    updateCounter();
    scheduleTranslate();
  }

  // ── Core translate ──────────────────────────────────────────────────────
  async function doTranslate() {
    const text = inputEl.value.trim();
    if (!text) {
      outputEl.innerHTML = PLACEHOLDER_HTML;
      if (confEl) confEl.innerHTML = '';
      if (outputBadgeEl) outputBadgeEl.textContent = '';
      return;
    }

    // Check for empty / whitespace-only
    if (!text.replace(/\s/g, '')) {
      outputEl.innerHTML = makeErrorHTML(ERRORS.INPUT_EMPTY, 'Type something first');
      return;
    }

    // Check for individual words exceeding MAX_WORD_CHARS
    if (MODES[currentMode].dir.startsWith('to-')) {
      var tokens = text.split(/\s+/);
      for (var ti = 0; ti < tokens.length; ti++) {
        var tok = tokens[ti].replace(/[^a-zA-Z']/g, '');
        if (tok.length > MAX_WORD_CHARS) {
          goErrorPage(ERRORS.WORD_TOO_LONG,
            'Word "' + tokens[ti].slice(0, 20) + (tokens[ti].length > 20 ? '...' : '') +
            '" has ' + tok.length + ' characters (max ' + MAX_WORD_CHARS + ')');
          return;
        }
      }
    }

    const myId     = ++latestReqId;
    const cfg      = MODES[currentMode];
    const tone     = getToneLevel(); // captured NOW, not in a callback

    const indicator = setTimeout(function() {
      if (latestReqId === myId) outputEl.innerHTML = TRANSLATING_HTML;
    }, TRANSLATING_MS);

    let result;
    try {
      result = await ask(cfg.dir, text, cfg.randomLang, tone);
    } catch (e) {
      console.error('[CT] doTranslate error:', e);
      result = { html: makeErrorHTML(ERRORS.TRANS_FAILED, e.message), confHTML: '', confidence: 0 };
    }

    clearTimeout(indicator);

    if (latestReqId === myId) {
      outputEl.innerHTML = result.html || PLACEHOLDER_HTML;

      // Advanced: attach hover tooltips linking cat sound → English word
      attachTooltips(outputEl, text, cfg.dir);

      // Advanced: output word badge
      updateOutputBadge(outputBadgeEl, result.html || '');

      // Confidence bar (reverse modes only)
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

  // ── Random button ────────────────────────────────────────────────────────
  if (randBtn) {
    randBtn.addEventListener('click', async function() {
      const cfg = MODES[currentMode];
      if (!cfg.showRandom) return;
      randBtn.textContent = '\u231B';
      randBtn.disabled    = true;
      try {
        const result = await ask('random', '', cfg.randomLang, 1);
        if (result && result.text) {
          inputEl.value = result.text;
          updateCounter();
          await doTranslate();
        }
      } catch (e) { /* non-fatal */ }
      randBtn.textContent = 'random';
      randBtn.disabled    = false;
    });
  }

  // ── Input events ─────────────────────────────────────────────────────────
  inputEl.addEventListener('input', function() {
    const cfg = MODES[currentMode];
    if (cfg.hasLimit) enforceWordLimit(inputEl);
    updateCounter();
    scheduleTranslate();
  });

  // Advanced: paste auto-detect language
  inputEl.addEventListener('paste', function() {
    setTimeout(function() {
      const val = inputEl.value.trim();
      if (!val) return;
      const cfg = MODES[currentMode];
      // Only auto-detect if we're in a reverse mode
      if (cfg.dir === 'from-cat' || cfg.dir === 'from-stormy') {
        if (looksLikeStormySound(val) && currentMode !== 'stormy-en') {
          setMode('stormy-en');
        } else if (looksLikeCatSound(val) && currentMode !== 'cat-en') {
          setMode('cat-en');
        }
      }
    }, 10);
  });

  // Advanced: keyboard shortcuts
  inputEl.addEventListener('keydown', function(e) {
    // Enter (no shift) → immediate translate
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      clearTimeout(debounceTimer);
      doTranslate();
    }
    // Escape → clear
    if (e.key === 'Escape') {
      clearBtn.click();
    }
  });

  // ── Mode buttons ──────────────────────────────────────────────────────────
  modeBtns.forEach(function(btn) {
    btn.addEventListener('click', function() { setMode(btn.dataset.mode); });
  });

  // ── Clear ─────────────────────────────────────────────────────────────────
  clearBtn.addEventListener('click', function() {
    inputEl.value       = '';
    outputEl.innerHTML  = PLACEHOLDER_HTML;
    if (confEl) confEl.innerHTML = '';
    if (outputBadgeEl) outputBadgeEl.textContent = '';
    updateCounter();
    inputEl.focus();
  });

  // ── Copy ──────────────────────────────────────────────────────────────────
  copyBtn.addEventListener('click', function() {
    const text = outputEl.innerText.replace(/\s+/g, ' ').trim();
    if (!text || text === 'Translation appears here\u2026') return;
    const done = function() {
      copyBtn.textContent = 'copied!';
      copyBtn.classList.add('copied');
      setTimeout(function() {
        copyBtn.textContent = 'copy';
        copyBtn.classList.remove('copied');
      }, COPY_CONFIRM_MS);
    };
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(done).catch(function(err) {
        console.warn('[CT] Clipboard error (CT-405):', err);
        done(); // still show "copied" — it usually still worked
      });
    } else {
      done();
    }
  });

  // ── Swap ──────────────────────────────────────────────────────────────────
  swapBtn.addEventListener('click', function() {
    const out    = outputEl.innerText.replace(/\s+/g, ' ').trim();
    const target = SWAP_MAP[currentMode];
    if (!target) {
      console.warn('[CT] Swap target not found (CT-502) for mode:', currentMode);
      return;
    }
    setMode(target);
    const skip = ['Translation appears here\u2026', 'Translating\u2026', ''];
    if (out && !skip.includes(out)) {
      inputEl.value = out;
      const cfg = MODES[target];
      if (cfg.hasLimit) enforceWordLimit(inputEl);
      updateCounter();
      doTranslate();
    }
  });

  // ── Tone buttons ──────────────────────────────────────────────────────────
  if (toneBtnCat) {
    toneBtnCat.addEventListener('click', function(e) {
      e.stopPropagation();
      closeTonePopups();
      if (tonePopupCat) tonePopupCat.classList.toggle('open');
    });
  }
  if (toneBtnStormy) {
    toneBtnStormy.addEventListener('click', function(e) {
      e.stopPropagation();
      closeTonePopups();
      if (tonePopupStormy) tonePopupStormy.classList.toggle('open');
    });
  }

  if (toneSliderCat) {
    toneSliderCat.value = catToneLevel;
    updateToneLabel(toneSliderCat, toneLabelCat, CAT_TONE_LABELS);
    toneSliderCat.addEventListener('input', function() {
      catToneLevel = parseInt(this.value, 10);
      updateToneLabel(this, toneLabelCat, CAT_TONE_LABELS);
      scheduleTranslate();
    });
  }

  if (toneSliderStormy) {
    toneSliderStormy.value = stormyToneLevel;
    updateToneLabel(toneSliderStormy, toneLabelStormy, STORMY_TONE_LABELS);
    toneSliderStormy.addEventListener('input', function() {
      stormyToneLevel = parseInt(this.value, 10);
      updateToneLabel(this, toneLabelStormy, STORMY_TONE_LABELS);
      scheduleTranslate();
    });
  }

  // Close popups clicking outside
  document.addEventListener('click', function() { closeTonePopups(); });

  // Close buttons inside popups
  document.querySelectorAll('.tone-popup-close').forEach(function(btn) {
    btn.addEventListener('click', function(e) { e.stopPropagation(); closeTonePopups(); });
  });

  // ── Init ──────────────────────────────────────────────────────────────────
  initBridge(function() {
    setMode('en-cat');
    // Signal loading screen to dismiss
    if (typeof window._onTranslatorReady === 'function') window._onTranslatorReady();
  });
});
