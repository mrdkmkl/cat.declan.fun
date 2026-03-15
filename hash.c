/*
 * hash.c — Cat Translator Hash Module
 * Compiled to WebAssembly (hash.wasm) for use in worker.js.
 *
 * This C file implements the djb2 hash function used to deterministically
 * map unknown English words to cat sounds. Each word always maps to the
 * same slot in the UNKNOWN_POOL table, giving consistent results.
 *
 * To recompile (requires Emscripten):
 *   emcc hash.c -O2 -s WASM=1 -s EXPORTED_FUNCTIONS='["_djb2"]' \
 *        -s EXPORTED_RUNTIME_METHODS='[]' --no-entry -o hash.wasm
 *
 * Or with clang/wasi-sdk:
 *   clang --target=wasm32-unknown-unknown -O2 -nostdlib \
 *         -Wl,--export=djb2 -Wl,--no-entry -o hash.wasm hash.c
 *
 * The pre-compiled binary is embedded as base64 in worker.js.
 * This file is kept for reference and future recompilation only.
 */

typedef unsigned int uint32_t;

/*
 * djb2 — classic string hash by Dan Bernstein
 *
 * @param  str       Pointer to the start of the string in memory
 * @param  len       Byte length of the string
 * @param  pool_size Number of entries in the cat sound pool
 * @return           Hash index into the pool (0 to pool_size - 1)
 */
uint32_t djb2(const unsigned char *str, uint32_t len, uint32_t pool_size) {
    uint32_t hash = 5381;
    uint32_t i;
    for (i = 0; i < len; i++) {
        hash = ((hash << 5) + hash) ^ (uint32_t)str[i];
    }
    return hash % pool_size;
}

/*
 * Why djb2?
 *   - Extremely fast: just shifts, adds, and XORs
 *   - Very low collision rate for short English words
 *   - Deterministic: same input always yields same output
 *   - No dependencies: compiles to ~40 bytes of WASM
 *
 * The WASM binary (117 bytes) is embedded in worker.js as base64.
 * When a word is not in catDict, worker.js:
 *   1. Writes the word's UTF-8 bytes into WASM linear memory at offset 0
 *   2. Calls djb2(0, word.length, POOL_SIZE) to get a slot index
 *   3. Returns UNKNOWN_POOL[slot] as the cat sound
 *   4. Stores the mapping in sessionFwd/sessionRev for round-trip recovery
 */
