/*
 * decrypt.c  —  Cat Translator Decryption Engine
 * ═══════════════════════════════════════════════════════════════════════════
 * Compiled to WebAssembly via wasm_builder.js (no toolchain required).
 * Implements the signal-analysis and scoring pipeline used during
 * Cat → English and Stormy → English decryption.
 *
 * HOW DECRYPTION WORKS
 * ─────────────────────────────────────────────────────────────────────────
 * Cat sounds carry five independent signals:
 *
 *   1. Vowel density  — how open/soft the sound is
 *   2. Consonant runs — how harsh/abrupt the phoneme cluster is
 *   3. Repeat score   — how much emotional repetition is present
 *   4. Cap weight     — how capitalised (emphatic) the token is
 *   5. Phoneme class  — which of 8 phoneme families the sound belongs to
 *
 * These signals are packed into a 32-bit signal_vector and used by
 * score_candidate() to rank dictionary entries against the input token.
 * The engine tries up to five passes (exact, session, phonetic, fuzzy,
 * brute-force) and picks the candidate with the highest score.
 *
 * A sixth signal — the "study phase" — is unique to this engine.
 * Before final scoring, the JS side calls study_token() which:
 *   a) Segments the token into phoneme fragments (split on vowel clusters)
 *   b) Emits each fragment as a progress event so the UI can animate
 *      the decryption character-by-character
 *   c) Scores the phoneme fragments independently and merges the scores
 *
 * FUNCTIONS EXPORTED TO WASM
 * ─────────────────────────────────────────────────────────────────────────
 *
 *  vowel_density(ptr, len) → u32
 *    Vowel characters × 255 ÷ total alpha characters.
 *    0 = all consonants (harsh), 255 = pure vowel sound (soft).
 *
 *  consonant_runs(ptr, len) → u32
 *    Length of the longest consecutive consonant run.
 *    "mrrph" = 4 (rrrph), "meow" = 1.
 *
 *  repeat_score(ptr, len) → u32
 *    Adjacent identical characters × 255 ÷ (len − 1).
 *    High = emphatic ("MRRRRROW"), low = crisp ("mew").
 *
 *  cap_weight(ptr, len) → u32
 *    Uppercase characters × 255 ÷ alpha characters.
 *    0 = all lowercase, 255 = ALL CAPS.
 *
 *  phoneme_class(ptr, len) → u32
 *    Classify the token into one of 8 phoneme families (0–7).
 *    See PHONEME_CLASS constants below.
 *
 *  signal_vector(ptr, len) → u32
 *    Pack all five signals into one 32-bit integer:
 *      bits 31-24  vowel_density (0–255)
 *      bits 23-16  consonant_runs (0–255, capped)
 *      bits 15-8   repeat_score (0–255)
 *      bits  7-4   cap_weight >> 4 (0–15)
 *      bits  3-0   phoneme_class (0–7)
 *
 *  djb2(ptr, len, pool_size) → u32
 *    Dan Bernstein hash, used to deterministically assign unknown
 *    words to pool slots. hash = 5381; for each byte: hash*33 XOR c.
 *
 *  lev(a_ptr, a_len, b_ptr, b_len) → u32
 *    Levenshtein edit distance. Case-insensitive. Max string: 63 chars.
 *    Two scratch rows stored in WASM linear memory at offsets 8192/8448.
 *
 *  bigram_overlap(a_ptr, a_len, b_ptr, b_len) → u32
 *    Count shared character bigrams between two lowercase strings.
 *    Each bigram is a pair of adjacent alpha chars.
 *    Uses a local 64-slot table for the candidate bigrams.
 *
 *  score_candidate(in_sv, cand_sv, lev_dist, bigram_cnt, max_bigrams) → u32
 *    Composite score in [0, 255] combining all signals.
 *    Formula (mirrored exactly in JS for validation):
 *      base      = max(0, 200 - lev_dist × 28)
 *      bg_bonus  = bigram_cnt × 45 / max(max_bigrams, 1)
 *      pc_bonus  = 20 if phoneme classes match
 *      cw_bonus  = 15 if cap_weight levels within 2, else 8 if within 4
 *      vd_bonus  = 10 if vowel densities within 32, else 5 if within 64
 *      total     = clamp(base + bg_bonus + pc_bonus + cw_bonus + vd_bonus, 0, 255)
 *
 *  fragment_count(ptr, len) → u32
 *    Count phoneme fragments in a token (split on vowel↔consonant boundaries).
 *    Used by the JS study engine to know how many animation steps to emit.
 *    Example: "mrrrow" = 2 fragments ["mrr", "ow"]
 *             "meow"   = 2 fragments ["me", "ow"]
 *             "chirp"  = 2 fragments ["chi", "rp"]
 *
 *  fragment_start(ptr, len, idx) → u32
 *    Return the start byte offset of the idx-th phoneme fragment.
 *
 *  fragment_len(ptr, len, idx) → u32
 *    Return the byte length of the idx-th phoneme fragment.
 *
 *  decrypt_viable(ptr, len) → u32
 *    Returns 1 if the token looks like a valid cat sound, 0 otherwise.
 *    Checks: has alpha chars, length 1–40, not all digits, starts with alpha.
 *    Used to generate CT-303 "Cannot Decrypt" errors early.
 *
 * PHONEME CLASSES
 * ─────────────────────────────────────────────────────────────────────────
 *   0  PC_PURR   — voiced alveolar trill onset (purr, prrt, brr, prrr)
 *   1  PC_MEW    — front high vowel onset (mew, meww, nom, no*)
 *   2  PC_MEOW   — back round vowel diphthong (meow, nyaow, mreow, mrrow)
 *   3  PC_HISS   — voiceless sibilant (hiss, hisss, sniff, ss*)
 *   4  PC_CHIRP  — affricate / cluster onset (chirp, trill, ch*, tr*, sn*)
 *   5  PC_YOWL   — back vowel + lateral coda (yowl, yow*, *owll)
 *   6  PC_MRRPH  — nasal + trill + voiceless stop coda (mrrph, mrrp, mph)
 *   7  PC_OTHER  — unclassified
 *
 * MEMORY MAP (WASM linear memory)
 * ─────────────────────────────────────────────────────────────────────────
 *   0    – 511    caller string region A  (djb2, vowel functions)
 *   512  – 639    caller string region B  (lev string a)
 *   640  – 767    caller string region C  (lev string b / bigram string a)
 *   768  – 895    caller string region D  (bigram string b)
 *   8192 – 8447   lev scratch row "prev" (64 × 4-byte i32 slots)
 *   8448 – 8703   lev scratch row "curr" (64 × 4-byte i32 slots)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

typedef unsigned int  uint32_t;
typedef unsigned char uint8_t;
typedef unsigned short uint16_t;

/* ─── Phoneme class constants ─────────────────────────────────────────── */
#define PC_PURR   0
#define PC_MEW    1
#define PC_MEOW   2
#define PC_HISS   3
#define PC_CHIRP  4
#define PC_YOWL   5
#define PC_MRRPH  6
#define PC_OTHER  7

/* ─── Utility predicates ──────────────────────────────────────────────── */
static int is_alpha(uint8_t c) {
    return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
}
static int is_vowel(uint8_t c) {
    uint8_t lo = c | 0x20;
    return lo=='a' || lo=='e' || lo=='i' || lo=='o' || lo=='u';
}
static int is_upper(uint8_t c) { return c >= 'A' && c <= 'Z'; }
static uint8_t to_lower(uint8_t c) { return is_upper(c) ? c | 0x20 : c; }

/* ─── 1. vowel_density ────────────────────────────────────────────────── */
uint32_t vowel_density(const uint8_t *s, uint32_t len) {
    uint32_t v = 0, a = 0, i;
    for (i = 0; i < len; i++) {
        if (!is_alpha(s[i])) continue;
        a++;
        if (is_vowel(s[i])) v++;
    }
    return a ? (v * 255) / a : 0;
}

/* ─── 2. consonant_runs ───────────────────────────────────────────────── */
uint32_t consonant_runs(const uint8_t *s, uint32_t len) {
    uint32_t best = 0, run = 0, i;
    for (i = 0; i < len; i++) {
        if (is_alpha(s[i]) && !is_vowel(s[i])) {
            run++;
            if (run > best) best = run;
        } else { run = 0; }
    }
    return best;
}

/* ─── 3. repeat_score ────────────────────────────────────────────────── */
uint32_t repeat_score(const uint8_t *s, uint32_t len) {
    uint32_t pairs = 0, i;
    if (len < 2) return 0;
    for (i = 0; i < len - 1; i++) {
        if (is_alpha(s[i]) && to_lower(s[i]) == to_lower(s[i+1])) pairs++;
    }
    return (pairs * 255) / (len - 1);
}

/* ─── 4. cap_weight ──────────────────────────────────────────────────── */
uint32_t cap_weight(const uint8_t *s, uint32_t len) {
    uint32_t up = 0, a = 0, i;
    for (i = 0; i < len; i++) {
        if (!is_alpha(s[i])) continue;
        a++;
        if (is_upper(s[i])) up++;
    }
    return a ? (up * 255) / a : 0;
}

/* ─── 5. phoneme_class ───────────────────────────────────────────────── */
uint32_t phoneme_class(const uint8_t *s, uint32_t len) {
    uint8_t lo[8];
    uint32_t i, n = len < 8 ? len : 8;
    uint32_t s_cnt = 0;

    for (i = 0; i < n; i++) lo[i] = to_lower(s[i]);
    for (; i < 8; i++) lo[i] = 0;

    /* PC_HISS: starts hi, or 3+ s chars */
    if (lo[0]=='h' && lo[1]=='i') return PC_HISS;
    for (i = 0; i < n; i++) if (lo[i]=='s') s_cnt++;
    if (s_cnt >= 3) return PC_HISS;

    /* PC_CHIRP: ch, tr, sn */
    if (lo[0]=='c' && lo[1]=='h') return PC_CHIRP;
    if (lo[0]=='t' && lo[1]=='r') return PC_CHIRP;
    if (lo[0]=='s' && lo[1]=='n') return PC_CHIRP;

    /* PC_YOWL: y onset or ow cluster */
    if (lo[0]=='y') return PC_YOWL;
    for (i = 0; i + 1 < n; i++) if (lo[i]=='o' && lo[i+1]=='w') return PC_YOWL;

    /* PC_PURR: pr, pu, br onset */
    if (lo[0]=='p' && (lo[1]=='r' || lo[1]=='u')) return PC_PURR;
    if (lo[0]=='b' && lo[1]=='r') return PC_PURR;

    /* PC_MEW vs PC_MEOW */
    if (lo[0]=='m' && lo[1]=='e') {
        for (i = 2; i < n; i++) if (lo[i]=='o') return PC_MEOW;
        return PC_MEW;
    }

    /* PC_MRRPH: mr onset, check for vowel count */
    if (lo[0]=='m' && lo[1]=='r') {
        uint32_t vc = 0;
        for (i = 0; i < n; i++) if (is_vowel(lo[i])) vc++;
        if (vc == 0 || (n >= 2 && lo[n-2]=='p' && lo[n-1]=='h')) return PC_MRRPH;
        return PC_MEOW;
    }

    /* ny, no onset → MEOW family */
    if (lo[0]=='n' && (lo[1]=='y' || lo[1]=='o')) return PC_MEOW;

    /* PC_MEW: no onset */
    if (lo[0]=='n' && lo[1]=='o') return PC_MEW;

    return PC_OTHER;
}

/* ─── 6. signal_vector ───────────────────────────────────────────────── */
uint32_t signal_vector(const uint8_t *s, uint32_t len) {
    uint32_t vd = vowel_density(s, len);
    uint32_t cr = consonant_runs(s, len); if (cr > 255) cr = 255;
    uint32_t rs = repeat_score(s, len);
    uint32_t cw = cap_weight(s, len) >> 4;
    uint32_t pc = phoneme_class(s, len);
    return (vd << 24) | (cr << 16) | (rs << 8) | (cw << 4) | pc;
}

/* ─── 7. djb2 ────────────────────────────────────────────────────────── */
uint32_t djb2(const uint8_t *s, uint32_t len, uint32_t pool_size) {
    uint32_t h = 5381, i;
    for (i = 0; i < len; i++) h = ((h << 5) + h) ^ (uint32_t)s[i];
    return pool_size > 0 ? h % pool_size : h;
}

/* ─── 8. lev ─────────────────────────────────────────────────────────── */
uint32_t lev(const uint8_t *a, uint32_t alen,
             const uint8_t *b, uint32_t blen) {
    uint32_t prev[65], curr[65], i, j, cost, del, ins, sub, tmp;
    if (alen > 63) alen = 63;
    if (blen > 63) blen = 63;
    for (j = 0; j <= blen; j++) prev[j] = j;
    for (i = 0; i < alen; i++) {
        curr[0] = i + 1;
        for (j = 0; j < blen; j++) {
            uint8_t ai = to_lower(a[i]), bj = to_lower(b[j]);
            cost = (ai != bj) ? 1 : 0;
            del  = prev[j+1] + 1;
            ins  = curr[j]   + 1;
            sub  = prev[j]   + cost;
            tmp  = del < ins ? del : ins;
            curr[j+1] = tmp < sub ? tmp : sub;
        }
        for (j = 0; j <= blen; j++) { tmp=prev[j]; prev[j]=curr[j]; curr[j]=tmp; }
    }
    return prev[blen];
}

/* ─── 9. bigram_overlap ──────────────────────────────────────────────── */
uint32_t bigram_overlap(const uint8_t *a, uint32_t alen,
                        const uint8_t *b, uint32_t blen) {
    uint16_t bg_tbl[64];
    uint8_t  used[64];
    uint32_t nb = 0, shared = 0, i, j;
    if (alen < 2 || blen < 2) return 0;

    /* Build bigram table from b */
    for (j = 0; j+1 < blen && nb < 64; j++) {
        uint8_t c0 = to_lower(b[j]), c1 = to_lower(b[j+1]);
        if (!is_alpha(c0) || !is_alpha(c1)) continue;
        uint16_t bg = ((uint16_t)c0 << 8) | c1;
        uint32_t dup = 0;
        for (i = 0; i < nb; i++) if (bg_tbl[i] == bg) { dup = 1; break; }
        if (!dup) { bg_tbl[nb] = bg; used[nb] = 0; nb++; }
    }

    /* Count matches from a */
    for (i = 0; i+1 < alen; i++) {
        uint8_t c0 = to_lower(a[i]), c1 = to_lower(a[i+1]);
        if (!is_alpha(c0) || !is_alpha(c1)) continue;
        uint16_t bg = ((uint16_t)c0 << 8) | c1;
        for (j = 0; j < nb; j++) {
            if (bg_tbl[j] == bg && !used[j]) { used[j] = 1; shared++; break; }
        }
    }
    return shared;
}

/* ─── 10. score_candidate ────────────────────────────────────────────── */
uint32_t score_candidate(uint32_t in_sv, uint32_t cand_sv,
                         uint32_t lev_dist,
                         uint32_t bigram_cnt, uint32_t max_bigrams) {
    uint32_t i_vd = (in_sv   >> 24) & 0xFF;
    uint32_t i_cw = (in_sv   >>  4) & 0x0F;
    uint32_t i_pc =  in_sv          & 0x0F;
    uint32_t c_vd = (cand_sv >> 24) & 0xFF;
    uint32_t c_cw = (cand_sv >>  4) & 0x0F;
    uint32_t c_pc =  cand_sv        & 0x0F;
    int32_t  score, diff;

    /* Edit distance (0–200) — dominant */
    score = 200 - (int32_t)(lev_dist * 28);
    if (score < 0) score = 0;

    /* Bigram bonus (0–45) */
    if (max_bigrams > 0) score += (int32_t)((bigram_cnt * 45) / max_bigrams);

    /* Phoneme class match (0–20) */
    if (i_pc == c_pc) score += 20;

    /* Cap weight proximity (0–15) */
    diff = (int32_t)i_cw - (int32_t)c_cw;
    if (diff < 0) diff = -diff;
    if (diff <= 2) score += 15; else if (diff <= 4) score += 8;

    /* Vowel density proximity (0–10) */
    diff = (int32_t)i_vd - (int32_t)c_vd;
    if (diff < 0) diff = -diff;
    if (diff <= 32) score += 10; else if (diff <= 64) score += 5;

    if (score < 0)   score = 0;
    if (score > 255) score = 255;
    return (uint32_t)score;
}

/* ─── 11. fragment_count ─────────────────────────────────────────────── */
/*
 * Count the number of phoneme fragments in a token.
 * A fragment boundary occurs wherever the character type changes
 * between (consonant/non-alpha) and (vowel).
 * Hyphens '-' always create a boundary.
 * Used by the JS study engine to know how many animation frames to emit.
 */
uint32_t fragment_count(const uint8_t *s, uint32_t len) {
    uint32_t count = 1, i;
    int in_vowel_run;
    if (len == 0) return 0;

    /* Find first alpha char to seed the state */
    in_vowel_run = 0;
    for (i = 0; i < len; i++) {
        if (s[i] == '-') { count++; continue; }
        if (!is_alpha(s[i])) continue;
        if (is_vowel(s[i])) {
            if (!in_vowel_run) { count++; in_vowel_run = 1; }
        } else {
            if (in_vowel_run) { count++; in_vowel_run = 0; }
        }
    }
    /* Clamp: at least 1, at most len */
    if (count < 1) count = 1;
    if (count > len) count = len;
    return count;
}

/* ─── 12. fragment_start ─────────────────────────────────────────────── */
/*
 * Return the start byte offset of the idx-th phoneme fragment.
 * Fragment 0 always starts at 0.
 */
uint32_t fragment_start(const uint8_t *s, uint32_t len, uint32_t idx) {
    uint32_t frag = 0, i;
    int in_vowel_run = 0;
    if (idx == 0) return 0;
    for (i = 0; i < len; i++) {
        if (s[i] == '-') { frag++; if (frag == idx) return i + 1; continue; }
        if (!is_alpha(s[i])) continue;
        if (is_vowel(s[i])) {
            if (!in_vowel_run) {
                frag++;
                if (frag == idx) return i;
                in_vowel_run = 1;
            }
        } else {
            if (in_vowel_run) {
                frag++;
                if (frag == idx) return i;
                in_vowel_run = 0;
            }
        }
    }
    return len;
}

/* ─── 13. fragment_len ───────────────────────────────────────────────── */
uint32_t fragment_len(const uint8_t *s, uint32_t len, uint32_t idx) {
    uint32_t start = fragment_start(s, len, idx);
    uint32_t next  = fragment_start(s, len, idx + 1);
    if (next > len) next = len;
    return next > start ? next - start : 0;
}

/* ─── 14. decrypt_viable ─────────────────────────────────────────────── */
/*
 * Returns 1 if the token could plausibly be a cat sound, 0 otherwise.
 * Checks:
 *   - Has at least one alpha character
 *   - Length 1–40
 *   - First non-space character is alpha
 *   - Not entirely digits
 */
uint32_t decrypt_viable(const uint8_t *s, uint32_t len) {
    uint32_t alpha_cnt = 0, digit_cnt = 0, i;
    uint8_t first_nonspace = 0;
    if (len == 0 || len > 40) return 0;
    for (i = 0; i < len; i++) {
        if (s[i] == ' ' || s[i] == '\t') continue;
        if (first_nonspace == 0) first_nonspace = s[i];
        if (is_alpha(s[i])) alpha_cnt++;
        if (s[i] >= '0' && s[i] <= '9') digit_cnt++;
    }
    if (alpha_cnt == 0) return 0;
    if (!is_alpha(first_nonspace)) return 0;
    if (digit_cnt > 0 && alpha_cnt == 0) return 0;
    return 1;
}
