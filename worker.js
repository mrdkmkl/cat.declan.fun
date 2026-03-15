// ════════════════════════════════════════════════════════════════════════
//  worker.js  —  Cat Translator Core Engine  v5.0
//  1200+ line advanced translation engine with:
//    · Multi-algorithm reverse decryption (exact, phonetic, fuzzy, n-gram)
//    · Random message generator (cat & stormy phrase banks)
//    · Jaro-Winkler + Levenshtein hybrid similarity scoring
//    · Phonetic normalisation (vowel collapse, consonant grouping)
//    · N-gram fingerprint matching for long/mangled inputs
//    · Prefix/suffix trie-style token segmentation
//    · Capitalisation mirroring engine
//    · Stormy vowel extension with full round-trip support
//    · Session map for unknown word round-trips
//    · djb2 hash for consistent unknown-word pool assignment
//    · Self-test suite runs on load
// ════════════════════════════════════════════════════════════════════════

if (typeof importScripts === 'function') { importScripts('dictionary.js'); }

// ════════════════════════════════════════════════════════════════════════
//  §1  CONSTANTS & POOL
// ════════════════════════════════════════════════════════════════════════

const POOL = [
  'Mip', 'Pip', 'Prp', 'Fwip', 'Yip',
  'Tsst', 'Hff', 'Brrt', 'Prrp', 'Tsp',
  'Whff', 'Sft', 'Prk', 'Pft', 'Sqk',
  'Nrr', 'Frrp', 'Brrp', 'Grrt', 'Drrt',
  'Vrrp', 'Krrp', 'Wrrp', 'Zrrp', 'Jrrp',
  'Mew', 'Meow', 'Purr', 'Trill', 'Chirp',
  'Mrrow', 'Mrrrow', 'Mrrph', 'Nyaow', 'Mrowl',
  'Prrt', 'Mrrp', 'Nyow', 'Mrr', 'Sniff',
  'Nom', 'Yowl', 'Brrow', 'Mreow', 'Prrow',
  'Grrow', 'Trrow', 'Nrrow', 'Mewr', 'Meowr',
  'Purrr', 'Trillr', 'Chirpr', 'Mrrphr', 'Nyaowr',
  'Mrowlr', 'Prrtr', 'Mrrpr', 'Nyowr', 'Mrrr',
  'Sniffr', 'Nomr', 'Yowlr', 'Brrowr', 'Mreowr',
  'Mewrr', 'Meowrr', 'Purrrr', 'Trillrr', 'Chirprr',
  'Mrrrowrr', 'Mrrphrr', 'Nyaowrr', 'Mrowlrr', 'Prrtrr',
  'Mrrprr', 'Nyowrr', 'Mrrrr', 'Sniffrr', 'Nomrr',
  'Yowlrr', 'Brrowrr', 'Mreowrr', 'Mewl', 'Meowl',
  'Purrl', 'Trilll', 'Chirpl', 'Mrrowl', 'Mrrrowl',
  'Mrrphl', 'Nyaowl', 'Mrowll', 'Prrtl', 'Mrrpl',
  'Nyowl', 'Mrrl', 'Sniffl', 'Noml', 'Yowll',
  'Brrowl', 'Mreowl', 'Mewll', 'Meowll', 'Purrll',
  'Trillll', 'Chirpll', 'Mrrowll', 'Mrrrowll', 'Mrrphll',
  'Nyaowll', 'Mrowlll', 'Prrtll', 'Mrrpll', 'Nyowll',
  'Mrrll', 'Sniffll', 'Nomll', 'Yowlll', 'Brrowll',
  'Mreowll', 'Mewm', 'Meowm', 'Purrm', 'Trillm',
  'Chirpm', 'Mrrowm', 'Mrrrowm', 'Mrrphm', 'Nyaowm',
  'Mrowlm', 'Prrtm', 'Mrrpm', 'Nyowm', 'Mrrm',
  'Sniffm', 'Nomm', 'Yowlm', 'Brrowm', 'Mreowm',
  'Mewmm', 'Meowmm', 'Purrmm', 'Trillmm', 'Chirpmm',
  'Mrrowmm', 'Mrrrowmm', 'Mrrphmm', 'Nyaowmm', 'Mrowlmm',
  'Prrtmm', 'Mrrpmm', 'Nyowmm', 'Mrrmm', 'Sniffmm',
  'Nommmm', 'Yowlmm', 'Brrowmm', 'Mreowmm', 'Mewph',
  'Meowph', 'Purrph', 'Trillph', 'Chirpph', 'Mrrowph',
  'Mrrrowph', 'Mrrphph', 'Nyaowph', 'Mrowlph', 'Prrtph',
  'Mrrpph', 'Nyowph', 'Sniffph', 'Nomph', 'Yowlph',
  'Brrowph', 'Mreowph', 'Meww', 'Meoww', 'Purrw',
  'Trillw', 'Chirpw', 'Mrroww', 'Mrrroww', 'Mrrphw',
  'Nyaoww', 'Mrowlw', 'Prrtw', 'Mrrpw', 'Nyoww',
  'Mrrw', 'Sniffw', 'Nomw', 'Yowlw', 'Brroww',
  'Mreoww', 'MEOW', 'MROWRR', 'HISS', 'NYAOW',
  'CHIRP', 'MRRROW', 'MRROW', 'MRRP', 'TRILL',
  'YOWL', 'Mrroow', 'Mrrooow', 'Mrroooww', 'Meoow',
  'Meooow', 'Nyaaow', 'Purrrrr', 'Purrrrrr', 'Mrrrowww',
  'Chirrrp', 'Mrrrowllrrl', 'Mrrrowmmrrl', 'Mrrrowrrrrl', 'Mrrrowphrrl',
  'Mrrrowwrrl', 'Mrrrowwph', 'Nyaowrrl', 'Mrowlrrl', 'Prrtrrll',
  'Mrrprrll', 'Sniffrrll', 'Nomrrll', 'Yowlrrll',
];

// Verify no duplicates
(function(){
  const s = new Set(POOL);
  if (s.size !== POOL.length) console.warn('[CT] Pool dupes:', POOL.length - s.size);
})();

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

// ════════════════════════════════════════════════════════════════════════
//  §2  RANDOM PHRASE BANKS
//  Pre-built cat/stormy phrases for the random message button.
//  Each phrase is an array of cat sounds (tokens) that translate back
//  to coherent English sentences using the reverse map.
//  Phrases are stored as actual cat sounds so reverse lookup works
//  immediately when the user clicks "random."
// ════════════════════════════════════════════════════════════════════════

// These are English sentences we want as randoms — we'll translate them
// at runtime so they always match the current dictionary.
const RANDOM_EN_PHRASES_CAT = [
  "hello i am hungry please give me food now",
  "i want to sleep on the warm bed",
  "you are my friend i love you",
  "stop i am not happy about this",
  "give me treat or i will hiss",
  "i am the cat this is my home",
  "why is the door closed let me outside",
  "come here and pet me now",
  "i need food the bowl is empty",
  "i am going to knock this off the table",
  "you are late my food was supposed to be here",
  "do not touch my tail or i will bite",
  "i found a very comfortable spot on your face",
  "good morning give me breakfast now please",
  "i will sit here and stare at you",
  "the outside world is calling me open the door",
  "i am awake at three in the morning and i need you to know",
  "your laptop is warm and i am going to sleep on it",
  "i love you but also i am going to knock that over",
  "feed me now this is not a request",
];

const RANDOM_EN_PHRASES_STORMY = [
  "hello i am very hungry please give me food now",
  "i want to sleep on the warm soft bed forever",
  "you are my best friend i love you so much",
  "stop right now i am not happy about this at all",
  "give me every treat or i will hiss at you",
  "i am the most important cat this is my entire home",
  "why is the door closed let me go outside right now",
  "come here and pet me for a very long time now",
  "i need food immediately the bowl has been empty forever",
  "i am going to knock everything off this table",
  "you are very late my food was supposed to be here",
  "do not even think about touching my tail",
  "i have found the most comfortable spot on your face",
  "good morning give me breakfast right now please",
  "i will sit here and stare at you all day",
  "the outside world is calling me you must open the door",
  "i am awake and it is the middle of the night",
  "your laptop is warm and i am going to sleep on it now",
  "i love you but i am definitely going to knock that over",
  "feed me right now this is absolutely not a request",
];

// Runtime-translated phrase cache (populated lazily)
let _catPhraseCache    = null;
let _stormyPhraseCache = null;

function buildPhraseCatCache() {
  if (_catPhraseCache) return _catPhraseCache;
  _catPhraseCache = RANDOM_EN_PHRASES_CAT.map(phrase => {
    const tokens = translateToCat(phrase);
    return tokens
      .filter(t => t.type === 'word' || t.type === 'pass')
      .map(t => t.v)
      .join(' ')
      .replace(/<[^>]+>/g, '')
      .trim();
  });
  return _catPhraseCache;
}

function buildPhraseStormyCache() {
  if (_stormyPhraseCache) return _stormyPhraseCache;
  _stormyPhraseCache = RANDOM_EN_PHRASES_STORMY.map(phrase => {
    const tokens = translateToStormy(phrase);
    return tokens
      .filter(t => t.type === 'word' || t.type === 'pass')
      .map(t => t.v)
      .join(' ')
      .replace(/<[^>]+>/g, '')
      .trim();
  });
  return _stormyPhraseCache;
}

function getRandomPhrase(lang) {
  if (lang === 'stormy') {
    const cache = buildPhraseStormyCache();
    return cache[Math.floor(Math.random() * cache.length)];
  }
  const cache = buildPhraseCatCache();
  return cache[Math.floor(Math.random() * cache.length)];
}

// ════════════════════════════════════════════════════════════════════════
//  §3  UTILITY: HASHING, PASSTHROUGH, STORMY
// ════════════════════════════════════════════════════════════════════════

function djb2(word) {
  let h = 5381;
  for (let i = 0; i < word.length; i++)
    h = (((h << 5) + h) ^ word.charCodeAt(i)) >>> 0;
  return h;
}

function isPassthrough(token) {
  if (/^\d[\d.,:%]*$/.test(token)) return true;
  const l = token.toLowerCase();
  return COLORS.has(l) || NUMBER_WORDS.has(l);
}

function toStormy(sound) {
  return sound.replace(/([aeiouAEIOU]+)/g, m => m + m[Math.floor(m.length / 2)].repeat(4));
}

function censorWord(w) {
  return !w ? '*' : w.length === 1 ? '*' : w[0] + '*'.repeat(w.length - 1);
}

// ════════════════════════════════════════════════════════════════════════
//  §4  CAPITALISATION ENGINE
// ════════════════════════════════════════════════════════════════════════

function detectCap(token) {
  if (!token) return 'lower';
  const a = token.replace(/[^a-zA-Z]/g, '');
  if (!a) return 'lower';
  if (a.length > 1 && a === a.toUpperCase()) return 'upper';
  if (a[0] === a[0].toUpperCase()) return 'title';
  return 'lower';
}

function applyCap(pattern, word) {
  if (!word) return word;
  if (pattern === 'upper') return word.toUpperCase();
  if (pattern === 'title') return word[0].toUpperCase() + word.slice(1).toLowerCase();
  return word.toLowerCase();
}

function catSoundWithCap(storedSound, inputToken) {
  const p = detectCap(inputToken);
  if (p === 'upper') return storedSound.toUpperCase();
  if (p === 'title') return storedSound[0].toUpperCase() + storedSound.slice(1);
  return storedSound[0].toLowerCase() + storedSound.slice(1);
}

// ════════════════════════════════════════════════════════════════════════
//  §5  SESSION MAPS (unknown word round-trips)
// ════════════════════════════════════════════════════════════════════════

const SESSION_FWD = {};
const SESSION_REV = {};

function normKey(s) { return s.toLowerCase().replace(/[^a-z]/g, ''); }

function getUnknownSound(word) {
  const clean = word.toLowerCase().replace(/[^a-z']/g, '');
  if (!clean) return 'Mrrp';
  if (SESSION_FWD[clean]) return SESSION_FWD[clean];
  const idx = djb2(clean) % POOL.length;
  let sound = POOL[idx], offset = 0;
  while (SESSION_REV[normKey(sound)] && SESSION_REV[normKey(sound)] !== clean) {
    offset++;
    if (offset >= POOL.length) { sound = 'Mrrp' + clean.slice(0, 4); break; }
    sound = POOL[(idx + offset) % POOL.length];
  }
  SESSION_FWD[clean] = sound;
  SESSION_REV[normKey(sound)] = clean;
  return sound;
}

function recoverUnknown(catSound) {
  return SESSION_REV[normKey(catSound)] || null;
}

// ════════════════════════════════════════════════════════════════════════
//  §6  LEVENSHTEIN EDIT DISTANCE
//  Classic two-row DP. Used as one signal in multi-algorithm scoring.
// ════════════════════════════════════════════════════════════════════════

function lev(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  if (Math.abs(m - n) > 5) return Math.abs(m - n) + 1;
  let prev = new Array(n + 1), curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 0; i < m; i++) {
    curr[0] = i + 1;
    for (let j = 0; j < n; j++) {
      const c = a[i] === b[j] ? 0 : 1;
      curr[j + 1] = Math.min(curr[j] + 1, prev[j + 1] + 1, prev[j] + c);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

// ════════════════════════════════════════════════════════════════════════
//  §7  JARO-WINKLER SIMILARITY
//  Returns 0.0 (no match) to 1.0 (identical).
//  Better than edit distance for short strings and transpositions.
// ════════════════════════════════════════════════════════════════════════

function jaro(s1, s2) {
  if (s1 === s2) return 1;
  const l1 = s1.length, l2 = s2.length;
  if (l1 === 0 || l2 === 0) return 0;
  const matchDist = Math.max(Math.floor(Math.max(l1, l2) / 2) - 1, 0);
  const s1Matches = new Array(l1).fill(false);
  const s2Matches = new Array(l2).fill(false);
  let matches = 0, transpositions = 0;
  for (let i = 0; i < l1; i++) {
    const start = Math.max(0, i - matchDist);
    const end   = Math.min(i + matchDist + 1, l2);
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true; s2Matches[j] = true; matches++; break;
    }
  }
  if (matches === 0) return 0;
  let k = 0;
  for (let i = 0; i < l1; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }
  return (matches / l1 + matches / l2 + (matches - transpositions / 2) / matches) / 3;
}

function jaroWinkler(s1, s2, p = 0.1) {
  const j = jaro(s1, s2);
  let prefix = 0;
  for (let i = 0; i < Math.min(4, s1.length, s2.length); i++) {
    if (s1[i] === s2[i]) prefix++; else break;
  }
  return j + prefix * p * (1 - j);
}

// ════════════════════════════════════════════════════════════════════════
//  §8  PHONETIC NORMALISATION
//  Strips the "cat-ness" from a sound for fuzzy comparison.
//  Groups vowel runs, collapses repeated consonants, standardises known
//  cat morphemes (mrrr→mrr, rrrr→rr, etc.)
// ════════════════════════════════════════════════════════════════════════

function phoneticNorm(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z]/g, '')
    // Collapse vowel runs to single vowel
    .replace(/([aeiou])\1+/g, '$1')
    // Collapse consonant runs longer than 2 to 2
    .replace(/([bcdfghjklmnpqrstvwxyz])\1{2,}/g, '$1$1')
    // Map common cat-sound endings
    .replace(/ph+$/,  'f')
    .replace(/ll+/g,  'l')
    .replace(/mm+/g,  'm')
    .replace(/rr+/g,  'r')
    .replace(/ww+/g,  'w')
    .replace(/nn+/g,  'n')
    // Collapse repeated sounds
    .replace(/(.)\1+/g, '$1');
}

// ════════════════════════════════════════════════════════════════════════
//  §9  N-GRAM FINGERPRINT
//  Character bigrams and trigrams as a set.
//  Jaccard similarity of n-gram sets handles reordered/corrupted sounds.
// ════════════════════════════════════════════════════════════════════════

function ngrams(s, n) {
  const result = new Set();
  for (let i = 0; i <= s.length - n; i++) result.add(s.slice(i, i + n));
  return result;
}

function jaccardNgram(a, b, n = 2) {
  const ga = ngrams(a, n), gb = ngrams(b, n);
  if (ga.size === 0 && gb.size === 0) return 1;
  if (ga.size === 0 || gb.size === 0) return 0;
  let inter = 0;
  for (const g of ga) if (gb.has(g)) inter++;
  return inter / (ga.size + gb.size - inter);
}

// ════════════════════════════════════════════════════════════════════════
//  §10  COMPOSITE SIMILARITY SCORE
//  Combines Jaro-Winkler, phonetic Lev, and n-gram Jaccard into one score
//  from 0.0 (no match) to 1.0 (identical).
//
//  Weights:
//    Jaro-Winkler  40%  — good for short transpositions
//    Phonetic Lev  35%  — handles stretching / extra letters
//    Bigram Jaccard 25% — handles severely mangled inputs
// ════════════════════════════════════════════════════════════════════════

const JW_WEIGHT     = 0.40;
const PHON_WEIGHT   = 0.35;
const NGRAM_WEIGHT  = 0.25;
const MATCH_THRESHOLD = 0.60; // minimum score to count as a match

function compositeScore(input, candidate) {
  const normInput = phoneticNorm(input);
  const normCand  = phoneticNorm(candidate);

  // Jaro-Winkler on normalised strings
  const jw = jaroWinkler(normInput, normCand);

  // Phonetic Levenshtein converted to similarity
  const maxLen  = Math.max(normInput.length, normCand.length) || 1;
  const levDist = lev(normInput, normCand);
  const levSim  = Math.max(0, 1 - levDist / maxLen);

  // Bigram Jaccard on original (lowercased) strings
  const ng = jaccardNgram(input.toLowerCase(), candidate.toLowerCase(), 2);

  return jw * JW_WEIGHT + levSim * PHON_WEIGHT + ng * NGRAM_WEIGHT;
}

// ════════════════════════════════════════════════════════════════════════
//  §11  REVERSE LOOKUP MAP BUILDERS
//  Maps normKey(catSound) → { eng, label } for O(1) exact lookup.
// ════════════════════════════════════════════════════════════════════════

let CAT_REV_MAP    = null;
let STORMY_REV_MAP = null;
// Also pre-compute phonetic index: normPhonetic(sound) → [entries]
let CAT_PHON_INDEX    = null;
let STORMY_PHON_INDEX = null;

function buildRevMap(entries) {
  const map = {};
  for (const e of entries) {
    if (e.key && !map[e.key]) map[e.key] = e;
  }
  return map;
}

function buildPhonIndex(map) {
  const idx = {};
  for (const [key, entry] of Object.entries(map)) {
    const pk = phoneticNorm(key);
    if (!idx[pk]) idx[pk] = [];
    idx[pk].push({ key, entry });
  }
  return idx;
}

function initRevMaps() {
  if (CAT_REV_MAP) return; // already built
  if (typeof catDict === 'undefined') return;

  const catEntries = Object.entries(catDict).map(([eng, v]) => ({
    key: normKey(v.cat), eng, label: null, sound: v.cat,
  }));
  CAT_REV_MAP = buildRevMap(catEntries);
  CAT_PHON_INDEX = buildPhonIndex(CAT_REV_MAP);

  const stormyEntries = [];
  if (typeof stormySpecial !== 'undefined') {
    for (const [eng, v] of Object.entries(stormySpecial)) {
      stormyEntries.push({ key: normKey(v.stormy), eng, label: v.label, sound: v.stormy });
    }
  }
  for (const [eng, v] of Object.entries(catDict)) {
    const s = toStormy(v.cat);
    stormyEntries.push({ key: normKey(s), eng, label: null, sound: s });
  }
  STORMY_REV_MAP = buildRevMap(stormyEntries);
  STORMY_PHON_INDEX = buildPhonIndex(STORMY_REV_MAP);
}

// ════════════════════════════════════════════════════════════════════════
//  §12  MULTI-PASS REVERSE DECRYPTION
//  For each input token, tries five passes in order:
//    Pass 1: Exact match (normKey)
//    Pass 2: Session map (unknown word recovery)
//    Pass 3: Phonetic index lookup (fast pre-filter)
//    Pass 4: Composite-score fuzzy search over phonetic candidates
//    Pass 5: Full composite-score search over ALL map entries (last resort)
//  The first pass that yields a match above MATCH_THRESHOLD wins.
// ════════════════════════════════════════════════════════════════════════

function reverseToken(tok, map, phonIdx) {
  const key      = normKey(tok);
  const inputCap = detectCap(tok);

  // Pass 1: exact
  const exact = map[key];
  if (exact) return { entry: exact, pass: 1, score: 1.0 };

  // Pass 2: session map
  const recovered = recoverUnknown(tok);
  if (recovered) return {
    entry: { eng: recovered, label: null }, pass: 2, score: 1.0
  };

  // Pass 3 + 4: phonetic index candidates
  const phonKey = phoneticNorm(tok);
  const candidates = [];

  // Exact phonetic key
  if (phonIdx[phonKey]) {
    for (const c of phonIdx[phonKey]) {
      const sc = compositeScore(key, c.key);
      candidates.push({ entry: c.entry, score: sc });
    }
  }
  // Partial phonetic overlap — check keys whose phonetic starts/ends match
  for (const [pk, items] of Object.entries(phonIdx)) {
    if (pk === phonKey) continue; // already handled
    if (Math.abs(pk.length - phonKey.length) > 5) continue;
    const overlap = jaccardNgram(phonKey, pk, 2);
    if (overlap < 0.3) continue;
    for (const c of items) {
      const sc = compositeScore(key, c.key);
      if (sc > MATCH_THRESHOLD * 0.7) candidates.push({ entry: c.entry, score: sc });
    }
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    if (best.score >= MATCH_THRESHOLD) {
      return { entry: best.entry, pass: 4, score: best.score };
    }
  }

  // Pass 5: brute-force composite score over all entries
  let bestScore = -1, bestEntry = null;
  for (const [mKey, mEntry] of Object.entries(map)) {
    const sc = compositeScore(key, mKey);
    if (sc > bestScore) { bestScore = sc; bestEntry = mEntry; }
  }
  if (bestEntry && bestScore >= MATCH_THRESHOLD) {
    return { entry: bestEntry, pass: 5, score: bestScore };
  }

  return null; // no match
}

// ════════════════════════════════════════════════════════════════════════
//  §13  TOKENISER
// ════════════════════════════════════════════════════════════════════════

function tokenise(text) {
  return text.split(/(\s+|[,.!?;:'"()\[\]{}\-\/\\])/).filter(t => t != null && t !== '');
}
function isSpace(t) { return /^\s+$/.test(t); }
function isPunct(t) { return /^[,.!?;:'"()\[\]{}\-\/\\]+$/.test(t); }

// ════════════════════════════════════════════════════════════════════════
//  §14  FORWARD TRANSLATION  English → Cat
// ════════════════════════════════════════════════════════════════════════

function translateToCat(text) {
  if (!text || !text.trim()) return [];
  initRevMaps();
  const result = [];
  for (const tok of tokenise(text)) {
    if (isSpace(tok)) { result.push({ type: 'space', v: tok }); continue; }
    if (isPunct(tok)) { result.push({ type: 'punct', v: tok }); continue; }
    if (isPassthrough(tok)) { result.push({ type: 'pass', v: tok }); continue; }
    const clean = tok.toLowerCase().replace(/[^a-z']/g, '');
    const entry = (typeof catDict !== 'undefined') && catDict[clean];
    if (entry) {
      result.push({ type: 'word', mode: 'cat', conf: 'high',
                    v: catSoundWithCap(entry.cat, tok) });
    } else {
      result.push({ type: 'word', mode: 'cat', conf: 'low',
                    v: catSoundWithCap(getUnknownSound(clean || tok), tok) });
    }
  }
  return result;
}

// ════════════════════════════════════════════════════════════════════════
//  §15  FORWARD TRANSLATION  English → Stormy
// ════════════════════════════════════════════════════════════════════════

function translateToStormy(text) {
  if (!text || !text.trim()) return [];
  initRevMaps();
  const result = [];
  for (const tok of tokenise(text)) {
    if (isSpace(tok)) { result.push({ type: 'space', v: tok }); continue; }
    if (isPunct(tok)) { result.push({ type: 'punct', v: tok }); continue; }
    if (isPassthrough(tok)) { result.push({ type: 'pass', v: tok }); continue; }
    const clean = tok.toLowerCase().replace(/[^a-z']/g, '');
    const special = (typeof stormySpecial !== 'undefined') && stormySpecial[clean];
    if (special) {
      result.push({ type: 'word', mode: 'stormy-special', label: special.label,
                    conf: 'high', v: catSoundWithCap(special.stormy, tok) });
      continue;
    }
    const entry = (typeof catDict !== 'undefined') && catDict[clean];
    const base  = entry ? entry.cat : getUnknownSound(clean || tok);
    result.push({ type: 'word', mode: 'stormy', conf: entry ? 'high' : 'low',
                  v: catSoundWithCap(toStormy(base), tok) });
  }
  return result;
}

// ════════════════════════════════════════════════════════════════════════
//  §16  REVERSE TRANSLATION  Cat/Stormy → English
//  Uses multi-pass decryption (§12) per token.
// ════════════════════════════════════════════════════════════════════════

function translateFromAnimal(text, map, phonIdx) {
  if (!text || !text.trim()) return [];
  initRevMaps();
  // Apply word segmenter and alias pre-processing if available
  if (typeof preprocessInput === 'function' && map) text = preprocessInput(text, map);
  const rawTokens = text.trim().split(/(\s+)/).filter(t => t != null && t !== '');
  const result    = [];

  for (const tok of rawTokens) {
    if (isSpace(tok)) { result.push({ type: 'space', v: tok }); continue; }
    if (isPunct(tok)) { result.push({ type: 'punct', v: tok }); continue; }
    if (isPassthrough(tok)) { result.push({ type: 'pass', v: tok }); continue; }

    const inputCap = detectCap(tok);
    const match    = reverseTokenWithAlias(tok, map, phonIdx);

    if (match) {
      const isCurse = match.entry.label === 'curse';
      const raw     = isCurse ? censorWord(match.entry.eng) : match.entry.eng;
      const display = applyCap(inputCap, raw);
      const conf    = match.score >= 0.9 ? 'high' : match.score >= MATCH_THRESHOLD ? 'mid' : 'low';
      result.push({
        type: 'word',
        mode: match.entry.label ? 'stormy-special' : 'normal',
        label: match.entry.label,
        conf,
        pass: match.pass,
        score: match.score,
        v: display,
      });
    } else {
      result.push({ type: 'word', mode: 'unknown', conf: 'low', pass: 0, score: 0, v: tok });
    }
  }
  return result;
}

// ════════════════════════════════════════════════════════════════════════
//  §17  HTML RENDERER
// ════════════════════════════════════════════════════════════════════════

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderTokens(tokens, direction) {
  let html = '';
  for (const tok of tokens) {
    if (tok.type === 'space') { html += ' '; continue; }
    if (tok.type === 'punct') { html += esc(tok.v); continue; }
    if (tok.type === 'pass')  {
      html += `<span class="col-pass">${esc(tok.v)}</span>`; continue;
    }
    const v = esc(tok.v);

    if (direction === 'to-cat') {
      html += tok.conf === 'low'
        ? `<span class="col-low">${v}</span>`
        : `<span class="col-cat">${v}</span>`;

    } else if (direction === 'to-stormy') {
      if (tok.conf === 'low') {
        html += `<span class="col-low">${v}</span>`;
      } else if (tok.mode === 'stormy-special') {
        const cls = tok.label === 'curse' ? 'col-curse'
                  : tok.label === 'intense' ? 'col-intense' : 'col-vocab';
        html += `<span class="${cls}">${v}</span>`;
      } else {
        html += `<span class="col-stormy">${v}</span>`;
      }

    } else {
      // Reverse
      if (tok.mode === 'stormy-special') {
        const cls = tok.label === 'curse' ? 'col-curse'
                  : tok.label === 'intense' ? 'col-intense' : 'col-vocab';
        html += `<span class="${cls}">${v}</span>`;
      } else if (tok.conf === 'low' || tok.mode === 'unknown') {
        html += `<span class="col-low">${v}</span>`;
      } else if (tok.conf === 'mid') {
        // fuzzy match — slightly muted colour
        html += `<span class="col-cat col-fuzzy">${v}</span>`;
      } else {
        html += `<span class="col-cat">${v}</span>`;
      }
    }
  }
  return html;
}

// ════════════════════════════════════════════════════════════════════════
//  §18  MAIN doTranslate DISPATCHER
// ════════════════════════════════════════════════════════════════════════

function doTranslate(type, text) {
  initRevMaps();
  let tokens;
  switch (type) {
    case 'to-cat':
      tokens = translateToCat(text); break;
    case 'to-stormy':
      tokens = translateToStormy(text); break;
    case 'from-cat':
      tokens = translateFromAnimal(text, CAT_REV_MAP, CAT_PHON_INDEX); break;
    case 'from-stormy':
      tokens = translateFromAnimal(text, STORMY_REV_MAP, STORMY_PHON_INDEX); break;
    default:
      return '';
  }
  return renderTokens(tokens, type);
}

// ════════════════════════════════════════════════════════════════════════
//  §19  WORKER MESSAGE HANDLER
// ════════════════════════════════════════════════════════════════════════

if (typeof self !== 'undefined' && typeof WorkerGlobalScope !== 'undefined'
    && self instanceof WorkerGlobalScope) {
  self.onmessage = function(e) {
    const { id, type, text, lang } = e.data;
    if (type === 'random') {
      self.postMessage({ id, text: getRandomPhrase(lang || 'cat') });
      return;
    }
    const html = doTranslate(type, text);
    self.postMessage({ id, html });
  };
}

// ════════════════════════════════════════════════════════════════════════
//  §20  SCRIPT MODE EXPORTS (window context fallback)
// ════════════════════════════════════════════════════════════════════════

if (typeof window !== 'undefined') {
  window._catEngine = {
    doTranslate, initRevMaps, getRandomPhrase,
    translateToCat, translateToStormy, translateFromAnimal,
    renderTokens, lev, djb2, jaroWinkler, compositeScore,
    phoneticNorm, jaccardNgram, detectCap, applyCap,
    getUnknownSound, recoverUnknown, toStormy,
    POOL, CAT_REV_MAP, STORMY_REV_MAP,
  };
}

// ════════════════════════════════════════════════════════════════════════
//  §21  SELF-TEST SUITE
// ════════════════════════════════════════════════════════════════════════

(function selfTest() {
  if (typeof catDict === 'undefined') return;
  initRevMaps();

  // Lev tests
  const levCases = [['cat','cat',0],['cat','bat',1],['meow','mew',1],['purr','purrr',1]];
  for (const [a,b,e] of levCases) {
    if (lev(a,b) !== e) console.warn(`[CT] lev("${a}","${b}") wrong`);
  }

  // Jaro-Winkler sanity
  if (jaroWinkler('meow','meow') < 0.99) console.warn('[CT] JW identity failed');
  if (jaroWinkler('meow','ZZZZ') > 0.5)  console.warn('[CT] JW dissimilar too high');

  // PhoneticNorm idempotency
  const pn = phoneticNorm('Mrrroooow');
  if (pn !== phoneticNorm(pn)) console.warn('[CT] phoneticNorm not idempotent');

  // Cap round-trip
  const caps = [['MEOW','upper'],['Meow','title'],['meow','lower']];
  for (const [tok, expected] of caps) {
    if (detectCap(tok) !== expected) console.warn(`[CT] detectCap("${tok}") wrong`);
  }
  if (applyCap('upper','hello') !== 'HELLO') console.warn('[CT] applyCap upper wrong');
  if (applyCap('title','hello') !== 'Hello') console.warn('[CT] applyCap title wrong');
  if (applyCap('lower','HELLO') !== 'hello') console.warn('[CT] applyCap lower wrong');

  // Forward determinism
  const h1 = doTranslate('to-cat', 'hello world');
  const h2 = doTranslate('to-cat', 'hello world');
  if (h1 !== h2) console.warn('[CT] Forward not deterministic');


  // Random phrase bank builds without errors
  try {
    const p = getRandomPhrase('cat');
    if (!p || p.length === 0) console.warn('[CT] Random phrase empty');
  } catch(e) { console.warn('[CT] Random phrase error:', e.message); }
})();

// ════════════════════════════════════════════════════════════════════════
//  §22  EXTENDED PHONETIC ALIAS TABLE
//  Maps common misspellings / alternative spellings of cat sounds to
//  their canonical form. Applied during reverse lookup before the main
//  passes so users can type approximate sounds and still get good results.
//
//  Examples:
//    "mrow"   → treat as "mrrow"
//    "purrr"  → treat as "purr"
//    "meaow"  → treat as "meow"
//    "nyaow"  → exact (no change)
//    "hisss"  → treat as "hiss"
//    "chirrp" → treat as "chirp"
//    "triill" → treat as "trill"
// ════════════════════════════════════════════════════════════════════════

const PHONETIC_ALIASES = {
  // Vowel stretching variations
  'meaow':   'meow',  'miaow':  'meow',  'miaou': 'meow',   'miow':   'meow',
  'mrow':    'mrrow', 'mrow':   'mrrow', 'meow':  'meow',   'mreow':  'mreow',
  'purrrr':  'purr',  'purrr':  'purr',  'purrrrr':'purr',
  'hisss':   'hiss',  'hissss': 'hiss',  'hissssss':'hiss',
  'triill':  'trill', 'trrill': 'trill', 'trilll': 'trill',
  'chirrp':  'chirp', 'chrrp':  'chirp', 'chiirp': 'chirp',
  'nyow':    'nyow',  'nyaow':  'nyaow', 'nyaaow': 'nyaow',
  'mrrph':   'mrrph', 'mrph':   'mrrph', 'mrrrph': 'mrrph',
  'snif':    'sniff', 'sniif':  'sniff', 'snifff': 'sniff',
  'nom':     'nom',   'nomm':   'nomm',  'noom':   'nom',
  'prrt':    'prrt',  'prt':    'prrt',  'prrrt':  'prrt',
  'mrrp':    'mrrp',  'mrp':    'mrrp',  'mrrpp':  'mrrp',
  // Common typos
  'merrow':  'mrrow', 'merow':  'mrrow', 'meeow':  'meow',
  'puur':    'purr',  'purr':   'purr',  'purring':'purr',
  'yowl':    'yowl',  'youl':   'yowl',  'yowwl':  'yowl',
  'growl':   'growl', 'grrrowl':'growl', 'grrowl': 'growl',
  'howl':    'yowl',  'wail':   'mrrooow',
  // Casual human attempts at cat sounds
  'mew':     'mew',   'meww':   'meww',  'mewww':  'meww',
  'reow':    'mrrow', 'rrow':   'mrrow', 'row':    'mrrow',
  'nyan':    'nyaow', 'nya':    'nyaow',
  'brr':     'brrow', 'brrr':   'brrow',
  'frrp':    'frrp',  'frrpp':  'frrp',
  'prr':     'prrr',  'prrr':   'purrr',
};

// Apply alias table before main reverse lookup
function resolveAlias(token) {
  const lower = token.toLowerCase().replace(/[^a-z]/g, '');
  return PHONETIC_ALIASES[lower] || token;
}

// reverseTokenWithAlias: tries reverseToken with alias fallback (no redefinition)
function reverseTokenWithAlias(tok, map, phonIdx) {
  const direct = reverseToken(tok, map, phonIdx);
  if (direct && direct.score >= 0.9) return direct;
  const alias = resolveAlias(tok);
  if (alias !== tok) {
    const aliasResult = reverseToken(alias, map, phonIdx);
    if (aliasResult && (!direct || aliasResult.score > direct.score)) return aliasResult;
  }
  return direct;
}

// ════════════════════════════════════════════════════════════════════════
//  §23  STORMY-SPECIFIC REVERSE DECRYPTION HELPERS
//  Stormy sounds have extended vowels. Before reverse-looking up a Stormy
//  token, we attempt to "de-storm" it — collapse the extended vowel runs
//  back to their base form — and also try to look up the de-stormed
//  version as a cat sound (since all stormy sounds derive from cat sounds).
// ════════════════════════════════════════════════════════════════════════

// Collapse extended vowel runs (reverse of toStormy)
// "Mrrroooow" → "Mrrow", "Purrrrrr" → "Purr", "Meeeew" → "Mew"
function deStorm(sound) {
  // Collapse any vowel run of 3+ to just 2 (a minimal cat form)
  return sound.replace(/([aeiouAEIOU])\1{2,}/g, '$1$1');
}

// Extended reverse lookup for stormy: also tries deStorm version
function reverseTokenStormy(tok, map, phonIdx) {
  const direct = reverseTokenWithAlias(tok, map, phonIdx);
  if (direct && direct.score >= 0.85) return direct;
  const deStormed = deStorm(tok);
  if (deStormed !== tok) {
    const ds = reverseToken(deStormed, map, phonIdx);
    if (ds && (!direct || ds.score > direct.score)) return ds;
    if (CAT_REV_MAP) {
      const catResult = reverseToken(deStormed, CAT_REV_MAP, CAT_PHON_INDEX);
      if (catResult && (!direct || catResult.score > direct.score)) return catResult;
    }
  }
  return direct;
}

// ════════════════════════════════════════════════════════════════════════
//  §24  PHRASE CONFIDENCE SCORING
//  After translating a full phrase back to English, compute an overall
//  confidence score and return it alongside the HTML. This lets the UI
//  show a confidence indicator on the output pane.
// ════════════════════════════════════════════════════════════════════════

function phraseConfidence(tokens) {
  const words = tokens.filter(t => t.type === 'word');
  if (words.length === 0) return 1.0;
  const scores = words.map(t => {
    if (t.conf === 'high')  return 1.0;
    if (t.conf === 'mid')   return 0.65;
    if (t.conf === 'low')   return 0.2;
    return 0.2;
  });
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

function confidenceLabel(score) {
  if (score >= 0.9) return 'confident';
  if (score >= 0.7) return 'likely';
  if (score >= 0.5) return 'uncertain';
  return 'guessing';
}

// ════════════════════════════════════════════════════════════════════════
//  §25  ENHANCED doTranslate WITH CONFIDENCE
// ════════════════════════════════════════════════════════════════════════

function doTranslateWithMeta(type, text) {
  initRevMaps();
  let tokens;
  switch (type) {
    case 'to-cat':
      tokens = translateToCat(text); break;
    case 'to-stormy':
      tokens = translateToStormy(text); break;
    case 'from-cat':
      tokens = translateFromAnimal(text, CAT_REV_MAP, CAT_PHON_INDEX); break;
    case 'from-stormy': {
      // Use stormy-specific reverse with deStorm support
      if (!text || !text.trim()) { tokens = []; break; }
      initRevMaps();
      const rawToks = text.trim().split(/(\s+)/).filter(t => t != null && t !== '');
      tokens = [];
      for (const tok of rawToks) {
        if (isSpace(tok)) { tokens.push({ type: 'space', v: tok }); continue; }
        if (isPunct(tok)) { tokens.push({ type: 'punct', v: tok }); continue; }
        if (isPassthrough(tok)) { tokens.push({ type: 'pass', v: tok }); continue; }
        const inputCap = detectCap(tok);
        const match = reverseTokenStormy(tok, STORMY_REV_MAP, STORMY_PHON_INDEX);
        if (match) {
          const isCurse = match.entry.label === 'curse';
          const raw     = isCurse ? censorWord(match.entry.eng) : match.entry.eng;
          tokens.push({
            type: 'word', mode: match.entry.label ? 'stormy-special' : 'normal',
            label: match.entry.label,
            conf: match.score >= 0.9 ? 'high' : match.score >= MATCH_THRESHOLD ? 'mid' : 'low',
            pass: match.pass, score: match.score,
            v: applyCap(inputCap, raw),
          });
        } else {
          tokens.push({ type: 'word', mode: 'unknown', conf: 'low', pass: 0, score: 0, v: tok });
        }
      }
      break;
    }
    default:
      return { html: '', confidence: 1.0, label: 'confident' };
  }
  const html  = renderTokens(tokens, type);
  const score = phraseConfidence(tokens);
  return { html, confidence: score, label: confidenceLabel(score) };
}

// ════════════════════════════════════════════════════════════════════════
//  §26  RE-EXPORT UPDATED ENGINE TO WINDOW
// ════════════════════════════════════════════════════════════════════════

if (typeof window !== 'undefined') {
  Object.assign(window._catEngine || {}, {
    doTranslateWithMeta, deStorm, resolveAlias,
    reverseTokenStormy, phraseConfidence, confidenceLabel,
    PHONETIC_ALIASES,
  });
  window._catEngine = window._catEngine || {};
  window._catEngine.doTranslateWithMeta = doTranslateWithMeta;
  window._catEngine.getRandomPhrase     = getRandomPhrase;
  window._catEngine.doTranslate         = doTranslate;
  window._catEngine.initRevMaps         = initRevMaps;
}

// ════════════════════════════════════════════════════════════════════════
//  §27  PATCHED WORKER MESSAGE HANDLER (with confidence + random)
// ════════════════════════════════════════════════════════════════════════

if (typeof self !== 'undefined' && typeof WorkerGlobalScope !== 'undefined'
    && self instanceof WorkerGlobalScope) {
  self.onmessage = function(e) {
    const { id, type, text, lang } = e.data;
    if (type === 'random') {
      self.postMessage({ id, text: getRandomPhrase(lang || 'cat') });
      return;
    }
    const result = doTranslateWithMeta(type, text);
    self.postMessage({ id, html: result.html, confidence: result.confidence, confLabel: result.label });
  };
}

// ════════════════════════════════════════════════════════════════════════
//  §28  WORD SEGMENTER
//  When the user pastes a run-together string like "MrrrowMewPurr"
//  (no spaces), try to split it into recognisable tokens by greedily
//  matching the longest known sound from the left.
//  This dramatically improves decryption of copy-pasted output.
// ════════════════════════════════════════════════════════════════════════

function segmentCatString(input, map) {
  // Build a sorted array of known keys by length descending
  const keys = Object.keys(map).sort((a, b) => b.length - a.length);
  const lower = input.toLowerCase().replace(/[^a-z]/g, '');
  const tokens = [];
  let pos = 0;
  while (pos < lower.length) {
    let matched = false;
    for (const key of keys) {
      if (lower.startsWith(key, pos)) {
        tokens.push(key);
        pos += key.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      // Consume one character as an unknown fragment
      tokens.push(lower[pos]);
      pos++;
    }
  }
  return tokens.join(' ');
}

// Pre-process input: if no spaces detected and string looks like run-together
// cat sounds (no vowel-consonant pattern of natural language), try segmenting.
function preprocessInput(text, map) {
  const trimmed = text.trim();
  // If input has spaces, use as-is
  if (/\s/.test(trimmed)) return trimmed;
  // If it's a single short token, use as-is
  if (trimmed.length < 6) return trimmed;
  // Check if it looks like natural language (has spaces between words already)
  // vs run-together cat sound (all one word). Heuristic: no spaces + length > 8.
  if (trimmed.length > 8 && !/\s/.test(trimmed)) {
    const segmented = segmentCatString(trimmed, map);
    // Only use segmented version if it produced multiple tokens
    if (segmented.includes(' ')) return segmented;
  }
  return trimmed;
}

// ════════════════════════════════════════════════════════════════════════
//  §29  REVERSE TRANSLATION PATCH — apply pre-processing
// ════════════════════════════════════════════════════════════════════════

// §29 patch: preprocessInput applied inside translateFromAnimal directly
// We do NOT redefine translateFromAnimal to avoid hoisting issues.
// Instead, preprocessInput is called at the top of translateFromAnimal.
// See §16 — we patch it by inserting the call there at load time.

// ════════════════════════════════════════════════════════════════════════
//  §30  EXTENDED RANDOM PHRASE BANK
//  Additional themed phrase sets for more variety.
// ════════════════════════════════════════════════════════════════════════

const RANDOM_EN_PHRASES_EXTRA_CAT = [
  "i am watching you very carefully",
  "this chair is mine now please leave",
  "i knocked that over on purpose",
  "you were gone for five minutes and i missed you",
  "the red dot must be destroyed",
  "i do not understand why you are not giving me attention",
  "every night at exactly three i will walk on your face",
  "i have decided the clean laundry is my bed now",
  "your alarm is going off and i will help by sitting on you",
  "i am not stuck in the box i am choosing to be here",
  "the dog looked at me and now it must perish",
  "i require head scratches and i require them immediately",
  "this is fine i am fine everything is fine give me food",
  "you moved and now i have to restart my entire nap from scratch",
  "i have brought you a gift please be grateful it took effort",
];

const RANDOM_EN_PHRASES_EXTRA_STORMY = [
  "i am watching you with my entire soul",
  "this chair belongs to me forever and always",
  "i knocked that over completely on purpose and i would do it again",
  "you were gone for five whole minutes and i nearly perished",
  "the red dot is my eternal nemesis and i will destroy it",
  "i cannot comprehend why you are not giving me all of the attention",
  "every single night at precisely three i will stomp across your face",
  "i have made a very important decision about the clean laundry",
  "your alarm is absolutely going off and i will sit directly on top of you",
  "i am not trapped in the box i am a powerful being who chooses this",
  "the dog looked at me with its terrible eyes and now it must be destroyed",
  "i require extensive head scratches and i require them right now immediately",
  "everything is completely fine i am totally fine now please feed me",
  "you moved one millimeter and now i must restart my entire nap from scratch",
  "i have brought you a magnificent gift please appreciate this enormous effort",
];

// Merge extra phrases into main banks
RANDOM_EN_PHRASES_CAT.push(...RANDOM_EN_PHRASES_EXTRA_CAT);
RANDOM_EN_PHRASES_STORMY.push(...RANDOM_EN_PHRASES_EXTRA_STORMY);

// Invalidate cache since we added phrases
_catPhraseCache    = null;
_stormyPhraseCache = null;

// ════════════════════════════════════════════════════════════════════════
//  §31  CONFIDENCE BAR HTML BUILDER
//  Returns a small HTML snippet showing translation confidence level.
//  Injected by translator.js when displaying reverse-translation results.
// ════════════════════════════════════════════════════════════════════════

function buildConfidenceHTML(score, label) {
  const pct   = Math.round(score * 100);
  const color = score >= 0.9 ? 'var(--accent2)'
              : score >= 0.7 ? 'var(--accent)'
              : score >= 0.5 ? 'var(--intense)'
              : 'var(--curse)';
  return `<div class="conf-bar-wrap"><div class="conf-bar" style="width:${pct}%;background:${color}"></div><span class="conf-label">${label} (${pct}%)</span></div>`;
}

// ════════════════════════════════════════════════════════════════════════
//  §32  FINAL WORKER MESSAGE HANDLER (replaces §27, handles conf bar)
// ════════════════════════════════════════════════════════════════════════

if (typeof self !== 'undefined' && typeof WorkerGlobalScope !== 'undefined'
    && self instanceof WorkerGlobalScope) {
  self.onmessage = function(e) {
    const { id, type, text, lang } = e.data;
    if (type === 'random') {
      self.postMessage({ id, text: getRandomPhrase(lang || 'cat') });
      return;
    }
    if (type === 'from-cat' || type === 'from-stormy') {
      const result = doTranslateWithMeta(type, text);
      const confHTML = buildConfidenceHTML(result.confidence, result.label);
      self.postMessage({ id, html: result.html, confHTML, confidence: result.confidence });
    } else {
      const result = doTranslateWithMeta(type, text);
      self.postMessage({ id, html: result.html, confHTML: '', confidence: 1.0 });
    }
  };
}

// Update window export
if (typeof window !== 'undefined' && window._catEngine) {
  window._catEngine.buildConfidenceHTML = buildConfidenceHTML;
  window._catEngine.segmentCatString    = segmentCatString;
  window._catEngine.preprocessInput     = preprocessInput;
}

// ════════════════════════════════════════════════════════════════════════
//  §33  ADDITIONAL UTILITY: SOUND STATISTICS & DIAGNOSTICS
//  Exposed so the Words page can show useful info about the dictionary.
// ════════════════════════════════════════════════════════════════════════

function getDictStats() {
  if (typeof catDict === 'undefined') return {};
  const catSounds = Object.values(catDict).map(v => v.cat);
  const unique    = new Set(catSounds);
  const avgLen    = catSounds.reduce((a, b) => a + b.length, 0) / catSounds.length;
  return {
    totalWords:    Object.keys(catDict).length,
    uniqueSounds:  unique.size,
    avgSoundLen:   Math.round(avgLen * 10) / 10,
    stormySpecials: typeof stormySpecial !== 'undefined' ? Object.keys(stormySpecial).length : 0,
    poolSize:      POOL.length,
    sessionSize:   Object.keys(SESSION_FWD).length,
  };
}

// Export getDictStats
if (typeof window !== 'undefined' && window._catEngine) {
  window._catEngine.getDictStats = getDictStats;
}

// ════════════════════════════════════════════════════════════════════════
//  §34  FINAL SELF-TEST ADDENDUM
//  Tests the new §22-33 features after load.
// ════════════════════════════════════════════════════════════════════════

(function extendedSelfTest() {
  if (typeof catDict === 'undefined') return;
  initRevMaps();

  // Test alias resolution
  const aliasResult = resolveAlias('purrrrr');
  if (!aliasResult) console.warn('[CT] Alias resolution returned null');

  // Test deStorm
  const ds = deStorm('Mrrroooow');
  if (!ds || ds.length === 0) console.warn('[CT] deStorm returned empty');
  if (ds.length >= 'Mrrroooow'.length) console.warn('[CT] deStorm did not shorten');

  // Test phraseConfidence
  const fakeTokens = [
    { type: 'word', conf: 'high', v: 'hello' },
    { type: 'word', conf: 'low',  v: 'foo' },
    { type: 'space', v: ' ' },
  ];
  const conf = phraseConfidence(fakeTokens);
  if (conf <= 0 || conf > 1) console.warn('[CT] phraseConfidence out of range:', conf);

  // Test composite score identity
  const sc = compositeScore('meow', 'meow');
  if (sc < 0.99) console.warn('[CT] compositeScore identity < 1:', sc);

  // Test n-gram similarity
  const ng = jaccardNgram('meow', 'meow', 2);
  if (ng < 0.99) console.warn('[CT] jaccardNgram identity failed:', ng);

  // Test buildConfidenceHTML
  const bar = buildConfidenceHTML(0.85, 'likely');
  if (!bar.includes('conf-bar')) console.warn('[CT] buildConfidenceHTML missing class');

  // Test random phrase returns a string
  const rp = getRandomPhrase('cat');
  if (typeof rp !== 'string' || rp.length === 0) console.warn('[CT] getRandomPhrase failed');
  const rs = getRandomPhrase('stormy');
  if (typeof rs !== 'string' || rs.length === 0) console.warn('[CT] getRandomPhrase stormy failed');
})();
