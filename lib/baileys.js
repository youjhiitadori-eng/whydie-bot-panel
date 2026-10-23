// Shim loader: @hanzofc/baileys adalah ESM-only (Baileys 7), sedangkan project ini CommonJS.
// index.js memanggil `await loadBaileys()` sekali di awal, setelah itu semua file
// bisa memakai: const { getDevice } = require('../lib/baileys');
let cache = null;

async function loadBaileys() {
    if (!cache) {
        const mod = await import('@hanzofc/baileys');
        cache = { ...mod, default: mod.default || mod.makeWASocket };
    }
    return cache;
}

module.exports = new Proxy({}, {
    get(_, key) {
        if (key === 'loadBaileys') return loadBaileys;
        if (key === '__esModule') return false;
        if (!cache) {
            throw new Error('Baileys belum dimuat. Pastikan `await loadBaileys()` dipanggil di index.js sebelum modul lain di-require.');
        }
        return cache[key];
    },
    has(_, key) { return key === 'loadBaileys' || (cache ? key in cache : false); },
    ownKeys() { return cache ? Reflect.ownKeys(cache) : []; },
    getOwnPropertyDescriptor(_, key) {
        if (cache && key in cache) return { enumerable: true, configurable: true, value: cache[key] };
        return undefined;
    },
});
