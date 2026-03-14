// ─────────────────────────────────────────────────────
//  translator.js
//  Core translation logic for Cat Translator.
//  Depends on: dictionary.js (catDict, stormySpecial)
// ─────────────────────────────────────────────────────

const WORD_LIMIT = 100;

// Color/number words that pass through untranslated
const COLOR_WORDS = new Set([
  'red','orange','yellow','green','blue','purple','pink','brown','black',
  'white','gray','grey','cyan','magenta','maroon','navy','teal','indigo',
  'violet','gold','silver','beige','tan','cream','lavender','lime','coral',
  'salmon','turquoise','crimson','scarlet','amber','ivory','bronze','copper',
]);

// Number words that pass through untranslated
const NUMBER_WORDS = new Set([
  'zero','one','two','three','four','five','six','seven','eight','nine','ten',
  'eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen',
  'eighteen','nineteen','twenty','thirty','forty','fifty','sixty','seventy',
  'eighty','ninety','hundred','thousand','million','billion','first','second',
  'third','fourth','fifth','sixth','seventh','eighth','ninth','tenth',
]);

function isPassthrough(token) {
  // Numeric digits/decimals
  if (/^\d[\d.,]*$/.test(token)) return true;
  const lower = token.toLowerCase();
  if (COLOR_WORDS.has(lower)) return true;
  if (NUMBER_WORDS.has(lower)) return true;
  return false;
}

// ── Stormy: extend vowel clusters by 4 ──────────────
function toStormy(catWord) {
  return catWord.replace(/([oOaAeEiIuUrR~]{1,})/g, (match) => {
    const ch = match[Math.floor(match.length / 2)];
    return match + ch.repeat(4);
  });
}

// ── Censor a curse word ───────────────────────────────
function censorWord(word) {
  if (word.length <= 1) return '*';
  return word[0] + '*'.repeat(word.length - 1);
}

// ── 50/50 chance ─────────────────────────────────────
function coinFlip() {
  return Math.random() < 0.5;
}

// ── Unknown word → generated cat sound based on vowel/consonant counts ──
// 100 distinct combinations keyed by (vowelCount, consonantCount) mod grid
const UNKNOWN_SOUNDS = [
  // row 0: 0 vowels
  "Prrt",        "Mrrph",       "Hff",         "Psst",        "Mrrk",
  "Grph",        "Frrp",        "Tssk",         "Brrt",        "Hrrp",
  // row 1: 1 vowel
  "Mew",         "Prrt mew",    "Hiss",         "Chirp",       "Mrrp",
  "Sniff",       "Brr mew",     "Prr",          "Tsk mew",     "Fwip",
  // row 2: 2 vowels
  "Meow",        "Mrrrow",      "Purr",         "Trill",       "Mrow",
  "Mrrow",       "Nyow",        "Prrow",        "Chirrow",     "Mreow",
  // row 3: 3 vowels
  "Meeeow",      "Mrrroow",     "Purrr",        "Maoow",       "Nyaow",
  "Mrowwl",      "Churrow",     "Prrrrow",      "Mewwow",      "Trrowl",
  // row 4: 4 vowels
  "Meoow",       "Mrroow",      "Purrow",       "Maoow",       "Nyaaow",
  "Mrowww",      "Meeow",       "Prrrow",       "Trrill",      "Yowwl",
  // row 5: 5+ vowels
  "Meeeooow",    "Mrrrooow",    "Purrrrow",     "Maoooow",     "Nyaaaow",
  "Mrowwwll",    "Meeeow",      "Prrrrow",      "Trrrill",     "Yowwwl",
  // consonant modifier rows (6-9): high consonant counts shift flavor
  // row 6: 0-1 cons
  "Mew~",        "Purr~",       "Trill~",       "Mrrrow~",     "Nyow~",
  "Mroow~",      "Meow~",       "Chirp~",       "Mrrow~",      "Prrt~",
  // row 7: 2-3 cons
  "Mrrp!",       "Chirp!",      "Sniff mew",    "Prrt!",       "Mrowl",
  "Hiss mew",    "Mrrow!",      "Trill mew",    "Purr mrrp",   "Mew mew",
  // row 8: 4-5 cons
  "MEOW",        "MROWRR",      "HISS",         "MRRROW",      "CHIRP",
  "NYAOW",       "MRROW",       "MRRP",         "HISSS",       "TRILL",
  // row 9: 6+ cons
  "MROWWRR",     "HISS MRRP",   "MEOW MEOW",    "MRRROW!",     "CHIRP MROW",
  "NYAOW!",      "MRRP HISS",   "MEOW MRRP",    "HISSSS",      "MROWL!",
];

function unknownCatSound(word) {
  const lower = word.toLowerCase();
  const vowels     = (lower.match(/[aeiou]/g) || []).length;
  const consonants = (lower.match(/[bcdfghjklmnpqrstvwxyz]/g) || []).length;

  // Map vowel count to row 0–5 (capped at 5)
  const vRow = Math.min(vowels, 5);

  // Map consonant count to column group 0–4 (every 2 cons = 1 step, capped at 4)
  const cCol = Math.min(Math.floor(consonants / 2), 4);

  // High consonant count (6+) shifts to rows 6-9 instead
  let row, col;
  if (consonants >= 6) {
    row = 9;
    col = Math.min(consonants - 6, 9);
  } else if (consonants >= 4) {
    row = 8;
    col = vRow;
  } else if (consonants >= 2) {
    row = 7;
    col = vRow;
  } else if (consonants <= 1 && vowels === 0) {
    row = 6;
    col = 0;
  } else {
    row = vRow;
    col = cCol;
  }

  const idx = (row * 10 + col) % UNKNOWN_SOUNDS.length;
  return UNKNOWN_SOUNDS[idx];
}

// ── Count real words ─────────────────────────────────
function countWords(text) {
  return text.trim().split(/\s+/).filter(w => w.replace(/[^a-zA-Z']/g, '').length > 0).length;
}

// ── English → Cat ────────────────────────────────────
function translateToCat(text) {
  const tokens = text.split(/(\s+|[,.!?;:'"()\-])/);
  const result = [];

  for (const token of tokens) {
    if (!token) continue;
    if (/^\s+$/.test(token)) { result.push({ type: 'space', value: token }); continue; }
    if (/^[,.!?;:'"()\-]+$/.test(token)) { result.push({ type: 'punct', value: token }); continue; }

    // Numbers and colors pass through unchanged
    if (isPassthrough(token)) {
      result.push({ type: 'passthrough', value: token });
      continue;
    }

    const clean = token.toLowerCase().replace(/[^a-z']/g, '');
    const entry = catDict[clean];

    if (entry) {
      if (coinFlip()) {
        result.push({ type: 'word', mode: 'cat', value: entry.cat, confidence: 'high' });
      } else {
        result.push({ type: 'word', mode: 'cat', value: 'Meow', confidence: 'high' });
      }
    } else {
      result.push({ type: 'word', mode: 'cat', value: unknownCatSound(clean || token), confidence: 'low' });
    }
  }
  return result;
}

// ── English → Stormy ─────────────────────────────────
function translateToStormy(text) {
  const tokens = text.split(/(\s+|[,.!?;:'"()\-])/);
  const result = [];

  for (const token of tokens) {
    if (!token) continue;
    if (/^\s+$/.test(token)) { result.push({ type: 'space', value: token }); continue; }
    if (/^[,.!?;:'"()\-]+$/.test(token)) { result.push({ type: 'punct', value: token }); continue; }

    if (isPassthrough(token)) {
      result.push({ type: 'passthrough', value: token });
      continue;
    }

    const clean = token.toLowerCase().replace(/[^a-z']/g, '');

    if (stormySpecial[clean]) {
      const s = stormySpecial[clean];
      result.push({ type: 'word', mode: 'stormy-special', value: s.stormy, label: s.label, confidence: 'high' });
      continue;
    }

    const entry = catDict[clean];
    if (entry) {
      if (coinFlip()) {
        result.push({ type: 'word', mode: 'stormy', value: toStormy(entry.cat), confidence: 'high' });
      } else {
        result.push({ type: 'word', mode: 'stormy', value: toStormy('Meow'), confidence: 'high' });
      }
    } else {
      result.push({ type: 'word', mode: 'stormy', value: toStormy(unknownCatSound(clean || token)), confidence: 'low' });
    }
  }
  return result;
}

// ── Build reverse maps ────────────────────────────────
function buildCatReverseMap() {
  const map = {};
  for (const [eng, entry] of Object.entries(catDict)) {
    const key = entry.cat.toLowerCase().replace(/[^a-z~.!?]/g, '');
    if (!map[key]) map[key] = eng;
  }
  return map;
}

function buildStormyReverseMap() {
  const map = {};
  for (const [eng, entry] of Object.entries(stormySpecial)) {
    const key = entry.stormy.toLowerCase().replace(/[^a-z~.!?]/g, '');
    if (!map[key]) map[key] = { eng, label: entry.label };
  }
  for (const [eng, entry] of Object.entries(catDict)) {
    const key = toStormy(entry.cat).toLowerCase().replace(/[^a-z~.!?]/g, '');
    if (!map[key]) map[key] = { eng, label: null };
  }
  return map;
}

const catReverseMap    = buildCatReverseMap();
const stormyReverseMap = buildStormyReverseMap();

// ── Cat/Stormy → English ─────────────────────────────
function translateFromCat(text, lang) {
  const reverseMap = lang === 'stormy' ? stormyReverseMap : catReverseMap;
  const tokens = text.split(/(\s+|[,;:'"()\-])/);
  const result = [];

  for (const token of tokens) {
    if (!token) continue;
    if (/^\s+$/.test(token)) { result.push({ type: 'space', value: token }); continue; }

    const key = token.toLowerCase().replace(/[^a-z~.!?]/g, '');
    if (!key) { result.push({ type: 'punct', value: token }); continue; }

    const found = reverseMap[key];
    if (found) {
      if (lang === 'stormy') {
        const label = found.label;
        const engWord = found.eng;
        const display = label === 'curse' ? censorWord(engWord) : engWord;
        result.push({ type: 'word', mode: label ? 'stormy-special' : 'normal', label, value: display, confidence: 'high' });
      } else {
        result.push({ type: 'word', mode: 'normal', value: found, confidence: 'high' });
      }
    } else {
      result.push({ type: 'word', mode: 'normal', value: token, confidence: 'low' });
    }
  }
  return result;
}

// ── Render tokens → HTML (color only, no tone labels) ─
function renderTokens(tokens, direction) {
  let html = '';

  for (const tok of tokens) {
    if (tok.type === 'space')       { html += tok.value; continue; }
    if (tok.type === 'punct')       { html += tok.value; continue; }
    if (tok.type === 'passthrough') { html += `<span class="col-pass">${tok.value}</span>`; continue; }

    if (direction === 'to-cat') {
      if (tok.confidence === 'low') {
        html += `<span class="col-low">${tok.value}</span>`;
      } else {
        html += `<span class="col-cat">${tok.value}</span>`;
      }

    } else if (direction === 'to-stormy') {
      if (tok.confidence === 'low') {
        html += `<span class="col-low">${tok.value}</span>`;
      } else if (tok.mode === 'stormy-special') {
        const cls = tok.label === 'curse'   ? 'col-curse'
                  : tok.label === 'intense' ? 'col-intense'
                  : 'col-vocab';
        html += `<span class="${cls}">${tok.value}</span>`;
      } else {
        html += `<span class="col-stormy">${tok.value}</span>`;
      }

    } else {
      // Reverse direction
      if (tok.confidence === 'low') {
        html += `<span class="col-low">${tok.value}</span>`;
      } else if (tok.mode === 'stormy-special') {
        const cls = tok.label === 'curse'   ? 'col-curse'
                  : tok.label === 'intense' ? 'col-intense'
                  : 'col-vocab';
        html += `<span class="${cls}">${tok.value}</span>`;
      } else {
        html += `<span class="col-cat">${tok.value}</span>`;
      }
    }
  }

  return html;
}

document.addEventListener('DOMContentLoaded', function() {

// ─────────────────────────────────────────────────────
//  UI State & Event Wiring
// ─────────────────────────────────────────────────────
let currentMode = 'en-cat';

const modeConfig = {
  'en-cat':    { leftLang: 'English', rightLabelHTML: '<strong>Cat</strong>',    leftPlaceholder: 'Type in English… (max 100 words)', dir: 'to-cat',      group: 'cat',    showLimit: true  },
  'en-stormy': { leftLang: 'English', rightLabelHTML: '<strong>Stormy</strong><span class="stormy-label-badge">extended</span>', leftPlaceholder: 'Type in English… (max 100 words)', dir: 'to-stormy',   group: 'stormy', showLimit: true  },
  'cat-en':    { leftLang: 'Cat',     rightLabelHTML: '<strong>English</strong>', leftPlaceholder: 'Type Cat words… (e.g. Meow Purr Hiss)',    dir: 'from-cat',    group: 'cat',    showLimit: false },
  'stormy-en': { leftLang: 'Stormy',  rightLabelHTML: '<strong>English</strong>', leftPlaceholder: 'Type Stormy words… (e.g. Meoooooow)',       dir: 'from-stormy', group: 'stormy', showLimit: false },
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
    const isWord = chunk.replace(/[^a-zA-Z']/g, '').length > 0;
    if (isWord) { count++; if (count > WORD_LIMIT) { cutIndex = charPos; break; } }
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
  const raw = outputEl.innerText.replace(/\s+/g,' ').trim();
  navigator.clipboard.writeText(raw).then(() => {
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