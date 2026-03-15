// ═══════════════════════════════════════════════════════
//  worker.js — Cat Translator Web Worker
//  Runs translation logic on a background thread.
//  Communicates with translator.js via postMessage.
// ═══════════════════════════════════════════════════════

importScripts('dictionary.js');

// ── Pass-through sets ─────────────────────────────────
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
function toStormy(w) {
  return w.replace(/([oOaAeEiIuUrR~]+)/g, m => m + m[Math.floor(m.length / 2)].repeat(4));
}

function censorWord(w) {
  return w.length <= 1 ? '*' : w[0] + '*'.repeat(w.length - 1);
}
function coinFlip() { return Math.random() < 0.5; }

// ═══════════════════════════════════════════════════════
//  UNKNOWN WORD → SINGLE CAT SOUND
//  Each unknown word is hashed to one short cat sound.
//  No composition, no chaining — just one clean sound.
//  200 curated sounds, each unique and short.
// ═══════════════════════════════════════════════════════
const UNKNOWN_POOL = [
  'Mew', 'Prrt', 'Mrrp', 'Purr', 'Trill',
  'Sniff', 'Chirp', 'Mrr', 'Nyow', 'Prrp',
  'Brrt', 'Fwip', 'Tsst', 'Hff', 'Prp',
  'Mip', 'Twip', 'Nrr', 'Frrp', 'Yip',
  'Meow', 'Mrrph', 'Mrrow', 'Mrowl', 'Nyaow',
  'Chirrow', 'Mreow', 'Trrll', 'Snrrow', 'Prrow',
  'Brrp', 'Grrow', 'Yowl', 'Wrrow', 'Trrow',
  'Mrrow!', 'Nrrow', 'Flrrow', 'Blrrow', 'Crrow',
  'Mrrrow', 'Purrrr', 'Mrrooow', 'Meoow', 'Maoow',
  'Nyaaow', 'Mrowwl', 'Churrow', 'Prrrrow', 'Trrowl',
  'Mreow!', 'Yoowl', 'Wroowl', 'Groowl', 'Broowl',
  'Snoowl', 'Floowl', 'Bloowl', 'Clrowl', 'Srowl',
  'MEOW', 'MROWRR', 'HISS', 'NYAOW', 'CHIRP',
  'MRRROW', 'MRROW', 'MRRP', 'HISSS', 'TRILL',
  'YOWL', 'GROWL', 'SCREECH', 'MROWL', 'SNARF',
  'CHRRP', 'MREOW', 'WROWL', 'GROWR', 'BRRROW',
  'Mew-mew', 'Prrt-prrt', 'Chirp-mew', 'Mrrp-mew', 'Purr-mew',
  'Hiss-mew', 'Trill-mew', 'Mrow-mew', 'Nyow-mew', 'Sniff-mew',
  'Mrrph-mew', 'Mrrrow-mew', 'Mrowl-mew', 'Nyaow-mew', 'Mreow-mew',
  'Mew-prrt', 'Mew-mrrp', 'Mew-purr', 'Mew-chirp', 'Mew-hiss',
  'Prrt-mew', 'Mrrp-prrt', 'Purr-prrt', 'Chirp-prrt', 'Hiss-prrt',
  'Nom-mew', 'Nom-prrt', 'Nom-chirp', 'Nom-purr', 'Nom-mrrp',
  'Mew!', 'Prrt!', 'Mrrp!', 'Chirp!', 'MEOW!',
  'Mrrrow!', 'MROWRR!', 'Nyaow!', 'Mrowl!', 'HISS!',
  'Mew~', 'Purr~', 'Mrrp~', 'Trill~', 'Mrrrow~',
  'Mrrph~', 'Mrowl~', 'Nyaow~', 'Mreow~', 'Yowl~',
  'Mew.', 'Prrt.', 'Mrrp.', 'Purr.', 'Mrrrow.',
  'Mrrph.', 'Hiss.', 'Mrowl.', 'Nyaow.', 'MEOW.',
  'Mrrup', 'Frrp!', 'Brrpt', 'Snrrp', 'Clrrp',
  'Trrpt', 'Wrrp', 'Grrpt', 'Drrp', 'Zrrp',
  'Mrrup~', 'Frrp~', 'Brrpt~', 'Snrrp~', 'Clrrp~',
  'Trrpt~', 'Wrrp~', 'Grrpt~', 'Drrp~', 'Zrrp~',
  'Chirp chirp', 'Mew mew', 'Prrt prrt', 'Purr purr', 'Mrrp mrrp',
  'Hiss hiss', 'Meow meow', 'Mrrrow mew', 'Nyaow mew', 'Chirp mrrp',
  'Mrrph mew', 'Mrowl mew', 'Trill mew', 'Sniff mrrp', 'Nom nom',
  'Mew mew!', 'Chirp chirp!', 'MEOW MEOW', 'HISS HISS', 'Purr purr~',
];

// djb2 hash — deterministic, consistent across calls
function hashWord(word) {
  let h = 5381;
  for (let i = 0; i < word.length; i++) {
    h = ((h << 5) + h) ^ word.charCodeAt(i);
    h = h >>> 0; // unsigned 32-bit
  }
  return h;
}

// Session maps: unknown word ↔ cat sound (round-trip)
const sessionFwd = {}; // clean english → cat sound
const sessionRev = {}; // cat sound key → clean english

function unknownKey(s) { return s.toLowerCase().replace(/[^a-z\-!~. ]/g, '').trim(); }

function getUnknownSound(word) {
  const clean = word.toLowerCase().replace(/[^a-z']/g, '');
  if (!clean) return 'Mrrp';
  if (sessionFwd[clean]) return sessionFwd[clean];

  const idx = hashWord(clean) % UNKNOWN_POOL.length;
  let sound = UNKNOWN_POOL[idx];

  // Collision: same sound already mapped to a different word → try neighbours
  let offset = 0;
  while (sessionRev[unknownKey(sound)] && sessionRev[unknownKey(sound)] !== clean) {
    offset++;
    sound = UNKNOWN_POOL[(idx + offset) % UNKNOWN_POOL.length];
    if (offset > UNKNOWN_POOL.length) { sound = clean + '-mew'; break; }
  }

  sessionFwd[clean] = sound;
  sessionRev[unknownKey(sound)] = clean;
  return sound;
}

function lookupUnknownRev(catSound) {
  return sessionRev[unknownKey(catSound)] || null;
}

// ── Build longest-match reverse map ──────────────────
// Sorts all known sounds longest-first so greedy matching
// can correctly handle multi-word sounds like "Nom mew"
function buildCatReverseMap() {
  const entries = [];
  for (const [eng, entry] of Object.entries(catDict)) {
    entries.push({ key: unknownKey(entry.cat), eng, label: null });
  }
  // sort longest key first
  entries.sort((a, b) => b.key.length - a.key.length);
  return entries;
}

function buildStormyReverseMap() {
  const entries = [];
  for (const [eng, entry] of Object.entries(stormySpecial)) {
    entries.push({ key: unknownKey(entry.stormy), eng, label: entry.label });
  }
  for (const [eng, entry] of Object.entries(catDict)) {
    entries.push({ key: unknownKey(toStormy(entry.cat)), eng, label: null });
  }
  entries.sort((a, b) => b.key.length - a.key.length);
  return entries;
}

const catReverseList    = buildCatReverseMap();
const stormyReverseList = buildStormyReverseMap();

// Build fast lookup maps from the sorted entries
function buildFastMap(list) {
  const map = {};
  for (const e of list) {
    if (!map[e.key]) map[e.key] = e;
  }
  return map;
}
const catFastMap    = buildFastMap(catReverseList);
const stormyFastMap = buildFastMap(stormyReverseList);

// ── Tokenize preserving punctuation ──────────────────
function tokenize(text) {
  return text.split(/(\s+|[,.!?;:'"()\-])/).filter(t => t !== undefined);
}

// ── English → Cat ─────────────────────────────────────
function translateToCat(text) {
  const tokens = tokenize(text);
  const result = [];
  for (const token of tokens) {
    if (!token) continue;
    if (/^\s+$/.test(token)) { result.push({ type:'space', value:token }); continue; }
    if (/^[,.!?;:'"()\-]+$/.test(token)) { result.push({ type:'punct', value:token }); continue; }
    if (isPassthrough(token)) { result.push({ type:'passthrough', value:token }); continue; }
    const clean = token.toLowerCase().replace(/[^a-z']/g, '');
    const entry = catDict[clean];
    if (entry) {
      result.push({ type:'word', mode:'cat', value: coinFlip() ? entry.cat : 'Meow', confidence:'high' });
    } else {
      result.push({ type:'word', mode:'cat', value: getUnknownSound(clean || token), confidence:'low' });
    }
  }
  return result;
}

// ── English → Stormy ──────────────────────────────────
function translateToStormy(text) {
  const tokens = tokenize(text);
  const result = [];
  for (const token of tokens) {
    if (!token) continue;
    if (/^\s+$/.test(token)) { result.push({ type:'space', value:token }); continue; }
    if (/^[,.!?;:'"()\-]+$/.test(token)) { result.push({ type:'punct', value:token }); continue; }
    if (isPassthrough(token)) { result.push({ type:'passthrough', value:token }); continue; }
    const clean = token.toLowerCase().replace(/[^a-z']/g, '');
    if (stormySpecial[clean]) {
      const s = stormySpecial[clean];
      result.push({ type:'word', mode:'stormy-special', value:s.stormy, label:s.label, confidence:'high' });
      continue;
    }
    const entry = catDict[clean];
    if (entry) {
      result.push({ type:'word', mode:'stormy', value: toStormy(coinFlip() ? entry.cat : 'Meow'), confidence:'high' });
    } else {
      result.push({ type:'word', mode:'stormy', value: toStormy(getUnknownSound(clean || token)), confidence:'low' });
    }
  }
  return result;
}

// ── Greedy longest-match reverse translation ──────────
// Tries to match the most tokens at once against known
// multi-word sounds before falling back to single tokens
function translateFromCat(text, lang) {
  const fastMap = lang === 'stormy' ? stormyFastMap : catFastMap;
  const tokens  = text.trim().split(/\s+/).filter(Boolean);
  const result  = [];
  let i = 0;

  while (i < tokens.length) {
    // Try matching 4, 3, 2, 1 tokens (longest first)
    let matched = false;
    for (let len = Math.min(4, tokens.length - i); len >= 1; len--) {
      const chunk = tokens.slice(i, i + len).join(' ');
      const key   = unknownKey(chunk);
      const entry = fastMap[key];
      if (entry) {
        const isCurse = entry.label === 'curse';
        const display = isCurse ? censorWord(entry.eng) : entry.eng;
        result.push({ type:'word', mode: entry.label ? 'stormy-special' : 'normal',
                      label: entry.label, value: display, confidence:'high' });
        i += len; matched = true; break;
      }
    }
    if (!matched) {
      const token = tokens[i];
      // Try session unknown map
      const recovered = lookupUnknownRev(token);
      if (recovered) {
        result.push({ type:'word', mode:'unknown-recovered', value:recovered, confidence:'high' });
      } else {
        result.push({ type:'word', mode:'normal', value:token, confidence:'low' });
      }
      i++;
    }
    // Add space between words
    if (i < tokens.length) result.push({ type:'space', value:' ' });
  }
  return result;
}

// ── Render tokens → HTML ──────────────────────────────
function renderTokens(tokens, direction) {
  let html = '';
  for (const tok of tokens) {
    if (tok.type === 'space')       { html += ' '; continue; }
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
        const cls = tok.label === 'curse' ? 'col-curse' : tok.label === 'intense' ? 'col-intense' : 'col-vocab';
        html += `<span class="${cls}">${tok.value}</span>`;
      } else {
        html += `<span class="col-stormy">${tok.value}</span>`;
      }

    } else {
      if (tok.confidence === 'low') {
        html += `<span class="col-low">${tok.value}</span>`;
      } else if (tok.mode === 'stormy-special') {
        const cls = tok.label === 'curse' ? 'col-curse' : tok.label === 'intense' ? 'col-intense' : 'col-vocab';
        html += `<span class="${cls}">${tok.value}</span>`;
      } else {
        html += `<span class="col-cat">${tok.value}</span>`;
      }
    }
  }
  return html;
}

// ── Message handler ────────────────────────────────────
self.onmessage = function(e) {
  const { id, type, text, lang } = e.data;
  let tokens;
  if      (type === 'to-cat')      tokens = translateToCat(text);
  else if (type === 'to-stormy')   tokens = translateToStormy(text);
  else if (type === 'from-cat')    tokens = translateFromCat(text, 'cat');
  else if (type === 'from-stormy') tokens = translateFromCat(text, 'stormy');
  else { self.postMessage({ id, html: '' }); return; }
  self.postMessage({ id, html: renderTokens(tokens, type) });
};
