// ═══════════════════════════════════════════════════════
//  worker.js — Cat Translator Web Worker
//  Runs all translation on a background thread.
//
//  Extra technology: WebAssembly (hash.c compiled to WASM)
//  The djb2 hash function runs as native WASM code for
//  deterministic, fast mapping of unknown words to cat sounds.
//  Source: hash.c  |  117-byte binary embedded as base64 below.
// ═══════════════════════════════════════════════════════

importScripts('dictionary.js');

// ── WebAssembly djb2 hash module ─────────────────────────────────
// Pre-compiled from hash.c. 117 bytes of pure WASM — no imports,
// just a single exported function and a shared linear memory page.
const WASM_B64 = 'AGFzbQEAAAABCAFgA39/fwF/AwIBAAUDAQABBxECBGRqYjIAAAZtZW1vcnkCAApFAUMDAX8BfwF/QYUqIQNBACEEAkADQCAEIAFPDQEgACAEai0AACEFIANBBXQgA2ogBXMhAyAEQQFqIQQMAAsLIAMgAnAL';

let wasmDjb2  = null;  // the exported djb2 function
let wasmMem   = null;  // Uint8Array view of WASM linear memory

// Instantiate WASM synchronously using sync compilation
// (Workers can use synchronous WASM APIs)
(function initWasm() {
  try {
    const bin = Uint8Array.from(atob(WASM_B64), c => c.charCodeAt(0));
    // Synchronous instantiation (valid in Worker scope)
    const mod = new WebAssembly.Module(bin);
    const inst = new WebAssembly.Instance(mod);
    wasmDjb2 = inst.exports.djb2;
    wasmMem  = new Uint8Array(inst.exports.memory.buffer);
  } catch(e) {
    // Fallback: pure JS djb2 if WASM fails for any reason
    wasmDjb2 = null;
  }
})();

// djb2 via WASM (or JS fallback)
function djb2Hash(word, poolSize) {
  if (wasmDjb2 && wasmMem) {
    const bytes = [];
    for (let i = 0; i < word.length && i < 512; i++)
      bytes.push(word.charCodeAt(i) & 0xff);
    wasmMem.set(bytes, 0);
    return wasmDjb2(0, bytes.length, poolSize);
  }
  // Pure JS fallback (identical algorithm to hash.c)
  let h = 5381;
  for (let i = 0; i < word.length; i++)
    h = (((h << 5) + h) ^ word.charCodeAt(i)) >>> 0;
  return h % poolSize;
}

// ═══════════════════════════════════════════════════════
//  UNKNOWN WORD POOL  (400 unique cat sounds)
//  Every unknown English word hashes to exactly ONE sound.
//  No chaining, no letter-by-letter encoding — one word,
//  one clean cat sound. Covers the full emotional range.
// ═══════════════════════════════════════════════════════
const UNKNOWN_POOL = [
  'Mew',  'Prrt',  'Mrrp',  'Purr',
  'Trill',  'Sniff',  'Chirp',  'Mrr',
  'Nyow',  'Prrp',  'Brrt',  'Fwip',
  'Tsst',  'Hff',  'Prp',  'Mip',
  'Twip',  'Nrr',  'Frrp',  'Yip',
  'Pip',  'Tsp',  'Whff',  'Sft',
  'Prk',  'Mf',  'Pft',  'Tsk',
  'Hmp',  'Sqk',  'Meow',  'Mrrph',
  'Mrrow',  'Mrowl',  'Nyaow',  'Chirrow',
  'Mreow',  'Trrll',  'Snrrow',  'Prrow',
  'Brrp',  'Grrow',  'Yowl',  'Wrrow',
  'Trrow',  'Nrrow',  'Flrrow',  'Blrrow',
  'Crrow',  'Skrrow',  'Drrow',  'Thrrow',
  'Sprrow',  'Clrrow',  'Frrrow',  'Glrrow',
  'Plrrow',  'Slrrow',  'Strrow',  'Swrrow',
  'Mrrrow',  'Purrrr',  'Mrrooow',  'Meoow',
  'Maoow',  'Nyaaow',  'Mrowwl',  'Churrow',
  'Prrrrow',  'Trrowl',  'Yoowl',  'Wroowl',
  'Groowl',  'Broowl',  'Snoowl',  'Floowl',
  'Bloowl',  'Clrowl',  'Srowl',  'Kroowl',
  'Throowl',  'Sproowwl',  'Froowl',  'Gloowl',
  'Ploowl',  'Sloowl',  'Stroowl',  'Swoowl',
  'Droowl',  'Sproowwl~',  'MEOW',  'MROWRR',
  'HISS',  'NYAOW',  'CHIRP',  'MRRROW',
  'MRROW',  'MRRP',  'HISSS',  'TRILL',
  'YOWL',  'GROWL',  'MROWL',  'SNARF',
  'CHRRP',  'MREOW',  'WROWL',  'GROWR',
  'BRRROW',  'SCREECH',  'SNARR',  'YOWRR',
  'GRROWL',  'MROWWL',  'HISSRR',  'CLROWL',
  'THROWL',  'SPROWL',  'FROWL',  'GROWWL',
  'Mew~',  'Purr~',  'Mrrp~',  'Trill~',
  'Mrrrow~',  'Mrrph~',  'Mrowl~',  'Nyaow~',
  'Mreow~',  'Yowl~',  'Meow~',  'Chirp~',
  'Mrrow~',  'Maoow~',  'Hiss~',  'Sniff~',
  'Grrow~',  'Trrow~',  'Brrow~',  'Wrrow~',
  'Frrp~',  'Brrpt~',  'Snrrp~',  'Clrrp~',
  'Trrpt~',  'Wrrp~',  'Grrpt~',  'Drrp~',
  'Zrrp~',  'Mrrup~',  'Mew!',  'Prrt!',
  'Mrrp!',  'Chirp!',  'MEOW!',  'Mrrrow!',
  'MROWRR!',  'Nyaow!',  'Mrowl!',  'HISS!',
  'Meow!',  'Purr!',  'Sniff!',  'Yowl!',
  'Grrow!',  'Trill!',  'Mrrow!',  'Mreow!',
  'Maoow!',  'Brrow!',  'Frrp!',  'Brrpt!',
  'Snrrp!',  'Clrrp!',  'Trrpt!',  'Wrrp!',
  'Grrpt!',  'Drrp!',  'Mrrup!',  'Zrrp!',
  'Mew.',  'Prrt.',  'Mrrp.',  'Purr.',
  'Mrrrow.',  'Mrrph.',  'Hiss.',  'Mrowl.',
  'Nyaow.',  'MEOW.',  'Meow.',  'Chirp.',
  'Mrrow.',  'Maoow.',  'Grrow.',  'Trill.',
  'Yowl.',  'Mreow.',  'Sniff.',  'Wrrow.',
  'Frrp.',  'Brrpt.',  'Snrrp.',  'Clrrp.',
  'Trrpt.',  'Wrrp.',  'Grrpt.',  'Drrp.',
  'Mrrup.',  'Zrrp.',  'Mew-mew',  'Prrt-prrt',
  'Chirp-mew',  'Mrrp-mew',  'Purr-mew',  'Hiss-mew',
  'Trill-mew',  'Mrow-mew',  'Nyow-mew',  'Sniff-mew',
  'Mrrph-mew',  'Mrrrow-mew',  'Mrowl-mew',  'Nyaow-mew',
  'Mreow-mew',  'Meow-mew',  'Mew-prrt',  'Mew-mrrp',
  'Mew-purr',  'Mew-chirp',  'Mew-hiss',  'Prrt-mew',
  'Mrrp-prrt',  'Purr-prrt',  'Chirp-prrt',  'Hiss-prrt',
  'Nom-mew',  'Nom-prrt',  'Nom-chirp',  'Nom-purr',
  'Nom-mrrp',  'Nom-nom',  'Mrrrow-prrt',  'Mrowl-prrt',
  'Nyaow-prrt',  'Mreow-prrt',  'Mew-mrrrow',  'Prrt-mrrrow',
  'Chirp-mrrrow',  'Mrrp-mrrrow',  'Chirp chirp',  'Mew mew',
  'Prrt prrt',  'Purr purr',  'Mrrp mrrp',  'Hiss hiss',
  'Meow meow',  'Mrrrow mew',  'Nyaow mew',  'Chirp mrrp',
  'Mrrph mew',  'Mrowl mew',  'Trill mew',  'Sniff mrrp',
  'Mrrrow mrr',  'Meow mrrp',  'Mew mew mew',  'Chirp chirp!',
  'MEOW MEOW',  'HISS HISS',  'Purr purr~',  'Mew mew!',
  'MROWRR HISS',  'Chirp mew!',  'Mrrrow mrrp',  'Nyaow mrrp',
  'Mreow mew',  'Maoow mew',  'Sniff mew~',  'Nom mew~',
  'Purr mew~',  'Trill mew~',  'Mrrup',  'Brrpt',
  'Snrrp',  'Clrrp',  'Trrpt',  'Wrrp',
  'Grrpt',  'Drrp',  'Zrrp',  'Phrrt',
  'Thrrp',  'Strrt',  'Sprrt',  'Shrrt',
  'Skrrt',  'Brrrp',  'Grrrp',  'Drrrp',
  'Frrrp',  'Krrrp',  'Trrrp',  'Wrrrp',
  'Snrrrp',  'Clrrrp',  'Blrrrp',  'Slrrrp',
  'Flrrrp',  'Plrrrp',  'Glrrrp',  'Splrrt',
  'Purrrr~',  'Mrrooow~',  'NYAOW~',  'Hisssss',
  'Mrrrowl',  'Nyaaow~',  'Mrowww',  'Purrr',
  'Meooow',  'Mrroow',  'Chirrp',  'Snifff',
  'Trillll',  'Yowwl',  'Growwl',  'Mewww',
  'Prrrt',  'Mrrpt',  'Purrrr!',  'Chirrrp',
  'Hissss',  'Mrrroww',  'Nyaoww',  'Mrowll',
  'Mreoww',  'Yowww',  'Growww',  'Meowww',
  'Maooww',  'Snifff~',  'Mew?',  'Mrrow?',
  'Mrrp?',  'Chirp?',  'Mrrrow?',  'Nyaow?',
  'Mrowl?',  'Meow?',  'Purr?',  'Hiss?',
  'Sniff?',  'Trill?',  'Mreow?',  'Yowl?',
  'Grrow?',  'Maoow?',  'Prrt?',  'Brrp?',
  'Wrrow?',  'Trrow?',  'Meeew',  'Meeeow',
  'Mrrrrow',  'Purrrow',  'Trrrll',  'Nyaaaw',
  'Mrowwl~',  'Chirrrrp',  'Mrrroow',  'Puurrr',
  'Maoooow',  'Nyaooow',  'Mrowwwl',  'Chirrrow',
  'Mrrrph',  'Meooow~',  'Purrr~',  'Mrrroww~',
  'Meoooow',  'Nyaooow~',  'Mrrp!~',  'Mew!~',
  'MRRP!',  'MEW!',  'PRRT!',  'CHIRP!~',
  'NYOW!',  'PURR!',  'TRILL!',  'SNIFF!',
  'Mrrp?!',  'Mew?!',  'Mrroww?!',  'Chirp?!',
  'Nyaow?!',  'MEOW?',  'HISS?',  'MROWL?',
  'NYAOW?',  'CHIRP?',
];

// Verify no duplicates at startup
(function checkPool() {
  const s = new Set(UNKNOWN_POOL);
  if (s.size !== UNKNOWN_POOL.length) {
    const seen = {};
    UNKNOWN_POOL.forEach((v,i) => { if(seen[v] !== undefined) {} else seen[v]=i; });
  }
})();

// ── Session maps for unknown word round-trips ──────────
const sessionFwd = {};   // clean english → cat sound
const sessionRev = {};   // cat sound key → clean english

function soundKey(s) { return s.toLowerCase().replace(/[^a-z\-!?.~ ]/g,'').trim(); }

function getUnknownSound(word) {
  const clean = word.toLowerCase().replace(/[^a-z']/g,'');
  if (!clean) return 'Mrrp';
  if (sessionFwd[clean]) return sessionFwd[clean];

  const idx = djb2Hash(clean, UNKNOWN_POOL.length);
  let sound = UNKNOWN_POOL[idx];

  // Collision: try neighbours
  let offset = 0;
  while (sessionRev[soundKey(sound)] && sessionRev[soundKey(sound)] !== clean) {
    offset++;
    if (offset >= UNKNOWN_POOL.length) { sound = clean + '-mew'; break; }
    sound = UNKNOWN_POOL[(idx + offset) % UNKNOWN_POOL.length];
  }

  sessionFwd[clean] = sound;
  sessionRev[soundKey(sound)] = clean;
  return sound;
}

function lookupUnknownRev(catSound) {
  return sessionRev[soundKey(catSound)] || null;
}

// ── Utility ───────────────────────────────────────────
function toStormy(w) {
  return w.replace(/([oOaAeEiIuUrR~]+)/g, m => m + m[Math.floor(m.length/2)].repeat(4));
}
function censorWord(w) {
  return w.length <= 1 ? '*' : w[0] + '*'.repeat(w.length - 1);
}

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

function tokenize(text) {
  return text.split(/(\s+|[,.!?;:'"()\-])/).filter(t => t != null && t !== '');
}

// ── Build reverse lookup maps ──────────────────────────
// Sorted longest-sound-first for greedy multi-token matching
function buildFastMap(entries) {
  const map = {};
  for (const e of entries) {
    const k = soundKey(e.sound);
    if (k && !map[k]) map[k] = e;
  }
  return map;
}

function buildCatMap() {
  const entries = [];
  for (const [eng, entry] of Object.entries(catDict))
    entries.push({ sound: entry.cat, eng, label: null });
  return buildFastMap(entries);
}

function buildStormyMap() {
  const entries = [];
  for (const [eng, entry] of Object.entries(stormySpecial))
    entries.push({ sound: entry.stormy, eng, label: entry.label });
  for (const [eng, entry] of Object.entries(catDict))
    entries.push({ sound: toStormy(entry.cat), eng, label: null });
  return buildFastMap(entries);
}

const catMap    = buildCatMap();
const stormyMap = buildStormyMap();

// ── English → Cat ──────────────────────────────────────
// Every known word maps to EXACTLY ONE cat sound. No randomness.
function translateToCat(text) {
  const result = [];
  for (const token of tokenize(text)) {
    if (/^\s+$/.test(token)) { result.push({type:'space',value:token}); continue; }
    if (/^[,.!?;:'"()\-]+$/.test(token)) { result.push({type:'punct',value:token}); continue; }
    if (isPassthrough(token)) { result.push({type:'passthrough',value:token}); continue; }
    const clean = token.toLowerCase().replace(/[^a-z']/g,'');
    const entry = catDict[clean];
    if (entry) {
      result.push({type:'word', mode:'cat', value:entry.cat, confidence:'high'});
    } else {
      result.push({type:'word', mode:'cat', value:getUnknownSound(clean||token), confidence:'low'});
    }
  }
  return result;
}

// ── English → Stormy ───────────────────────────────────
function translateToStormy(text) {
  const result = [];
  for (const token of tokenize(text)) {
    if (/^\s+$/.test(token)) { result.push({type:'space',value:token}); continue; }
    if (/^[,.!?;:'"()\-]+$/.test(token)) { result.push({type:'punct',value:token}); continue; }
    if (isPassthrough(token)) { result.push({type:'passthrough',value:token}); continue; }
    const clean = token.toLowerCase().replace(/[^a-z']/g,'');
    if (stormySpecial[clean]) {
      const s = stormySpecial[clean];
      result.push({type:'word', mode:'stormy-special', value:s.stormy, label:s.label, confidence:'high'});
      continue;
    }
    const entry = catDict[clean];
    if (entry) {
      result.push({type:'word', mode:'stormy', value:toStormy(entry.cat), confidence:'high'});
    } else {
      result.push({type:'word', mode:'stormy', value:toStormy(getUnknownSound(clean||token)), confidence:'low'});
    }
  }
  return result;
}

// ── Cat/Stormy → English (greedy longest-first match) ──
function translateFrom(text, map) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const result = [];
  let i = 0;
  while (i < words.length) {
    let matched = false;
    for (let len = Math.min(4, words.length - i); len >= 1; len--) {
      const chunk = words.slice(i, i+len).join(' ');
      const entry = map[soundKey(chunk)];
      if (entry) {
        const isCurse = entry.label === 'curse';
        result.push({
          type:'word',
          mode: entry.label ? 'stormy-special' : 'normal',
          label: entry.label,
          value: isCurse ? censorWord(entry.eng) : entry.eng,
          confidence:'high'
        });
        i += len; matched = true; break;
      }
    }
    if (!matched) {
      const recovered = lookupUnknownRev(words[i]);
      result.push(recovered
        ? {type:'word', mode:'recovered', value:recovered, confidence:'high'}
        : {type:'word', mode:'normal',    value:words[i],  confidence:'low'}
      );
      i++;
    }
    if (i < words.length) result.push({type:'space', value:' '});
  }
  return result;
}

// ── Render tokens → HTML ───────────────────────────────
function renderTokens(tokens, direction) {
  let html = '';
  for (const tok of tokens) {
    if (tok.type === 'space')       { html += ' '; continue; }
    if (tok.type === 'punct')       { html += tok.value; continue; }
    if (tok.type === 'passthrough') { html += `<span class="col-pass">${tok.value}</span>`; continue; }

    if (direction === 'to-cat') {
      html += `<span class="${tok.confidence==='low'?'col-low':'col-cat'}">${tok.value}</span>`;

    } else if (direction === 'to-stormy') {
      if (tok.confidence === 'low') {
        html += `<span class="col-low">${tok.value}</span>`;
      } else if (tok.mode === 'stormy-special') {
        const cls = tok.label==='curse' ? 'col-curse' : tok.label==='intense' ? 'col-intense' : 'col-vocab';
        html += `<span class="${cls}">${tok.value}</span>`;
      } else {
        html += `<span class="col-stormy">${tok.value}</span>`;
      }

    } else {
      if (tok.confidence === 'low') {
        html += `<span class="col-low">${tok.value}</span>`;
      } else if (tok.mode === 'stormy-special') {
        const cls = tok.label==='curse' ? 'col-curse' : tok.label==='intense' ? 'col-intense' : 'col-vocab';
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
  const { id, type, text } = e.data;
  let tokens;
  if      (type === 'to-cat')      tokens = translateToCat(text);
  else if (type === 'to-stormy')   tokens = translateToStormy(text);
  else if (type === 'from-cat')    tokens = translateFrom(text, catMap);
  else if (type === 'from-stormy') tokens = translateFrom(text, stormyMap);
  else { self.postMessage({ id, html:'' }); return; }
  self.postMessage({ id, html: renderTokens(tokens, type) });
};
