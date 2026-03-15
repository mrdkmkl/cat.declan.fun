// ─────────────────────────────────────────────────────
//  translator.js
//  Depends on: dictionary.js (catDict, stormySpecial)
// ─────────────────────────────────────────────────────

const WORD_LIMIT = 100;

// ── Pass-through: colors and number words ─────────────
const COLOR_WORDS = new Set([
  'red','orange','yellow','green','blue','purple','pink','brown','black',
  'white','gray','grey','cyan','magenta','maroon','navy','teal','indigo',
  'violet','gold','silver','beige','tan','cream','lavender','lime','coral',
  'salmon','turquoise','crimson','scarlet','amber','ivory','bronze','copper',
]);
const NUMBER_WORDS = new Set([
  'zero','one','two','three','four','five','six','seven','eight','nine','ten',
  'eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen',
  'eighteen','nineteen','twenty','thirty','forty','fifty','sixty','seventy',
  'eighty','ninety','hundred','thousand','million','billion',
]);
function isPassthrough(token) {
  if (/^\d[\d.,]*$/.test(token)) return true;
  const l = token.toLowerCase();
  return COLOR_WORDS.has(l) || NUMBER_WORDS.has(l);
}

// ── Stormy vowel extension ────────────────────────────
function toStormy(catWord) {
  return catWord.replace(/([oOaAeEiIuUrR~]{1,})/g, (m) => m + m[Math.floor(m.length/2)].repeat(4));
}

function censorWord(w) {
  return w.length <= 1 ? '*' : w[0] + '*'.repeat(w.length - 1);
}
function coinFlip() { return Math.random() < 0.5; }
function countWords(text) {
  return text.trim().split(/\s+/).filter(w => w.replace(/[^a-zA-Z']/g,'').length > 0).length;
}

// ═══════════════════════════════════════════════════════
//  PHONETIC ENCODING FOR UNKNOWN WORDS
//  Maps English letter combinations → cat phoneme parts
//  so unknown words get consistent, reversible sounds
// ═══════════════════════════════════════════════════════

// Trigraphs (check first)
const TRIGRAPH = {
  'thr': 'Thrrr', 'str': 'Strrr', 'spr': 'Sprrr', 'spl': 'Splrr',
  'sch': 'Schrr', 'scr': 'Scrrr', 'shr': 'Shrrp', 'squ': 'Squrr',
  'dge': 'Jrrp',  'nch': 'Nchp',  'tch': 'Tchp',  'ght': 'Ghrr',
  'igh': 'Migh',  'oul': 'Owrl',  'our': 'Owrr',  'ure': 'Yurr',
  'tion': 'Shonn','ous': 'Owss',  'ing': 'Ngrr',  'ness': 'Nss',
  'ful': 'Furrl', 'less': 'Lss',  'ment': 'Mntt',
};

// Digraphs
const DIGRAPH = {
  'th': 'Thrr',  'sh': 'Shrp',  'ch': 'Chirr', 'ph': 'Phrr',
  'wh': 'Whrr',  'qu': 'Qurr',  'ck': 'Mrrk',  'gh': 'Ghrr',
  'ng': 'Ngrr',  'nk': 'Nkrr',  'st': 'Strr',  'sp': 'Sprr',
  'sk': 'Skrr',  'sm': 'Smrr',  'sn': 'Snrr',  'sl': 'Slrr',
  'sw': 'Swrr',  'sc': 'Scrr',  'bl': 'Blrr',  'br': 'Brrp',
  'cl': 'Clrr',  'cr': 'Crrp',  'dr': 'Drrp',  'fl': 'Flrr',
  'fr': 'Frrp',  'gl': 'Glrr',  'gr': 'Grrp',  'kn': 'Knrr',
  'pl': 'Plrr',  'pr': 'Prrp',  'tr': 'Trrp',  'tw': 'Twrr',
  'wr': 'Wrr',   'ld': 'Ldrr',  'lt': 'Ltrr',  'lk': 'Lkrr',
  'nd': 'Ndrr',  'nt': 'Ntrr',  'mp': 'Mprr',  'ct': 'Ktrr',
  'ft': 'Ftrr',  'pt': 'Ptrr',  'rk': 'Rkrr',  'rn': 'Rnrr',
  'rs': 'Rsrr',  'rt': 'Rtrr',  'ss': 'Ssrr',  'tt': 'Ttrr',
  'ff': 'Ffrr',  'nn': 'Nnrr',  'mm': 'Mmrr',  'll': 'Llrr',
  'oo': 'Ooww',  'ee': 'Eeww',  'ea': 'Eaow',  'ai': 'Ayow',
  'ay': 'Ayow',  'oi': 'Oyow',  'ou': 'Owwu',  'ow': 'Owww',
  'aw': 'Awww',  'ew': 'Ewww',  'ie': 'Eeww',  'ue': 'Ewww',
  'ui': 'Ewwi',  'oa': 'Oaow',  'au': 'Awwu',  'eu': 'Ewwu',
};

// Single letters
const SINGLE = {
  a:'Mao', b:'Brr', c:'Mrc', d:'Mrd', e:'Mew', f:'Fft',
  g:'Grr', h:'Hss', i:'Mii', j:'Jrr', k:'Mrk', l:'Lrr',
  m:'Mrm', n:'Nrr', o:'Mow', p:'Prr', q:'Qrr', r:'Rrr',
  s:'Sss', t:'Trr', u:'Murr',v:'Vrr', w:'Wrr', x:'Xrr',
  y:'Yrr', z:'Zzz',
};

// Encode unknown English word → cat phonemes
function phoneticEncode(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g,'');
  if (!w) return 'Mrrp';
  let result = '';
  let i = 0;
  while (i < w.length) {
    // Try trigraph first
    const tri = w.slice(i, i+3);
    if (TRIGRAPH[tri]) { result += TRIGRAPH[tri]; i += 3; continue; }
    // Digraph
    const di = w.slice(i, i+2);
    if (DIGRAPH[di]) { result += DIGRAPH[di]; i += 2; continue; }
    // Single
    result += SINGLE[w[i]] || 'Prr';
    i++;
  }
  // Trim to reasonable length (max 4 components)
  const parts = result.match(/[A-Z][a-z]*/g) || ['Mrrp'];
  const trimmed = parts.slice(0, 4).join('-');
  return trimmed;
}

// ── Session maps for unknown word round-trips ──────────
// Same unknown word always → same cat sound, and back
const sessionFwd = {};   // english word → generated cat sound
const sessionRev = {};   // generated cat sound key → english word

function getUnknownSound(word) {
  const clean = word.toLowerCase().replace(/[^a-z']/g,'');
  if (!clean) return 'Mrrp';
  if (sessionFwd[clean]) return sessionFwd[clean];

  let sound = phoneticEncode(clean);

  // Collision resolution: if sound is taken by a DIFFERENT word, vary it
  let attempt = sound;
  let n = 0;
  const key = s => s.toLowerCase().replace(/[^a-z\-]/g,'');
  while (sessionRev[key(attempt)] && sessionRev[key(attempt)] !== clean) {
    n++;
    attempt = sound + '~'.repeat(n);
  }
  sound = attempt;

  sessionFwd[clean] = sound;
  sessionRev[key(sound)] = clean;
  return sound;
}

function lookupUnknownRev(catSound) {
  const key = catSound.toLowerCase().replace(/[^a-z\-]/g,'');
  return sessionRev[key] || null;
}

// ── Build dictionary reverse maps ─────────────────────
function buildCatReverseMap() {
  const map = {};
  for (const [eng, entry] of Object.entries(catDict)) {
    const key = entry.cat.toLowerCase().replace(/[^a-z~.!? ]/g,'').trim();
    if (!map[key]) map[key] = eng;
  }
  return map;
}
function buildStormyReverseMap() {
  const map = {};
  for (const [eng, entry] of Object.entries(stormySpecial)) {
    const key = entry.stormy.toLowerCase().replace(/[^a-z~.!? ]/g,'').trim();
    if (!map[key]) map[key] = { eng, label: entry.label };
  }
  for (const [eng, entry] of Object.entries(catDict)) {
    const key = toStormy(entry.cat).toLowerCase().replace(/[^a-z~.!? ]/g,'').trim();
    if (!map[key]) map[key] = { eng, label: null };
  }
  return map;
}

const catReverseMap    = buildCatReverseMap();
const stormyReverseMap = buildStormyReverseMap();

// ── English → Cat ──────────────────────────────────────
function translateToCat(text) {
  const tokens = text.split(/(\s+|[,.!?;:'"()\-])/);
  const result = [];
  for (const token of tokens) {
    if (!token) continue;
    if (/^\s+$/.test(token)) { result.push({ type:'space', value:token }); continue; }
    if (/^[,.!?;:'"()\-]+$/.test(token)) { result.push({ type:'punct', value:token }); continue; }
    if (isPassthrough(token)) { result.push({ type:'passthrough', value:token }); continue; }
    const clean = token.toLowerCase().replace(/[^a-z']/g,'');
    const entry = catDict[clean];
    if (entry) {
      const sound = coinFlip() ? entry.cat : 'Meow';
      result.push({ type:'word', mode:'cat', value:sound, confidence:'high' });
    } else {
      result.push({ type:'word', mode:'cat', value:getUnknownSound(clean || token), confidence:'low' });
    }
  }
  return result;
}

// ── English → Stormy ───────────────────────────────────
function translateToStormy(text) {
  const tokens = text.split(/(\s+|[,.!?;:'"()\-])/);
  const result = [];
  for (const token of tokens) {
    if (!token) continue;
    if (/^\s+$/.test(token)) { result.push({ type:'space', value:token }); continue; }
    if (/^[,.!?;:'"()\-]+$/.test(token)) { result.push({ type:'punct', value:token }); continue; }
    if (isPassthrough(token)) { result.push({ type:'passthrough', value:token }); continue; }
    const clean = token.toLowerCase().replace(/[^a-z']/g,'');
    if (stormySpecial[clean]) {
      const s = stormySpecial[clean];
      result.push({ type:'word', mode:'stormy-special', value:s.stormy, label:s.label, confidence:'high' });
      continue;
    }
    const entry = catDict[clean];
    if (entry) {
      const base = coinFlip() ? entry.cat : 'Meow';
      result.push({ type:'word', mode:'stormy', value:toStormy(base), confidence:'high' });
    } else {
      result.push({ type:'word', mode:'stormy', value:toStormy(getUnknownSound(clean || token)), confidence:'low' });
    }
  }
  return result;
}

// ── Cat/Stormy → English ───────────────────────────────
function translateFromCat(text, lang) {
  const reverseMap = lang === 'stormy' ? stormyReverseMap : catReverseMap;
  const tokens = text.split(/(\s+)/);
  const result = [];
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (!token) { i++; continue; }
    if (/^\s+$/.test(token)) { result.push({ type:'space', value:token }); i++; continue; }

    const key = token.toLowerCase().replace(/[^a-z~.!? ]/g,'').trim();
    if (!key) { result.push({ type:'punct', value:token }); i++; continue; }

    // Check dictionary reverse map
    const found = reverseMap[key];
    if (found) {
      if (lang === 'stormy' && typeof found === 'object') {
        const display = found.label === 'curse' ? censorWord(found.eng) : found.eng;
        result.push({ type:'word', mode: found.label ? 'stormy-special' : 'normal',
                      label: found.label, value: display, confidence:'high' });
      } else {
        const val = typeof found === 'string' ? found : found.eng;
        result.push({ type:'word', mode:'normal', value:val, confidence:'high' });
      }
      i++; continue;
    }

    // Check session unknown word map
    const unknown = lookupUnknownRev(token);
    if (unknown) {
      result.push({ type:'word', mode:'unknown-recovered', value:unknown, confidence:'high' });
      i++; continue;
    }

    result.push({ type:'word', mode:'normal', value:token, confidence:'low' });
    i++;
  }
  return result;
}

// ── Render tokens → HTML ───────────────────────────────
function renderTokens(tokens, direction) {
  let html = '';
  for (const tok of tokens) {
    if (tok.type === 'space')       { html += tok.value; continue; }
    if (tok.type === 'punct')       { html += tok.value; continue; }
    if (tok.type === 'passthrough') { html += `<span class="col-pass">${tok.value}</span>`; continue; }

    if (direction === 'to-cat') {
      html += tok.confidence === 'low'
        ? `<span class="col-low">${tok.value}</span>`
        : `<span class="col-cat">${tok.value}</span>`;

    } else if (direction === 'to-stormy') {
      if (tok.confidence === 'low') {
        html += `<span class="col-low">${tok.value}</span>`;
      } else if (tok.mode === 'stormy-special') {
        const cls = tok.label === 'curse' ? 'col-curse'
                  : tok.label === 'intense' ? 'col-intense' : 'col-vocab';
        html += `<span class="${cls}">${tok.value}</span>`;
      } else {
        html += `<span class="col-stormy">${tok.value}</span>`;
      }

    } else {
      // reverse direction
      if (tok.confidence === 'low') {
        html += `<span class="col-low">${tok.value}</span>`;
      } else if (tok.mode === 'stormy-special') {
        const cls = tok.label === 'curse' ? 'col-curse'
                  : tok.label === 'intense' ? 'col-intense' : 'col-vocab';
        html += `<span class="${cls}">${tok.value}</span>`;
      } else if (tok.mode === 'unknown-recovered') {
        html += `<span class="col-cat">${tok.value}</span>`;
      } else {
        html += `<span class="col-cat">${tok.value}</span>`;
      }
    }
  }
  return html;
}

// ═══════════════════════════════════════════════════════
//  UI WIRING
// ═══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', function () {

  let currentMode = 'en-cat';

  const modeConfig = {
    'en-cat':    { leftLang:'English', rightLabelHTML:'<strong>Cat</strong>',
                   leftPlaceholder:'Type in English… (max 100 words)', dir:'to-cat', group:'cat', showLimit:true },
    'en-stormy': { leftLang:'English', rightLabelHTML:'<strong>Stormy</strong><span class="stormy-label-badge">extended</span>',
                   leftPlaceholder:'Type in English… (max 100 words)', dir:'to-stormy', group:'stormy', showLimit:true },
    'cat-en':    { leftLang:'Cat',     rightLabelHTML:'<strong>English</strong>',
                   leftPlaceholder:'Type Cat words… (e.g. Meow Purr Hiss)', dir:'from-cat', group:'cat', showLimit:false },
    'stormy-en': { leftLang:'Stormy',  rightLabelHTML:'<strong>English</strong>',
                   leftPlaceholder:'Type Stormy words… (e.g. Meoooooow)', dir:'from-stormy', group:'stormy', showLimit:false },
  };

  const swapPair = { 'en-cat':'cat-en','cat-en':'en-cat','en-stormy':'stormy-en','stormy-en':'en-stormy' };

  const inputEl    = document.getElementById('input-text');
  const outputEl   = document.getElementById('output-area');
  const leftLabel  = document.getElementById('left-label');
  const rightLabel = document.getElementById('right-label');
  const modeBtns   = document.querySelectorAll('.mode-btn');
  const wordCounter= document.getElementById('word-counter');

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

  function setMode(mode) {
    currentMode = mode;
    const cfg = modeConfig[mode];
    leftLabel.innerHTML  = `<strong>${cfg.leftLang}</strong>`;
    rightLabel.innerHTML = cfg.rightLabelHTML;
    inputEl.placeholder  = cfg.leftPlaceholder;
    modeBtns.forEach(btn => {
      const isActive = btn.dataset.mode === mode;
      btn.classList.toggle('active', isActive);
      btn.classList.remove('cat-mode', 'stormy-mode');
      if (isActive) btn.classList.add(cfg.group === 'stormy' ? 'stormy-mode' : 'cat-mode');
    });
    updateWordCounter();
    doTranslate();
  }

  function doTranslate() {
    const text = inputEl.value.trim();
    if (!text) { outputEl.innerHTML = '<span class="output-placeholder">Translation appears here…</span>'; return; }
    const { dir } = modeConfig[currentMode];
    let tokens;
    if      (dir === 'to-cat')      tokens = translateToCat(text);
    else if (dir === 'to-stormy')   tokens = translateToStormy(text);
    else if (dir === 'from-cat')    tokens = translateFromCat(text, 'cat');
    else                            tokens = translateFromCat(text, 'stormy');
    outputEl.innerHTML = renderTokens(tokens, dir);
  }

  inputEl.addEventListener('input', () => { enforceWordLimit(); updateWordCounter(); doTranslate(); });
  modeBtns.forEach(btn => btn.addEventListener('click', () => setMode(btn.dataset.mode)));

  document.getElementById('clear-btn').addEventListener('click', () => {
    inputEl.value = '';
    outputEl.innerHTML = '<span class="output-placeholder">Translation appears here…</span>';
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
    if (outText && outText !== 'Translation appears here…') {
      inputEl.value = outText;
      enforceWordLimit(); updateWordCounter(); doTranslate();
    }
  });

  setMode('en-cat');
}); // end DOMContentLoaded
