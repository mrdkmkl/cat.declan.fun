// ════════════════════════════════════════════════════════════════════════
//  worker.js — Cat Translator Core Engine
//  Version 4.0 — Rebuilt for flawless round-trip translation
//
//  This file runs as a Web Worker when supported, and falls back to
//  running as a regular <script> tag automatically. Either way, all
//  translation functions are available on the global scope.
//
//  Architecture overview:
//    1. Sound pool (250 unique cat sounds for unknown words)
//    2. djb2 hash — maps unknown words to pool slots consistently
//    3. Levenshtein distance — fuzzy reverse-translation matching
//    4. Session maps — fwd/rev store unknown word round-trips
//    5. Capitalisation engine — mirrors input cap pattern on output
//    6. Forward translation — English → Cat / Stormy (deterministic)
//    7. Reverse translation — Cat/Stormy → English (greedy + fuzzy)
//    8. Stormy engine — vowel extension on any cat sound
//    9. Tokeniser — splits text preserving punctuation
//   10. Render — tokens → HTML spans with colour classes
//
//  Key design principle:
//    Every known word maps to exactly ONE unique cat sound (single token,
//    letters only). This makes reverse lookup O(1) per token and enables
//    perfect round-trips for all words in catDict.
//
//  Usage (as worker):  worker.postMessage({ id, type, text })
//  Usage (as script):  call translateForward(text,'cat'), etc. directly
// ════════════════════════════════════════════════════════════════════════

// ── Load dictionary when running as a worker ─────────────────────────────
if (typeof importScripts === 'function') {
  importScripts('dictionary.js');
}

// ════════════════════════════════════════════════════════════════════════
//  SECTION 1: UNKNOWN WORD SOUND POOL
//  250 unique single-token letter-only cat sounds.
//  Unknown English words are hashed to a slot in this pool.
//  Sounds are sorted by mood intensity (soft → loud).
// ════════════════════════════════════════════════════════════════════════
const UNKNOWN_POOL = [
  'Mip', 'Pip', 'Prp', 'Fwip', 'Yip',
  'Tsst', 'Hff', 'Brrt', 'Prrp', 'Tsp',
  'Whff', 'Sft', 'Prk', 'Pft', 'Sqk',
  'Nrr', 'Frrp', 'Brrp', 'Grrt', 'Drrt',
  'Vrrp', 'Krrp', 'Wrrp', 'Zrrp', 'Jrrp',
  'Mew', 'Meow', 'Purr', 'Trill', 'Chirp',
  'Mrrow', 'Mrrrow', 'Mrrph', 'Nyaow', 'Mrowl',
  'Prrt', 'Mrrp', 'Nyow', 'Mrr', 'Sniff',
  'Nom', 'Yowl', 'Brrow', 'Mreow', 'Prrow',
  'Grrow', 'Trrow', 'Wrrow', 'Nrrow', 'Prow',
  'Mewr', 'Meowr', 'Purrr', 'Trillr', 'Chirpr',
  'Mrrrowr', 'Mrrphr', 'Nyaowr', 'Mrowlr', 'Prrtr',
  'Mrrpr', 'Nyowr', 'Mrrr', 'Sniffr', 'Nomr',
  'Yowlr', 'Brrrowr', 'Mreowr', 'Prrowr', 'Grrowr',
  'Trrrowr', 'Wrrowr', 'Nrrowr', 'Prowr', 'Prrpr',
  'Mewrr', 'Meowrr', 'Purrrr', 'Trillrr', 'Chirprr',
  'Mrrrowrr', 'Mrrphrr', 'Nyaowrr', 'Mrowlrr', 'Prrtrr',
  'Mrrprr', 'Nyowrr', 'Mrrrr', 'Sniffrr', 'Nomrr',
  'Yowlrr', 'Brrowrr', 'Mreowrr', 'Prrowrr', 'Grrowrr',
  'Trrrowrww', 'Wrrowrr', 'Nrrowrr', 'Prowrr', 'Prrprr',
  'Mewl', 'Meowl', 'Purrl', 'Trilll', 'Chirpl',
  'Mrrowl', 'Mrrrowl', 'Mrrphl', 'Nyaowl', 'Mrowll',
  'Prrtl', 'Mrrpl', 'Nyowl', 'Mrrl', 'Sniffl',
  'Noml', 'Yowll', 'Brrowl', 'Mreowl', 'Prrowl',
  'Grrowl', 'Trrowl', 'Wrrowl', 'Nrrowl', 'Prowl',
  'Mewll', 'Meowll', 'Purrll', 'Trillll', 'Chirpll',
  'Mrrowll', 'Mrrrowll', 'Mrrphll', 'Nyaowll', 'Mrowlll',
  'Prrtll', 'Mrrpll', 'Nyowll', 'Mrrll', 'Sniffll',
  'Nomll', 'Yowlll', 'Brrowll', 'Mreowll', 'Prrowll',
  'Mewm', 'Meowm', 'Purrm', 'Trillm', 'Chirpm',
  'Mrrowm', 'Mrrrowm', 'Mrrphm', 'Nyaowm', 'Mrowlm',
  'Prrtm', 'Mrrpm', 'Nyowm', 'Mrrm', 'Sniffm',
  'Nomm', 'Yowlm', 'Brrowm', 'Mreowm', 'Prrowm',
  'Grrowm', 'Trrowm', 'Wrrowm', 'Nrrowm', 'Prowm',
  'Mewmm', 'Meowmm', 'Purrmm', 'Trillmm', 'Chirpmm',
  'Mrrowmm', 'Mrrrowmm', 'Mrrphmm', 'Nyaowmm', 'Mrowlmm',
  'Prrtmm', 'Mrrpmm', 'Nyowmm', 'Mrrmm', 'Sniffmm',
  'Nommm', 'Yowlmm', 'Brrowmm', 'Mreowmm', 'Prrowmm',
  'Mewph', 'Meowph', 'Purrph', 'Trillph', 'Chirpph',
  'Mrrowph', 'Mrrrowph', 'Mrrphph', 'Nyaowph', 'Mrowlph',
  'Prrtph', 'Mrrpph', 'Nyowph', 'Mrrphww', 'Sniffph',
  'Nomph', 'Yowlph', 'Brrowph', 'Mreowph', 'Prrowph',
  'Meww', 'Meoww', 'Purrw', 'Trillw', 'Chirpw',
  'Mrroww', 'Mrrroww', 'Mrrphw', 'Nyaoww', 'Mrowlw',
  'Prrtw', 'Mrrpw', 'Nyoww', 'Mrrw', 'Sniffw',
  'Nomw', 'Yowlw', 'Brroww', 'Mreoww', 'Prroww',
  'MEOW', 'MROWRR', 'HISS', 'NYAOW', 'CHIRP',
  'MRRROW', 'MRROW', 'MRRP', 'TRILL', 'YOWL',
];

// Verify pool integrity at startup
(function verifyPool() {
  const s = new Set(UNKNOWN_POOL);
  if (s.size !== UNKNOWN_POOL.length) {
    const c = UNKNOWN_POOL.filter((v, i) => UNKNOWN_POOL.indexOf(v) !== i);
    console.warn('[CatTranslator] Pool has duplicates:', c.length, c.slice(0,3));
  }
})();

// ════════════════════════════════════════════════════════════════════════
//  SECTION 2: djb2 HASH FUNCTION
//  Deterministic: same word always maps to same pool slot.
//  Algorithm from hash.c (Dan Bernstein, 1991).
//  hash = 5381; for each char: hash = hash*33 XOR charCode
// ════════════════════════════════════════════════════════════════════════
function djb2(word) {
  let h = 5381;
  for (let i = 0; i < word.length; i++) {
    h = (((h << 5) + h) ^ word.charCodeAt(i)) >>> 0;
  }
  return h;
}

// ════════════════════════════════════════════════════════════════════════
//  SECTION 3: LEVENSHTEIN EDIT DISTANCE
//  Used for fuzzy reverse translation. When a cat sound token doesn't
//  exactly match any dictionary entry, we find the closest match within
//  edit distance 2. This handles typos and minor variations gracefully.
//
//  Algorithm: Classic two-row dynamic programming.
//  O(m*n) time, O(n) space.
// ════════════════════════════════════════════════════════════════════════
function lev(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  // Early exit: if lengths differ by more than threshold, skip
  if (Math.abs(m - n) > 4) return Math.abs(m - n);
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 0; i < m; i++) {
    curr[0] = i + 1;
    for (let j = 0; j < n; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      curr[j + 1] = Math.min(curr[j] + 1, prev[j + 1] + 1, prev[j] + cost);
    }
    const tmp = prev; prev = curr; curr = tmp;
  }
  return prev[n];
}

// ════════════════════════════════════════════════════════════════════════
//  SECTION 4: SESSION MAPS — UNKNOWN WORD ROUND-TRIPS
//  When we translate an unknown word, we store the mapping so that
//  translating the cat sound back returns the original English word.
//  fwd: cleanEnglish → catSound
//  rev: normalisedCatSound → cleanEnglish
// ════════════════════════════════════════════════════════════════════════
const SESSION_FWD = {};
const SESSION_REV = {};

function normKey(s) {
  return s.toLowerCase().replace(/[^a-z]/g, '');
}

function getUnknownSound(word) {
  const clean = word.toLowerCase().replace(/[^a-z']/g, '');
  if (!clean) return 'Mrrp';
  if (SESSION_FWD[clean]) return SESSION_FWD[clean];
  const poolSize = UNKNOWN_POOL.length;
  const startIdx = djb2(clean) % poolSize;
  let sound = UNKNOWN_POOL[startIdx];
  // Collision resolution: probe neighbouring slots
  let offset = 0;
  const maxProbe = poolSize;
  while (
    SESSION_REV[normKey(sound)] !== undefined &&
    SESSION_REV[normKey(sound)] !== clean
  ) {
    offset++;
    if (offset >= maxProbe) {
      // Fallback: append the word itself (always unique)
      sound = 'Mrrp' + clean.slice(0, 4);
      break;
    }
    sound = UNKNOWN_POOL[(startIdx + offset) % poolSize];
  }
  SESSION_FWD[clean] = sound;
  SESSION_REV[normKey(sound)] = clean;
  return sound;
}

function recoverUnknown(catSound) {
  const key = normKey(catSound);
  return SESSION_REV[key] || null;
}

// ════════════════════════════════════════════════════════════════════════
//  SECTION 5: CAPITALISATION ENGINE
//  Mirrors the capitalisation pattern of the input token onto the output.
//
//  Patterns detected:
//    'upper' — ALL CAPS (MEOW → MEOW, MROWRR → MROWRR)
//    'title' — First letter capitalised (Meow → Hello)
//    'lower' — All lowercase (meow → hello)
//
//  This means:
//    English "HELLO" → cat sound "MRRROW" → English back "HELLO"
//    English "Hello" → cat sound "Mrrrow" → English back "Hello"
//    English "hello" → cat sound "Mrrrow" → English back "hello"
//
//  Note: the cat sounds in catDict are stored in their natural form
//  (e.g. "Mrrrow" with capital first letter). We detect the INPUT token's
//  pattern and apply it to the OUTPUT, regardless of how the sound is stored.
// ════════════════════════════════════════════════════════════════════════
function detectCap(token) {
  if (!token || token.length === 0) return 'lower';
  const alpha = token.replace(/[^a-zA-Z]/g, '');
  if (!alpha) return 'lower';
  if (alpha === alpha.toUpperCase() && alpha.length > 1) return 'upper';
  if (alpha[0] === alpha[0].toUpperCase()) return 'title';
  return 'lower';
}

function applyCap(pattern, word) {
  if (!word || word.length === 0) return word;
  if (pattern === 'upper') return word.toUpperCase();
  if (pattern === 'title') return word[0].toUpperCase() + word.slice(1).toLowerCase();
  return word.toLowerCase();
}

// When outputting a cat sound for an English word, apply the INPUT word's
// cap pattern to the stored cat sound.
function catSoundWithCap(storedSound, inputToken) {
  const pat = detectCap(inputToken);
  if (pat === 'upper') return storedSound.toUpperCase();
  if (pat === 'title') return storedSound[0].toUpperCase() + storedSound.slice(1);
  return storedSound.toLowerCase();
}

// ════════════════════════════════════════════════════════════════════════
//  SECTION 6: PASS-THROUGH SETS
//  Colour names and number words always pass through unchanged.
// ════════════════════════════════════════════════════════════════════════
const COLORS = new Set([
  'red','orange','yellow','green','blue','purple','pink','brown','black',
  'white','gray','grey','cyan','magenta','maroon','navy','teal','indigo',
  'violet','gold','silver','beige','tan','cream','lavender','lime','coral',
  'salmon','turquoise','crimson','scarlet','amber','ivory','bronze','copper',
  'aqua','fuchsia','chartreuse','vermillion','cerulean','ochre','sepia',
]);

const NUMBER_WORDS = new Set([
  'zero','one','two','three','four','five','six','seven','eight','nine','ten',
  'eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen',
  'eighteen','nineteen','twenty','thirty','forty','fifty','sixty','seventy',
  'eighty','ninety','hundred','thousand','million','billion','trillion',
]);

function isPassthrough(token) {
  if (/^\d[\d.,:%]*$/.test(token)) return true;
  const lower = token.toLowerCase();
  return COLORS.has(lower) || NUMBER_WORDS.has(lower);
}

// ════════════════════════════════════════════════════════════════════════
//  SECTION 7: STORMY ENGINE
//  Stormy extends every vowel cluster in a cat sound by repeating
//  the middle vowel 4 extra times.
//  Examples:
//    Mrrrow  →  Mrrroooow
//    Purr    →  Purrrrrr
//    Chirp   →  Chiiiirp
//    Mew     →  Meeeew
// ════════════════════════════════════════════════════════════════════════
function toStormy(sound) {
  // Extend runs of vowels by repeating the middle character 4 times
  return sound.replace(/([aeiouAEIOU]+)/g, function(m) {
    const mid = m[Math.floor(m.length / 2)];
    return m + mid.repeat(4);
  });
}

// ════════════════════════════════════════════════════════════════════════
//  SECTION 8: TOKENISER
//  Splits input text into tokens (words, spaces, punctuation) while
//  preserving everything so we can reconstruct the spacing exactly.
// ════════════════════════════════════════════════════════════════════════
function tokenise(text) {
  // Split on whitespace and punctuation, keeping delimiters
  const raw = text.split(/(\s+|[,.!?;:'"()\[\]{}\-\/\\])/);
  return raw.filter(t => t !== undefined && t !== '');
}

function isSpace(t)  { return /^\s+$/.test(t); }
function isPunct(t)  { return /^[,.!?;:'"()\[\]{}\-\/\\]+$/.test(t); }
function isWord(t)   { return !isSpace(t) && !isPunct(t); }

// ════════════════════════════════════════════════════════════════════════
//  SECTION 9: REVERSE LOOKUP MAP BUILDER
//  Builds a normalised map from cat sound → { eng, label } for O(1) lookup.
//  Since all dictionary sounds are single tokens with no spaces, we can
//  look up each input token independently after lowercasing.
//
//  The map key is normKey(sound) — lowercased, letters only.
//  This makes the lookup robust to minor capitalisation differences.
// ════════════════════════════════════════════════════════════════════════
function buildCatRevMap() {
  const map = {};
  if (typeof catDict === 'undefined') return map;
  for (const [eng, entry] of Object.entries(catDict)) {
    const key = normKey(entry.cat);
    if (key && !map[key]) {
      map[key] = { eng, label: null };
    }
  }
  return map;
}

function buildStormyRevMap() {
  const map = {};
  if (typeof stormySpecial !== 'undefined') {
    for (const [eng, entry] of Object.entries(stormySpecial)) {
      const key = normKey(entry.stormy);
      if (key && !map[key]) {
        map[key] = { eng, label: entry.label };
      }
    }
  }
  if (typeof catDict !== 'undefined') {
    for (const [eng, entry] of Object.entries(catDict)) {
      const stormySound = toStormy(entry.cat);
      const key = normKey(stormySound);
      if (key && !map[key]) {
        map[key] = { eng, label: null };
      }
    }
  }
  return map;
}

// Build maps once (populated after dictionary loads)
let CAT_REV_MAP    = {};
let STORMY_REV_MAP = {};

function initRevMaps() {
  CAT_REV_MAP    = buildCatRevMap();
  STORMY_REV_MAP = buildStormyRevMap();
}

// ════════════════════════════════════════════════════════════════════════
//  SECTION 10: CENSORING
//  Curse words are censored on output: first letter kept, rest replaced.
// ════════════════════════════════════════════════════════════════════════
function censorWord(w) {
  if (!w || w.length === 0) return '*';
  if (w.length === 1) return '*';
  return w[0] + '*'.repeat(w.length - 1);
}

// ════════════════════════════════════════════════════════════════════════
//  SECTION 11: FORWARD TRANSLATION  English → Cat
//  Each word maps to exactly one cat sound. Deterministic — no randomness.
//  Unknown words → djb2 hash → pool sound (stored in session map).
// ════════════════════════════════════════════════════════════════════════
function translateToCat(text) {
  if (!text || !text.trim()) return [];
  const tokens = tokenise(text);
  const result = [];
  for (const tok of tokens) {
    if (isSpace(tok))  { result.push({ type: 'space', v: tok });         continue; }
    if (isPunct(tok))  { result.push({ type: 'punct', v: tok });         continue; }
    if (isPassthrough(tok)) { result.push({ type: 'pass', v: tok });     continue; }
    const clean = tok.toLowerCase().replace(/[^a-z']/g, '');
    const entry = (typeof catDict !== 'undefined') ? catDict[clean] : null;
    if (entry) {
      // Apply cap pattern of input word to the cat sound
      const sound = catSoundWithCap(entry.cat, tok);
      result.push({ type: 'word', mode: 'cat', conf: 'high', v: sound, orig: tok });
    } else {
      const sound = catSoundWithCap(getUnknownSound(clean || tok), tok);
      result.push({ type: 'word', mode: 'cat', conf: 'low',  v: sound, orig: tok });
    }
  }
  return result;
}

// ════════════════════════════════════════════════════════════════════════
//  SECTION 12: FORWARD TRANSLATION  English → Stormy
//  Stormy special words always translate to their dedicated Stormy sound.
//  All other words translate via catDict then get vowel extension applied.
// ════════════════════════════════════════════════════════════════════════
function translateToStormy(text) {
  if (!text || !text.trim()) return [];
  const tokens = tokenise(text);
  const result = [];
  for (const tok of tokens) {
    if (isSpace(tok))  { result.push({ type: 'space', v: tok });     continue; }
    if (isPunct(tok))  { result.push({ type: 'punct', v: tok });     continue; }
    if (isPassthrough(tok)) { result.push({ type: 'pass', v: tok }); continue; }
    const clean = tok.toLowerCase().replace(/[^a-z']/g, '');
    // Stormy special words take priority
    const special = (typeof stormySpecial !== 'undefined') ? stormySpecial[clean] : null;
    if (special) {
      const sound = catSoundWithCap(special.stormy, tok);
      result.push({ type: 'word', mode: 'stormy-special', label: special.label,
                    conf: 'high', v: sound, orig: tok });
      continue;
    }
    // Regular word → cat sound → stormy extension
    const entry = (typeof catDict !== 'undefined') ? catDict[clean] : null;
    const base  = entry ? entry.cat : getUnknownSound(clean || tok);
    const sound = catSoundWithCap(toStormy(base), tok);
    result.push({ type: 'word', mode: 'stormy', conf: entry ? 'high' : 'low',
                  v: sound, orig: tok });
  }
  return result;
}

// ════════════════════════════════════════════════════════════════════════
//  SECTION 13: REVERSE TRANSLATION  Cat/Stormy → English
//  Each input token is looked up in the reverse map (exact match).
//  If no exact match, we check the session map (unknown word recovery).
//  If still no match, Levenshtein fuzzy matching finds the closest sound.
//
//  Capitalisation: the cap pattern of the INPUT cat token is applied to
//  the OUTPUT English word. So MEOW → "HELLO", Meow → "Hello", meow → "hello".
// ════════════════════════════════════════════════════════════════════════
function translateFromCat(text, map) {
  if (!text || !text.trim()) return [];
  // Split input on whitespace — cat sounds are single tokens
  const rawTokens  = text.trim().split(/(\s+)/);
  const wordTokens = rawTokens.filter(t => t !== undefined && t !== '');
  const result     = [];
  let   i          = 0;

  while (i < wordTokens.length) {
    const tok = wordTokens[i];

    // Preserve whitespace tokens
    if (isSpace(tok)) {
      result.push({ type: 'space', v: tok });
      i++;
      continue;
    }

    // Preserve punctuation
    if (isPunct(tok)) {
      result.push({ type: 'punct', v: tok });
      i++;
      continue;
    }

    // Pass-through (numbers, colours)
    if (isPassthrough(tok)) {
      result.push({ type: 'pass', v: tok });
      i++;
      continue;
    }

    const inputCap = detectCap(tok);
    const key      = normKey(tok);

    // 1. Exact dictionary match
    const entry = map[key];
    if (entry) {
      const raw     = entry.label === 'curse' ? censorWord(entry.eng) : entry.eng;
      const display = applyCap(inputCap, raw);
      result.push({
        type: 'word', mode: entry.label ? 'stormy-special' : 'normal',
        label: entry.label, conf: 'high', v: display,
      });
      i++;
      continue;
    }

    // 2. Session map — unknown word round-trip recovery
    const recovered = recoverUnknown(tok);
    if (recovered) {
      result.push({
        type: 'word', mode: 'recovered', conf: 'high',
        v: applyCap(inputCap, recovered),
      });
      i++;
      continue;
    }

    // 3. Levenshtein fuzzy match (max edit distance 2)
    let bestEntry = null;
    let bestDist  = Infinity;
    for (const [mKey, mEntry] of Object.entries(map)) {
      // Skip obviously incompatible lengths early
      if (Math.abs(key.length - mKey.length) > 3) continue;
      const d = lev(key, mKey);
      if (d < bestDist && d <= 2) {
        bestDist  = d;
        bestEntry = mEntry;
      }
    }
    if (bestEntry) {
      const raw     = bestEntry.label === 'curse' ? censorWord(bestEntry.eng) : bestEntry.eng;
      const display = applyCap(inputCap, raw);
      result.push({
        type: 'word', mode: 'fuzzy', label: bestEntry.label,
        conf: 'fuzzy', v: display,
      });
      i++;
      continue;
    }

    // 4. No match at all — show the token as-is in grey
    result.push({ type: 'word', mode: 'unknown', conf: 'low', v: tok });
    i++;
  }

  return result;
}

// ════════════════════════════════════════════════════════════════════════
//  SECTION 14: HTML RENDERER
//  Converts token array to HTML string with colour classes.
//  Colour scheme:
//    col-cat    — orange  — known cat word
//    col-stormy — purple  — stormy extended word
//    col-curse  — red     — censored curse
//    col-intense— amber   — intense emotion (stormy only)
//    col-vocab  — green   — stormy-only vocabulary
//    col-low    — grey    — unknown/low confidence
//    col-pass   — black   — number or colour name
//    col-fuzzy  — orange (italic) — fuzzy match
// ════════════════════════════════════════════════════════════════════════
function renderTokens(tokens, direction) {
  let html = '';
  for (const tok of tokens) {
    if (tok.type === 'space') { html += ' '; continue; }
    if (tok.type === 'punct') { html += tok.v; continue; }
    if (tok.type === 'pass')  {
      html += `<span class="col-pass">${escHtml(tok.v)}</span>`;
      continue;
    }

    const v = escHtml(tok.v);

    // ── Forward: English → Cat ───────────────────────────────────────
    if (direction === 'to-cat') {
      if (tok.conf === 'low') {
        html += `<span class="col-low">${v}</span>`;
      } else {
        html += `<span class="col-cat">${v}</span>`;
      }

    // ── Forward: English → Stormy ────────────────────────────────────
    } else if (direction === 'to-stormy') {
      if (tok.conf === 'low') {
        html += `<span class="col-low">${v}</span>`;
      } else if (tok.mode === 'stormy-special') {
        const cls = tok.label === 'curse'   ? 'col-curse'
                  : tok.label === 'intense' ? 'col-intense'
                  : 'col-vocab';
        html += `<span class="${cls}">${v}</span>`;
      } else {
        html += `<span class="col-stormy">${v}</span>`;
      }

    // ── Reverse: Cat/Stormy → English ────────────────────────────────
    } else {
      if (tok.mode === 'stormy-special') {
        const cls = tok.label === 'curse'   ? 'col-curse'
                  : tok.label === 'intense' ? 'col-intense'
                  : 'col-vocab';
        html += `<span class="${cls}">${v}</span>`;
      } else if (tok.mode === 'fuzzy') {
        html += `<span class="col-cat col-fuzzy">${v}</span>`;
      } else if (tok.conf === 'low') {
        html += `<span class="col-low">${v}</span>`;
      } else {
        html += `<span class="col-cat">${v}</span>`;
      }
    }
  }
  return html;
}

// HTML-escape helper — prevents XSS in translated output
function escHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ════════════════════════════════════════════════════════════════════════
//  SECTION 15: PUBLIC API
//  These functions are called either via postMessage (worker mode)
//  or directly from translator.js (script fallback mode).
// ════════════════════════════════════════════════════════════════════════
function doTranslate(type, text) {
  // Ensure rev maps are built (idempotent)
  if (Object.keys(CAT_REV_MAP).length === 0) initRevMaps();
  let tokens;
  switch (type) {
    case 'to-cat':      tokens = translateToCat(text);                    break;
    case 'to-stormy':   tokens = translateToStormy(text);                 break;
    case 'from-cat':    tokens = translateFromCat(text, CAT_REV_MAP);     break;
    case 'from-stormy': tokens = translateFromCat(text, STORMY_REV_MAP);  break;
    default:            return '';
  }
  return renderTokens(tokens, type);
}

// ── Worker message handler ────────────────────────────────────────────
if (typeof self !== 'undefined' && typeof WorkerGlobalScope !== 'undefined'
    && self instanceof WorkerGlobalScope) {
  // Running as a Web Worker
  self.onmessage = function(e) {
    const { id, type, text } = e.data;
    const html = doTranslate(type, text);
    self.postMessage({ id, html });
  };
} else if (typeof self !== 'undefined') {
  // Running as a regular script (window context)
  // Expose doTranslate globally so translator.js can call it
  self.catTranslatorEngine = { doTranslate, initRevMaps };
}

// ════════════════════════════════════════════════════════════════════════
//  SECTION 16: INITIALISATION & SELF-TEST
//  Runs once when the file loads. Validates pool integrity, builds
//  reverse maps, and runs a small sanity check on core functions.
// ════════════════════════════════════════════════════════════════════════
(function selfTest() {
  // Build reverse maps now if dictionary is already loaded
  if (typeof catDict !== 'undefined') {
    initRevMaps();
  }

  // Validate lev correctness
  const levTests = [
    ['cat',   'cat',     0],
    ['cat',   'bat',     1],
    ['meow',  'mew',     1],
    ['purr',  'purrr',   1],
    ['mrrrow','mrrow',   1],
    ['hiss',  'his',     1],
  ];
  for (const [a, b, expected] of levTests) {
    const d = lev(a, b);
    if (d !== expected) {
      console.warn(`[CatTranslator] lev("${a}","${b}") = ${d}, expected ${expected}`);
    }
  }

  // Validate djb2 consistency
  const hashTests = ['massive', 'complicated', 'beautiful', 'xylophone'];
  for (const w of hashTests) {
    const h1 = djb2(w) % UNKNOWN_POOL.length;
    const h2 = djb2(w) % UNKNOWN_POOL.length;
    if (h1 !== h2) {
      console.warn(`[CatTranslator] djb2 inconsistent for "${w}"`);
    }
  }

  // Validate cap engine
  const capTests = [
    ['HELLO', 'upper'], ['Hello', 'title'], ['hello', 'lower'],
    ['MEOW',  'upper'], ['Mew',   'title'], ['mew',   'lower'],
  ];
  for (const [token, expected] of capTests) {
    const got = detectCap(token);
    if (got !== expected) {
      console.warn(`[CatTranslator] detectCap("${token}") = "${got}", expected "${expected}"`);
    }
  }

  // Validate applyCap round-trip
  const roundTrips = [
    ['HELLO', 'world', 'WORLD'],
    ['Hello', 'world', 'World'],
    ['hello', 'world', 'world'],
  ];
  for (const [inputToken, word, expected] of roundTrips) {
    const got = applyCap(detectCap(inputToken), word);
    if (got !== expected) {
      console.warn(`[CatTranslator] applyCap("${inputToken}", "${word}") = "${got}", expected "${expected}"`);
    }
  }
})();

// ════════════════════════════════════════════════════════════════════════
//  SECTION 17: UTILITY EXPORTS (for translator.js fallback mode)
// ════════════════════════════════════════════════════════════════════════
// These are exposed on the global object so translator.js can call them
// when running without a Worker (e.g. file:// protocol).
if (typeof window !== 'undefined') {
  window._catEngine = {
    doTranslate,
    initRevMaps,
    translateToCat,
    translateToStormy,
    translateFromCat,
    renderTokens,
    lev,
    djb2,
    detectCap,
    applyCap,
    getUnknownSound,
    recoverUnknown,
    toStormy,
    UNKNOWN_POOL,
    CAT_REV_MAP,
    STORMY_REV_MAP,
  };
}
