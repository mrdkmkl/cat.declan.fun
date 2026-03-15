// ════════════════════════════════════════════════════════════════════════
//  translator.js  —  Cat Translator UI  v7.0
//  Streaming study animation for Cat/Stormy → English decryption.
// ════════════════════════════════════════════════════════════════════════

const WORD_LIMIT      = 100;
const DEBOUNCE_MS     = 80;
const TRANSLATING_MS  = 160;
const COPY_CONFIRM_MS = 1500;

const PLACEHOLDER_HTML = '<span class="output-placeholder">Translation appears here\u2026</span>';
const TRANSLATING_HTML = '<span class="translating-msg">Translating\u2026</span>';

// ── Error catalogue (keep in sync with error.html) ─────────────────────
const ERRORS = {
  WORKER_FAILED:  'CT-100',
  WORKER_TIMEOUT: 'CT-101',
  DICT_MISSING:   'CT-200',
  TRANS_FAILED:   'CT-300',
  DECRYPT_FAIL:   'CT-303',
  INPUT_LONG:     'CT-400',
  INPUT_EMPTY:    'CT-401',
  WORD_TOO_LONG:  'CT-402',
  LOAD_FAIL:      'CT-500',
  RANDOM_FAIL:    'CT-501',
  UNKNOWN:        'CT-900',
};

const MAX_WORD_CHARS = 34;

function makeErrorHTML(code, hint) {
  const labels = {
    'CT-100':'Worker failed to start', 'CT-101':'Worker timed out',
    'CT-200':'Dictionary not loaded',  'CT-300':'Translation failed',
    'CT-303':'Cannot decrypt message', 'CT-400':'Input too long',
    'CT-401':'Empty input',            'CT-402':'Word too long',
    'CT-500':'Script load error',      'CT-501':'Random phrase failed',
    'CT-900':'Unknown error',
  };
  const h = hint ? `<div class="error-hint">${hint}</div>` : '';
  return `<div class="error-notice">` +
    `<div class="error-code">${code}</div>` +
    `<div class="error-message">${labels[code] || 'Error'}</div>${h}` +
    `<div class="error-hint" style="margin-top:0.4rem">` +
    `<a href="error.html?code=${code}" style="color:var(--curse);text-decoration:underline">More info</a>` +
    `</div></div>`;
}

function goErrorPage(code, context) {
  let url = `error.html?code=${encodeURIComponent(code)}`;
  if (context) url += `&context=${encodeURIComponent(context)}`;
  url += `&from=${encodeURIComponent(window.location.pathname)}`;
  window.location.href = url;
}

// ── Word utilities ─────────────────────────────────────────────────────
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
  'en-cat': {
    leftLang:'English', rightHTML:'<strong>Cat</strong>',
    ph:'Type in English\u2026 (max 100 words)',
    dir:'to-cat', group:'cat', hasLimit:true, isReverse:false, showRandom:false, randomLang:null,
  },
  'en-stormy': {
    leftLang:'English',
    rightHTML:'<strong>Stormy</strong><span class="stormy-label-badge">extended</span>',
    ph:'Type in English\u2026 (max 100 words)',
    dir:'to-stormy', group:'stormy', hasLimit:true, isReverse:false, showRandom:false, randomLang:null,
  },
  'cat-en': {
    leftLang:'Cat', rightHTML:'<strong>English</strong>',
    ph:'Type Cat sounds\u2026 or press Random',
    dir:'from-cat', group:'cat', hasLimit:false, isReverse:true, showRandom:true, randomLang:'cat',
  },
  'stormy-en': {
    leftLang:'Stormy', rightHTML:'<strong>English</strong>',
    ph:'Type Stormy sounds\u2026 or press Random',
    dir:'from-stormy', group:'stormy', hasLimit:false, isReverse:true, showRandom:true, randomLang:'stormy',
  },
};

const SWAP_MAP = {
  'en-cat':'cat-en', 'cat-en':'en-cat',
  'en-stormy':'stormy-en', 'stormy-en':'en-stormy',
};

const CAT_TONE_LABELS    = ['','Normal','Louder','Very Loud'];
const STORMY_TONE_LABELS = ['','Whisper','Quiet','Normal','Intense','Maximum'];

// ════════════════════════════════════════════════════════════════════════
//  WORKER BRIDGE
// ════════════════════════════════════════════════════════════════════════
let useWorker  = false;
let workerObj  = null;
const pendingReqs  = {};   // id → resolve  (for one-shot requests)
const streamReqs   = {};   // id → handlers (for streaming study)
let reqCounter = 0;

function initBridge(onReady) {
  try {
    const w = new Worker('worker.js');

    w.onmessage = function(e) {
      const d = e.data;
      // Streaming study events
      if (d.type && d.type.startsWith('study-')) {
        const h = streamReqs[d.id];
        if (h) {
          h(d);
          if (d.type === 'study-done') delete streamReqs[d.id];
        }
        return;
      }
      // Normal one-shot responses
      const p = pendingReqs[d.id];
      if (p) { p(d); delete pendingReqs[d.id]; }
    };

    w.onerror = function(err) {
      console.warn('[CT] Worker error (CT-100):', err.message || err);
      useWorker = false; workerObj = null; onReady();
    };

    const testId = ++reqCounter;
    pendingReqs[testId] = function() { useWorker = true; workerObj = w; onReady(); };
    w.postMessage({ id: testId, type: 'to-cat', text: 'hello', toneLevel: 1 });

    setTimeout(function() {
      if (pendingReqs[testId]) {
        delete pendingReqs[testId];
        console.warn('[CT] Worker timeout (CT-101)');
        useWorker = false; workerObj = null;
        try { w.terminate(); } catch(e) {}
        onReady();
      }
    }, 2500);

  } catch(e) {
    console.warn('[CT] Worker unavailable:', e.message);
    useWorker = false; workerObj = null; onReady();
  }
}

// One-shot ask (forward translation, random, instant reverse)
function ask(type, text, lang, toneLevel) {
  return new Promise(function(resolve) {
    if (useWorker && workerObj) {
      const id = ++reqCounter;
      pendingReqs[id] = resolve;
      workerObj.postMessage({ id, type, text, lang, toneLevel });
    } else {
      Promise.resolve().then(function() {
        try {
          const eng = window._catEngine;
          if (!eng) { resolve({ html: makeErrorHTML(ERRORS.DICT_MISSING), confHTML:'', confidence:0 }); return; }
          if (type === 'random') { resolve({ text: eng.getRandomPhrase(lang||'cat') }); return; }
          const result = eng.doTranslate(type, text, toneLevel);
          const confHTML = (type==='from-cat'||type==='from-stormy') && eng.buildConfidenceHTML
            ? eng.buildConfidenceHTML(result.confidence, result.label) : '';
          resolve({ html:result.html, confHTML, confidence:result.confidence });
        } catch(err) {
          resolve({ html: makeErrorHTML(ERRORS.TRANS_FAILED, err.message), confHTML:'', confidence:0 });
        }
      });
    }
  });
}

// Streaming study request — calls onEvent for each step, returns promise for final done
function askStudy(text, isStormy, onEvent) {
  return new Promise(function(resolve) {
    if (useWorker && workerObj) {
      const id = ++reqCounter;
      streamReqs[id] = function(d) {
        if (d.type === 'study-done') resolve(d);
        else onEvent(d);
      };
      workerObj.postMessage({
        id, type: 'study', text, lang: isStormy ? 'stormy' : 'cat'
      });
    } else {
      // Direct fallback — no animation, just instant translate
      Promise.resolve().then(function() {
        try {
          const eng = window._catEngine;
          if (!eng) { resolve({ html: makeErrorHTML(ERRORS.DICT_MISSING), confHTML:'', confidence:0, canDecrypt:false }); return; }
          const t = isStormy ? 'from-stormy' : 'from-cat';
          const result = eng.doTranslate(t, text, 1);
          const confHTML = eng.buildConfidenceHTML ? eng.buildConfidenceHTML(result.confidence, result.label) : '';
          resolve({ html:result.html, confHTML, confidence:result.confidence, canDecrypt: result.confidence > 0.1 });
        } catch(err) {
          resolve({ html: makeErrorHTML(ERRORS.TRANS_FAILED, err.message), confHTML:'', confidence:0, canDecrypt:false });
        }
      });
    }
  });
}

// ════════════════════════════════════════════════════════════════════════
//  STUDY ANIMATION  —  the "decrypting" loading screen inside the output
// ════════════════════════════════════════════════════════════════════════
function buildStudyScreen(tokenCount) {
  return `<div class="study-screen" id="study-screen">
    <div class="study-title">
      <span class="study-icon">🔍</span>
      <span class="study-label">Decrypting</span>
      <span class="study-dots"><span></span><span></span><span></span></span>
    </div>
    <div class="study-tokens" id="study-tokens"></div>
    <div class="study-progress-wrap">
      <div class="study-progress-bar" id="study-progress-bar"></div>
    </div>
    <div class="study-status" id="study-status">Reading phoneme signals\u2026</div>
  </div>`;
}

const STUDY_STATUSES = [
  'Reading phoneme signals\u2026',
  'Analysing vowel density\u2026',
  'Measuring consonant runs\u2026',
  'Checking phoneme class\u2026',
  'Scoring dictionary candidates\u2026',
  'Verifying signal vector\u2026',
  'Consulting the cat\u2026',
  'Cross-referencing cat dialect\u2026',
  'Applying cap weight analysis\u2026',
  'Decryption in progress\u2026',
];

function runStudyAnimation(outputEl, text, isStormy) {
  return new Promise(function(resolve) {
    let tokenCount = 0;
    let doneTokens = 0;
    let statusIdx   = 0;
    let statusTimer = null;
    const fragBufs  = {};  // tokenIdx → accumulated frag string

    function cycleStatus() {
      const statusEl = document.getElementById('study-status');
      if (statusEl) {
        statusEl.textContent = STUDY_STATUSES[statusIdx % STUDY_STATUSES.length];
        statusIdx++;
      }
      statusTimer = setTimeout(cycleStatus, 480);
    }

    function onEvent(d) {
      if (d.type === 'study-start') {
        tokenCount = d.tokenCount;
        outputEl.innerHTML = buildStudyScreen(tokenCount);
        statusTimer = setTimeout(cycleStatus, 480);

      } else if (d.type === 'study-token') {
        // Add a token slot to the display
        const container = document.getElementById('study-tokens');
        if (container) {
          const slot = document.createElement('div');
          slot.className = 'study-token-slot';
          slot.id = `study-tok-${d.tokenIdx}`;
          const orig = document.createElement('span');
          orig.className = 'study-token-orig';
          orig.textContent = d.token;
          const arrow = document.createElement('span');
          arrow.className = 'study-token-arrow';
          arrow.textContent = '\u2192';
          const result = document.createElement('span');
          result.className = 'study-token-result pending';
          result.id = `study-result-${d.tokenIdx}`;
          result.textContent = '\u00b7\u00b7\u00b7';
          slot.appendChild(orig);
          slot.appendChild(arrow);
          slot.appendChild(result);
          container.appendChild(slot);
        }

      } else if (d.type === 'study-frag') {
        // Accumulate fragments into the orig span to show letter-by-letter reveal
        const slot = document.getElementById(`study-tok-${d.tokenIdx}`);
        if (slot) {
          const origEl = slot.querySelector('.study-token-orig');
          if (origEl) {
            // Highlight the current fragment within the token
            const token = d.token || origEl.dataset.token || origEl.textContent;
            origEl.dataset.token = token;
            // Reveal up to current fragment
            origEl.innerHTML = buildFragHighlight(token, d.fragIdx, d.fragCount);
          }
        }

      } else if (d.type === 'study-match') {
        // Replace the ··· with the actual decoded word
        const resEl = document.getElementById(`study-result-${d.tokenIdx}`);
        if (resEl) {
          resEl.classList.remove('pending');
          resEl.classList.add('matched', d.score >= 0.9 ? 'high' : d.score >= 0.58 ? 'mid' : 'low');
          resEl.textContent = d.match;
        }
        doneTokens++;
        updateProgress(doneTokens, tokenCount);

      } else if (d.type === 'study-fail') {
        const resEl = document.getElementById(`study-result-${d.tokenIdx}`);
        if (resEl) {
          resEl.classList.remove('pending');
          resEl.classList.add('failed');
          resEl.textContent = '?';
        }
        doneTokens++;
        updateProgress(doneTokens, tokenCount);
      }
    }

    function updateProgress(done, total) {
      const bar = document.getElementById('study-progress-bar');
      if (bar && total > 0) bar.style.width = Math.round(done / total * 100) + '%';
    }

    function buildFragHighlight(token, fragIdx, fragCount) {
      // Show all letters up to current fragment highlighted, rest dimmed
      // Simple: first fragIdx+1 chunks revealed, rest shown as dim
      const fraction = (fragIdx + 1) / fragCount;
      const revealLen = Math.max(1, Math.round(token.length * fraction));
      const revealed = token.slice(0, revealLen);
      const hidden   = token.slice(revealLen);
      return `<span class="study-frag-revealed">${escHtml(revealed)}</span>` +
             (hidden ? `<span class="study-frag-hidden">${escHtml(hidden)}</span>` : '');
    }

    function escHtml(s) {
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    askStudy(text, isStormy, onEvent).then(function(finalResult) {
      clearTimeout(statusTimer);
      resolve(finalResult);
    });
  });
}

// ════════════════════════════════════════════════════════════════════════
//  OUTPUT UTILITIES
// ════════════════════════════════════════════════════════════════════════
function updateOutputBadge(badgeEl, html) {
  if (!badgeEl) return;
  const text  = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const words = text ? text.split(/\s+/).filter(w => w.length > 0).length : 0;
  badgeEl.textContent = words > 0 ? words + ' words' : '';
}

function attachTooltips(outputEl, sourceText, direction) {
  if (!sourceText || !direction.startsWith('to-')) return;
  const words = sourceText.trim().split(/\s+/).filter(Boolean);
  const spans = outputEl.querySelectorAll('span.col-cat,span.col-stormy,span.col-low,span.col-curse,span.col-intense,span.col-vocab');
  let wi = 0;
  spans.forEach(function(span) {
    if (wi < words.length) { span.title = words[wi++]; }
  });
}

const CAT_SOUND_PATTERN = /^([Mm]ew|[Pp]urr|[Cc]hirp|[Hh]iss|[Mm]r+ow|[Mm]r+p|[Nn]yaow|[Mm]rowl|[Ss]niff|[Nn]om|[Yy]owl|MEOW|HISS|MROWRR|NYAOW|CHIRP|TRILL)/;
function looksLikeCatSound(text) { return CAT_SOUND_PATTERN.test(text.trim().split(/\s+/)[0] || ''); }
function looksLikeStormySound(text) { return /[aeiouAEIOU]{4,}/.test(text); }

// ════════════════════════════════════════════════════════════════════════
//  UI CONTROLLER
// ════════════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', function() {

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

  let currentMode     = 'en-cat';
  let catToneLevel    = 1;
  let stormyToneLevel = 3;
  let debounceTimer;
  let latestReqId     = 0;
  let studyInProgress = false;

  function getToneLevel() {
    const cfg = MODES[currentMode];
    let level = cfg.group === 'stormy' ? stormyToneLevel : catToneLevel;
    const max = cfg.group === 'stormy' ? 5 : 3;
    if (level < 1 || level > max || isNaN(level)) {
      level = cfg.group === 'stormy' ? 3 : 1;
      if (cfg.group === 'stormy') stormyToneLevel = 3; else catToneLevel = 1;
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
    if (toneBtnCat)    toneBtnCat.style.display    = (cfg.group==='cat'    && !cfg.isReverse) ? 'inline' : 'none';
    if (toneBtnStormy) toneBtnStormy.style.display = (cfg.group==='stormy' && !cfg.isReverse) ? 'inline' : 'none';
  }

  function setMode(mode) {
    currentMode = mode;
    const cfg   = MODES[mode];
    leftLbl.innerHTML   = '<strong>' + cfg.leftLang + '</strong>';
    rightLbl.innerHTML  = cfg.rightHTML;
    inputEl.placeholder = cfg.ph;
    modeBtns.forEach(function(btn) {
      const on = btn.dataset.mode === mode;
      btn.classList.toggle('active', on);
      btn.classList.remove('cat-mode','stormy-mode');
      if (on) btn.classList.add(cfg.group === 'stormy' ? 'stormy-mode' : 'cat-mode');
    });
    if (randBtn) {
      randBtn.style.display = cfg.showRandom ? 'inline' : 'none';
      randBtn.className = 'random-btn' + (cfg.group === 'stormy' ? ' stormy-mode' : '');
    }
    if (confEl)         confEl.innerHTML = '';
    if (outputBadgeEl)  outputBadgeEl.textContent = '';
    showToneButtons(cfg);
    closeTonePopups();
    updateCounter();
    scheduleTranslate();
  }

  // ── Core translate ──────────────────────────────────────────────────
  async function doTranslate() {
    const text = inputEl.value.trim();
    if (!text) {
      outputEl.innerHTML = PLACEHOLDER_HTML;
      if (confEl) confEl.innerHTML = '';
      if (outputBadgeEl) outputBadgeEl.textContent = '';
      return;
    }

    const myId = ++latestReqId;
    const cfg  = MODES[currentMode];

    // Validate input
    if (cfg.hasLimit) {
      const tokens = text.split(/\s+/);
      for (const tok of tokens) {
        const clean = tok.replace(/[^a-zA-Z']/g, '');
        if (clean.length > MAX_WORD_CHARS) {
          goErrorPage(ERRORS.WORD_TOO_LONG,
            `"${tok.slice(0,20)}${tok.length>20?'...':''}" has ${clean.length} chars (max ${MAX_WORD_CHARS})`);
          return;
        }
      }
    }

    // === REVERSE MODE: use streaming study animation ===
    if (cfg.isReverse) {
      if (studyInProgress) return;
      studyInProgress = true;
      if (confEl) confEl.innerHTML = '';
      if (outputBadgeEl) outputBadgeEl.textContent = '';

      const isStormy = cfg.group === 'stormy';

      // Show a brief "preparing" state before study starts
      outputEl.innerHTML = TRANSLATING_HTML;

      const finalResult = await runStudyAnimation(outputEl, text, isStormy);
      studyInProgress = false;

      // Check if this is still the latest request
      if (latestReqId !== myId) return;

      if (!finalResult.canDecrypt) {
        // CT-303: could not decrypt any tokens
        goErrorPage(ERRORS.DECRYPT_FAIL,
          'None of the input sounds could be matched to known cat vocabulary. ' +
          'Make sure you\'re using sounds generated by this translator.');
        return;
      }

      // Show final output with reveal animation
      outputEl.innerHTML = `<div class="study-result-reveal">${finalResult.html}</div>`;
      if (confEl) confEl.innerHTML = finalResult.confHTML || '';
      updateOutputBadge(outputBadgeEl, finalResult.html);
      return;
    }

    // === FORWARD MODE: normal instant translation ===
    const tone      = getToneLevel();
    const indicator = setTimeout(function() {
      if (latestReqId === myId) outputEl.innerHTML = TRANSLATING_HTML;
    }, TRANSLATING_MS);

    let result;
    try {
      result = await ask(cfg.dir, text, cfg.randomLang, tone);
    } catch(e) {
      result = { html: makeErrorHTML(ERRORS.TRANS_FAILED, e.message), confHTML:'', confidence:0 };
    }
    clearTimeout(indicator);

    if (latestReqId === myId) {
      outputEl.innerHTML = result.html || PLACEHOLDER_HTML;
      attachTooltips(outputEl, text, cfg.dir);
      updateOutputBadge(outputBadgeEl, result.html || '');
      if (confEl) confEl.innerHTML = '';
    }
  }

  function scheduleTranslate() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(doTranslate, DEBOUNCE_MS);
  }

  // ── Random ───────────────────────────────────────────────────────────
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
      } catch(e) {
        outputEl.innerHTML = makeErrorHTML(ERRORS.RANDOM_FAIL, e.message);
      }
      randBtn.textContent = 'random';
      randBtn.disabled    = false;
    });
  }

  // ── Input events ──────────────────────────────────────────────────────
  inputEl.addEventListener('input', function() {
    const cfg = MODES[currentMode];
    if (cfg.hasLimit) enforceWordLimit(inputEl);
    updateCounter();
    if (!studyInProgress) scheduleTranslate();
  });

  inputEl.addEventListener('paste', function() {
    setTimeout(function() {
      const val = inputEl.value.trim();
      if (!val) return;
      const cfg = MODES[currentMode];
      if (cfg.isReverse) {
        if (looksLikeStormySound(val) && currentMode !== 'stormy-en') setMode('stormy-en');
        else if (looksLikeCatSound(val) && currentMode !== 'cat-en') setMode('cat-en');
      }
    }, 10);
  });

  inputEl.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); clearTimeout(debounceTimer); doTranslate(); }
    if (e.key === 'Escape') { clearBtn.click(); }
  });

  modeBtns.forEach(function(btn) {
    btn.addEventListener('click', function() { setMode(btn.dataset.mode); });
  });

  clearBtn.addEventListener('click', function() {
    studyInProgress = false;
    inputEl.value   = '';
    outputEl.innerHTML = PLACEHOLDER_HTML;
    if (confEl) confEl.innerHTML = '';
    if (outputBadgeEl) outputBadgeEl.textContent = '';
    updateCounter(); inputEl.focus();
  });

  copyBtn.addEventListener('click', function() {
    const text = outputEl.innerText.replace(/\s+/g,' ').trim();
    if (!text || text === 'Translation appears here\u2026') return;
    const done = function() {
      copyBtn.textContent = 'copied!'; copyBtn.classList.add('copied');
      setTimeout(function() { copyBtn.textContent = 'copy'; copyBtn.classList.remove('copied'); }, COPY_CONFIRM_MS);
    };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done).catch(done);
    else done();
  });

  swapBtn.addEventListener('click', function() {
    if (studyInProgress) return;
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

  // ── Tone controls ─────────────────────────────────────────────────────
  if (toneBtnCat) {
    toneBtnCat.addEventListener('click', function(e) {
      e.stopPropagation(); closeTonePopups();
      if (tonePopupCat) tonePopupCat.classList.toggle('open');
    });
  }
  if (toneBtnStormy) {
    toneBtnStormy.addEventListener('click', function(e) {
      e.stopPropagation(); closeTonePopups();
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
  document.addEventListener('click', function() { closeTonePopups(); });
  document.querySelectorAll('.tone-popup-close').forEach(function(btn) {
    btn.addEventListener('click', function(e) { e.stopPropagation(); closeTonePopups(); });
  });

  // ── Init ──────────────────────────────────────────────────────────────
  initBridge(function() {
    setMode('en-cat');
    if (typeof window._onTranslatorReady === 'function') window._onTranslatorReady();
  });
});
