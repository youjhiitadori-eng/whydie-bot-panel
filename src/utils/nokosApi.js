// Client API Nokoskuy v2  (https://welper.web.id/nokoskuy/api/v2)
//
// Kontrak:
//   - Semua fungsi mengembalikan { ok, status, data, meta, requestId } atau { ok:false, status, error, requestId, retryAfter }.
//   - TIDAK pernah throw. error = { code, message, ...field tambahan (new_price, balance, deposit_id) }.
//   - error.network === true kalau koneksi gagal / timeout (hasil request TIDAK pasti, jangan anggap gagal).
//
// Perlindungan bawaan:
//   - Pembatas laju internal (default 100 req/menit, batas server 120) supaya poller + user tidak kena 429.
//   - 429 -> semua request ditahan sesuai header Retry-After.
//   - Cache singkat untuk katalog (saran dokumen).
const config = require('../config');

const TIMEOUT_MS = 25000;
const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 100;          // batas server 120/menit per key; sisakan ruang aman

const cache = new Map();             // path -> { exp, value }
const sentAt = [];                   // timestamp request dalam jendela berjalan
let pausedUntil = 0;                 // diisi saat kena 429

const cfg = () => config.nokos || {};
const hasKey = () => !!String(cfg().apiKey || '').trim();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const enc = encodeURIComponent;

/** Tunggu sampai ada jatah request (token bucket sederhana, jendela geser 60 detik). */
async function throttle() {
    for (;;) {
        const now = Date.now();
        if (pausedUntil > now) { await sleep(pausedUntil - now); continue; }
        while (sentAt.length && now - sentAt[0] >= WINDOW_MS) sentAt.shift();
        if (sentAt.length < MAX_PER_WINDOW) { sentAt.push(now); return; }
        await sleep(Math.max(50, WINDOW_MS - (now - sentAt[0])));
    }
}

async function call(path, { method = 'GET', body, idem, ttl = 0 } = {}) {
    if (!hasKey()) {
        return { ok: false, status: 0, error: { code: 'no_api_key', message: 'API key Nokoskuy belum diisi (src/config.js -> nokos.apiKey atau env NKS_KEY)' } };
    }

    const cacheKey = method === 'GET' && ttl ? path : null;
    if (cacheKey) {
        const hit = cache.get(cacheKey);
        if (hit && hit.exp > Date.now()) return hit.value;
    }

    await throttle();

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(String(cfg().baseUrl).replace(/\/+$/, '') + path, {
            method,
            signal: ctrl.signal,
            headers: {
                Authorization: `Bearer ${String(cfg().apiKey).trim()}`,
                'Content-Type': 'application/json',
                ...(idem ? { 'Idempotency-Key': idem } : {}),
            },
            body: body ? JSON.stringify(body) : undefined,
        });
        let json = null;
        try { json = await res.json(); } catch { /* body bukan JSON */ }
        const requestId = res.headers.get('x-request-id') || json?.request_id || null;
        const retryAfter = parseInt(res.headers.get('retry-after') || '0', 10) || 0;

        if (res.status === 429) pausedUntil = Date.now() + Math.max(retryAfter, 5) * 1000;

        let out;
        if (json && json.success) {
            out = { ok: true, status: res.status, data: json.data, meta: json.meta || {}, requestId };
        } else {
            out = {
                ok: false, status: res.status, requestId, retryAfter,
                error: json?.error || { code: 'bad_response', message: `Respons tidak dikenal (HTTP ${res.status})` },
            };
        }
        if (cacheKey && out.ok) cache.set(cacheKey, { exp: Date.now() + ttl, value: out });
        return out;
    } catch (e) {
        return { ok: false, status: 0, error: { code: 'network_error', network: true, message: e?.name === 'AbortError' ? 'Timeout' : (e?.message || 'Network error') } };
    } finally {
        clearTimeout(timer);
    }
}

const qs = (o) => {
    const p = Object.entries(o || {}).filter(([, v]) => v !== undefined && v !== null && v !== '');
    return p.length ? '?' + p.map(([k, v]) => `${enc(k)}=${enc(v)}`).join('&') : '';
};

module.exports = {
    hasKey,
    clearCache: () => cache.clear(),

    /* ---- akun ---- */
    // data: { balance, active, pending, pending_schedule[], currency }
    balance: () => call('/balance'),
    me: () => call('/me'),
    ping: () => call('/ping'),
    providers: () => call('/providers', { ttl: 5 * 60 * 1000 }),

    /* ---- katalog (saran dokumen: cache) ---- */
    services: (q) => call('/services' + qs({ q }), { ttl: 5 * 60 * 1000 }),
    countries: (service, provider) => call(`/services/${enc(service)}/countries${qs({ provider })}`, { ttl: 15 * 1000 }),
    offers: (service, provider, cc) => call(`/services/${enc(service)}/offers${qs({ provider, country_code: cc })}`, { ttl: 10 * 1000 }),

    /* ---- pesanan ---- */
    createOrder: (body, idem) => call('/orders', { method: 'POST', body, idem }),
    getOrder: (id) => call(`/orders/${enc(id)}`),
    cancelOrder: (id) => call(`/orders/${enc(id)}`, { method: 'DELETE' }),
    requestOtp: (id) => call(`/orders/${enc(id)}/request-otp`, { method: 'POST' }),
    finishOrder: (id) => call(`/orders/${enc(id)}/finish`, { method: 'POST' }),

    /* ---- deposit (v2) ---- */
    // data: [{ id, type, label }], meta: { available, min, max, expires_in_minutes, withdrawable_after }
    depositMethods: () => call('/deposit/methods', { ttl: 60 * 1000 }),
    createDeposit: (amount, method) => call('/deposits', { method: 'POST', body: { amount, method } }),
    getDeposit: (id) => call(`/deposits/${enc(id)}`),
    listDeposits: (opts) => call('/deposits' + qs(opts)),
    cancelDeposit: (id) => call(`/deposits/${enc(id)}`, { method: 'DELETE' }),
};
