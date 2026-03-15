// ═══════════════════════════════════════════════════════════════
//  worker.js — Cat Translator Web Worker
//  All translation logic runs here on a background thread.
//  Depends on: dictionary.js (loaded via importScripts)
//
//  Features:
//   • Deterministic: every word always maps to the same cat sound
//   • Unknown words: djb2 hash → single cat sound from pool (no chaining)
//   • Reverse: greedy longest-match + Levenshtein fuzzy fallback
//   • Capitalisation: ALL CAPS input → ALL CAPS output,
//                     Capitalised input → Capitalised output
//   • Stormy: vowel clusters extended by 4 chars
// ═══════════════════════════════════════════════════════════════

importScripts('dictionary.js');

// ── Stormy vowel extension ────────────────────────────────────────
function toStormy(w) {
  return w.replace(/([aeiouAEIOU]+)/g, m => m + m[Math.floor(m.length / 2)].repeat(4));
}

// ── Censor curse words ───────────────────────────────────────────
function censor(w) {
  return w.length <= 1 ? '*' : w[0] + '*'.repeat(w.length - 1);
}

// ── Pass-through sets (colours and numbers) ──────────────────────
const COLORS = new Set([
  'red','orange','yellow','green','blue','purple','pink','brown','black',
  'white','gray','grey','cyan','magenta','maroon','navy','teal','indigo',
  'violet','gold','silver','beige','tan','cream','lavender','lime','coral',
  'salmon','turquoise','crimson','scarlet','amber','ivory','bronze','copper',
]);
const NUMBERS = new Set([
  'zero','one','two','three','four','five','six','seven','eight','nine','ten',
  'eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen',
  'eighteen','nineteen','twenty','thirty','forty','fifty','sixty','seventy',
  'eighty','ninety','hundred','thousand','million','billion',
]);
function isPassthrough(t) {
  if (/^\d[\d.,]*$/.test(t)) return true;
  const l = t.toLowerCase();
  return COLORS.has(l) || NUMBERS.has(l);
}

// ════════════════════════════════════════════════════════════════
//  UNKNOWN WORD POOL — 200 unique letter-only cat sounds
//  djb2 hashes an unknown word → slot in this pool.
//  One word → one clean sound. No composition, no chaining.
// ════════════════════════════════════════════════════════════════
const POOL = [
  'Mip', 'Pip', 'Prp', 'Fwip', 'Yip',
  'Tsst', 'Hff', 'Brrt', 'Prrp', 'Tsp',
  'Whff', 'Sft', 'Prk', 'Pft', 'Sqk',
  'Nrr', 'Frrp', 'Brrp', 'Grrt', 'Drrt',
  'Mew', 'Meow', 'Purr', 'Trill', 'Chirp',
  'Mrrow', 'Mrrrow', 'Mrrph', 'Nyaow', 'Mrowl',
  'Prrt', 'Mrrp', 'Nyow', 'Mrr', 'Sniff',
  'Nom', 'Yowl', 'Brrow', 'Mreow', 'Prrow',
  'Meww', 'Meoww', 'Purrw', 'Trillw', 'Chirpw',
  'Mrroww', 'Mrrroww', 'Mrrphw', 'Nyaoww', 'Mrowlw',
  'Prrtw', 'Mrrpw', 'Nyoww', 'Mrrw', 'Sniffw',
  'Nomw', 'Yowlw', 'Brroww', 'Mreoww', 'Prroww',
  'Mewrr', 'Meowrr', 'Purrrr', 'Trillrr', 'Chirprr',
  'Mrrowrr', 'Mrrrowrr', 'Mrrphrr', 'Nyaowrr', 'Mrowlrr',
  'Prrtrr', 'Mrrprr', 'Nyowrr', 'Mrrrr', 'Sniffrr',
  'Nomrr', 'Yowlrr', 'Brrowrr', 'Mreowrr', 'Prrowrr',
  'Mewph', 'Meowph', 'Purrph', 'Trillph', 'Chirpph',
  'Mrrowph', 'Mrrrowph', 'Mrrphph', 'Nyaowph', 'Mrowlph',
  'Prrtph', 'Mrrpph', 'Nyowph', 'Mrrphww', 'Sniffph',
  'Nomph', 'Yowlph', 'Brrowph', 'Mreowph', 'Prrowph',
  'Mewll', 'Meowll', 'Purrll', 'Trilll', 'Chirpll',
  'Mrrowll', 'Mrrrowll', 'Mrrphll', 'Nyaowll', 'Mrowlll',
  'Prrtll', 'Mrrpll', 'Nyowll', 'Mrrll', 'Sniffll',
  'Nomll', 'Yowlll', 'Brrowll', 'Mreowll', 'Prrowll',
  'Mewmm', 'Meowmm', 'Purrmm', 'Trillmm', 'Chirpmm',
  'Mrrowmm', 'Mrrrowmm', 'Mrrphmm', 'Nyaowmm', 'Mrowlmm',
  'Prrtmm', 'Mrrpmm', 'Nyowmm', 'Mrrmm', 'Sniffmm',
  'Nommm', 'Yowlmm', 'Brrowmm', 'Mreowmm', 'Prrowmm',
  'Mrrooow', 'Mrroooow', 'Mrrooooww', 'Nyaaow', 'Mrowwl',
  'Purrrrr', 'Purrrrmm', 'Purrrrll', 'Purrrrph', 'Purrrrww',
  'Mrrrowww', 'Mrrrowwph', 'Mrrrowwll', 'Mrrrowwmm', 'Mrrrowwrr',
  'Meooow', 'Meoooow', 'Nyaaaow', 'Mrowwwl', 'Chirrrp',
  'MEOW', 'MROWRR', 'HISS', 'NYAOW', 'CHIRP',
  'MRRROW', 'MRROW', 'MRRP', 'TRILL', 'YOWL',
  'GROWL', 'MROWL', 'SCREECH', 'SNARF', 'CHRRP',
  'MREOW', 'WROWL', 'GROWR', 'BRRROW', 'SNRRL',
  'Nom nom', 'Mew mew', 'Chirp chirp', 'Prrt prrt', 'Purr purr',
  'Hiss hiss', 'Sniff mew', 'Nom mew', 'Chirp mew', 'Mrrrow mew',
  'Nyaow mew', 'Meow mew', 'Mrrph mew', 'Mrowl mew', 'Trill mew',
  'Sniff meww', 'Nom meww', 'Chirp meww', 'Purr mew', 'Hiss mew',
];

// Verify pool uniqueness
const _ps = new Set(POOL);
if (_ps.size !== POOL.length) {
  console.warn('Worker: pool has', POOL.length - _ps.size, 'duplicate entries');
}

// ── djb2 hash (pure JS — same algorithm as hash.c) ───────────────
function djb2(word) {
  let h = 5381;
  for (let i = 0; i < word.length; i++)
    h = (((h << 5) + h) ^ word.charCodeAt(i)) >>> 0;
  return h;
}

// ── Levenshtein edit distance (pure JS — same as hash.c lev()) ───
// Used for fuzzy reverse translation matching.
function lev(a, b) {
  const m = a.length, n = b.length;
  let prev = Array.from({length: n + 1}, (_, i) => i);
  let curr = new Array(n + 1);
  for (let i = 0; i < m; i++) {
    curr[0] = i + 1;
    for (let j = 0; j < n; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      curr[j + 1] = Math.min(curr[j] + 1, prev[j + 1] + 1, prev[j] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

// ── Session maps: unknown word ↔ cat sound ───────────────────────
const fwd = {};   // clean english → cat sound
const rev = {};   // normalised cat sound → clean english

function normKey(s) { return s.toLowerCase().replace(/[^a-z ]/g, '').trim(); }

function unknownSound(word) {
  const clean = word.toLowerCase().replace(/[^a-z']/g, '');
  if (!clean) return 'Mrrp';
  if (fwd[clean]) return fwd[clean];
  const idx = djb2(clean) % POOL.length;
  let sound = POOL[idx];
  let offset = 0;
  while (rev[normKey(sound)] && rev[normKey(sound)] !== clean) {
    offset++;
    if (offset >= POOL.length) { sound = clean + 'mew'; break; }
    sound = POOL[(idx + offset) % POOL.length];
  }
  fwd[clean] = sound;
  rev[normKey(sound)] = clean;
  return sound;
}

function recoverUnknown(catSound) {
  return rev[normKey(catSound)] || null;
}

// ════════════════════════════════════════════════════════════════
//  CAPITALISATION HELPERS
//  Match the capitalisation pattern of the input cat token
//  and apply it to the output English word.
// ════════════════════════════════════════════════════════════════
function capPattern(token) {
  if (token === token.toUpperCase() && /[A-Z]/.test(token)) return 'upper';
  if (/^[A-Z]/.test(token)) return 'title';
  return 'lower';
}

function applyCapPattern(pattern, word) {
  if (!word) return word;
  if (pattern === 'upper') return word.toUpperCase();
  if (pattern === 'title') return word[0].toUpperCase() + word.slice(1).toLowerCase();
  return word.toLowerCase();
}

// ════════════════════════════════════════════════════════════════
//  BUILD REVERSE LOOKUP MAPS
//  Maps normalised cat sound → { eng, label } for reverse translation.
//  Sorted longest-first so greedy multi-token matching works correctly.
// ════════════════════════════════════════════════════════════════
function buildRevMap(entries) {
  const map = {};
  // Sort longest key first so greedy takes "Nom mew" before "Nom"
  entries.sort((a, b) => b.key.length - a.key.length);
  for (const e of entries) {
    if (e.key && !map[e.key]) map[e.key] = e;
  }
  return map;
}

const catRevMap = buildRevMap(
  Object.entries(catDict).map(([eng, v]) => ({
    key: normKey(v.cat), eng, label: null
  }))
);

const stormyRevMap = buildRevMap([
  ...Object.entries(stormySpecial).map(([eng, v]) => ({
    key: normKey(v.stormy), eng, label: v.label
  })),
  ...Object.entries(catDict).map(([eng, v]) => ({
    key: normKey(toStormy(v.cat)), eng, label: null
  })),
]);

// ════════════════════════════════════════════════════════════════
//  TRANSLATION FUNCTIONS
// ════════════════════════════════════════════════════════════════

function tokenise(text) {
  return text.split(/(\s+|[,.!?;:'"()\-])/).filter(t => t != null && t !== '');
}

// ── English → Cat (deterministic, one word = one sound) ──────────
function toCat(text) {
  const result = [];
  for (const tok of tokenise(text)) {
    if (/^\s+$/.test(tok)) { result.push({type:'space', v:tok}); continue; }
    if (/^[,.!?;:'"()\-]+$/.test(tok)) { result.push({type:'punct', v:tok}); continue; }
    if (isPassthrough(tok)) { result.push({type:'pass', v:tok}); continue; }
    const clean = tok.toLowerCase().replace(/[^a-z']/g, '');
    const entry = catDict[clean];
    const sound = entry ? entry.cat : unknownSound(clean || tok);
    result.push({type:'word', mode:'cat', conf: entry ? 'high' : 'low', v: sound});
  }
  return result;
}

// ── English → Stormy ─────────────────────────────────────────────
function toStormyTranslate(text) {
  const result = [];
  for (const tok of tokenise(text)) {
    if (/^\s+$/.test(tok)) { result.push({type:'space', v:tok}); continue; }
    if (/^[,.!?;:'"()\-]+$/.test(tok)) { result.push({type:'punct', v:tok}); continue; }
    if (isPassthrough(tok)) { result.push({type:'pass', v:tok}); continue; }
    const clean = tok.toLowerCase().replace(/[^a-z']/g, '');
    if (stormySpecial[clean]) {
      const s = stormySpecial[clean];
      result.push({type:'word', mode:'stormy-special', label:s.label, conf:'high', v:s.stormy});
      continue;
    }
    const entry = catDict[clean];
    const base  = entry ? entry.cat : unknownSound(clean || tok);
    result.push({type:'word', mode:'stormy', conf: entry ? 'high' : 'low', v: toStormy(base)});
  }
  return result;
}

// ── Cat/Stormy → English ──────────────────────────────────────────
// Greedy longest-match with Levenshtein fuzzy fallback (threshold 2).
function fromCat(text, map) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const result = [];
  let i = 0;

  while (i < words.length) {
    // Record cap pattern of first token in this chunk
    const inputCap = capPattern(words[i]);
    let matched = false;

    // Try 4, 3, 2, 1 tokens (longest first)
    for (let len = Math.min(4, words.length - i); len >= 1; len--) {
      const chunk = words.slice(i, i + len).join(' ');
      const key   = normKey(chunk);
      const entry = map[key];
      if (entry) {
        const isCurse = entry.label === 'curse';
        const raw     = isCurse ? censor(entry.eng) : entry.eng;
        const display = applyCapPattern(inputCap, raw);
        result.push({type:'word', mode: entry.label ? 'stormy-special' : 'normal',
                     label: entry.label, conf:'high', v: display});
        i += len; matched = true; break;
      }
    }

    if (!matched) {
      // Check session map (unknown round-trip)
      const recovered = recoverUnknown(words[i]);
      if (recovered) {
        result.push({type:'word', mode:'recovered', conf:'high',
                     v: applyCapPattern(inputCap, recovered)});
        i++; matched = true;
      }
    }

    if (!matched) {
      // Levenshtein fuzzy match (max distance 2)
      const key = normKey(words[i]);
      let bestEntry = null, bestDist = Infinity;
      for (const [mKey, mEntry] of Object.entries(map)) {
        const d = lev(key, mKey);
        if (d < bestDist && d <= 2) { bestDist = d; bestEntry = mEntry; }
      }
      if (bestEntry) {
        const isCurse = bestEntry.label === 'curse';
        const raw     = isCurse ? censor(bestEntry.eng) : bestEntry.eng;
        result.push({type:'word', mode:'fuzzy', conf:'low',
                     v: applyCapPattern(inputCap, raw)});
      } else {
        result.push({type:'word', mode:'unknown', conf:'low', v: words[i]});
      }
      i++;
    }

    if (i < words.length) result.push({type:'space', v:' '});
  }
  return result;
}

// ════════════════════════════════════════════════════════════════
//  RENDER TOKENS → HTML
// ════════════════════════════════════════════════════════════════
function render(tokens, dir) {
  let html = '';
  for (const tok of tokens) {
    if (tok.type === 'space') { html += ' '; continue; }
    if (tok.type === 'punct') { html += tok.v; continue; }
    if (tok.type === 'pass')  { html += `<span class="col-pass">${tok.v}</span>`; continue; }

    if (dir === 'to-cat') {
      html += `<span class="${tok.conf === 'low' ? 'col-low' : 'col-cat'}">${tok.v}</span>`;

    } else if (dir === 'to-stormy') {
      if (tok.conf === 'low') {
        html += `<span class="col-low">${tok.v}</span>`;
      } else if (tok.mode === 'stormy-special') {
        const cls = tok.label === 'curse'   ? 'col-curse'
                  : tok.label === 'intense' ? 'col-intense' : 'col-vocab';
        html += `<span class="${cls}">${tok.v}</span>`;
      } else {
        html += `<span class="col-stormy">${tok.v}</span>`;
      }

    } else {
      // Reverse direction
      if (tok.mode === 'stormy-special') {
        const cls = tok.label === 'curse'   ? 'col-curse'
                  : tok.label === 'intense' ? 'col-intense' : 'col-vocab';
        html += `<span class="${cls}">${tok.v}</span>`;
      } else if (tok.conf === 'low') {
        html += `<span class="col-low">${tok.v}</span>`;
      } else {
        html += `<span class="col-cat">${tok.v}</span>`;
      }
    }
  }
  return html;
}

// ── Message handler ───────────────────────────────────────────────
self.onmessage = function(e) {
  const { id, type, text } = e.data;
  let tokens;
  if      (type === 'to-cat')      tokens = toCat(text);
  else if (type === 'to-stormy')   tokens = toStormyTranslate(text);
  else if (type === 'from-cat')    tokens = fromCat(text, catRevMap);
  else if (type === 'from-stormy') tokens = fromCat(text, stormyRevMap);
  else { self.postMessage({id, html:''}); return; }
  self.postMessage({id, html: render(tokens, type)});
};
