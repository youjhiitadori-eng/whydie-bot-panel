// Pemanggil API apiii-xrina.my.id untuk kategori AI, Canvas & Donghive.
// Respon API bisa JSON ({ status, data }) atau langsung gambar (Canvas) -> semua ditangani di sini.
const sharp = require('sharp');
const { sniffType, uploadImage } = require('./aiClient');

const ROOT = (process.env.XRINA_API || 'https://apiii-xrina.my.id').replace(/\/+$/, '');
const UA = { 'User-Agent': 'Mozilla/5.0 (Nayla-AI)' };

const qs = (params) => Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && String(v) !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');

function apiError(status, json, fallback) {
    const msg = json?.message || json?.error || json?.msg;
    if (msg) return new Error(String(msg).slice(0, 160));
    if (status === 429) return new Error('Server lagi ramai, coba lagi sebentar.');
    if (status >= 500) return new Error('Server API lagi error, coba lagi nanti.');
    return new Error(fallback || `API membalas ${status}`);
}

async function request(group, path, params, timeout) {
    let res;
    try {
        res = await fetch(`${ROOT}/${group}/${path}?${qs(params)}`, { headers: UA, signal: AbortSignal.timeout(timeout) });
    } catch (e) {
        if (e?.name === 'TimeoutError' || e?.name === 'AbortError') throw new Error('Server terlalu lama merespon, coba lagi sebentar.');
        throw new Error('Tidak bisa terhubung ke server API.');
    }
    return res;
}

/** Panggil endpoint JSON, kembalikan isi `data` (atau `result`). */
async function callJson(group, path, params, timeout = 120000) {
    const res = await request(group, path, params, timeout);
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* bukan JSON */ }
    if (!res.ok || (json && (json.status === false || json.success === false))) throw apiError(res.status, json, 'Permintaan ditolak oleh API.');
    if (json == null) {
        if (text.trim()) return text.trim();
        throw new Error('Respon API kosong.');
    }
    return json.data ?? json.result ?? json;
}

/** Panggil endpoint yang menghasilkan gambar. Kembalikan Buffer gambar. */
async function callImage(group, path, params, timeout = 120000) {
    const res = await request(group, path, params, timeout);
    let buf = Buffer.from(await res.arrayBuffer());
    if (sniffType(buf)) return buf;

    let json = null;
    const text = buf.toString('utf8').trim();
    try { json = JSON.parse(text); } catch { /* bukan JSON */ }
    if (!res.ok || (json && (json.status === false || json.success === false))) throw apiError(res.status, json, 'Gagal membuat gambar.');

    const urls = [];
    (function walk(v) {
        if (typeof v === 'string') { if (/^https?:\/\/\S+$/.test(v)) urls.push(v); }
        else if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    })(json ?? text);
    const url = urls.find(u => /\.(jpe?g|png|webp|gif)(\?|$)/i.test(u)) || urls[0];
    if (!url) throw new Error('Respon API tidak berisi gambar.');
    const img = await fetch(url, { headers: UA, signal: AbortSignal.timeout(60000) });
    if (!img.ok) throw new Error(`Gagal mengambil hasil (${img.status}).`);
    buf = Buffer.from(await img.arrayBuffer());
    if (!sniffType(buf)) throw new Error('Hasil dari API bukan gambar.');
    return buf;
}

/**
 * Panggil endpoint apa pun, hasilnya bisa JSON atau file langsung (gambar / video / audio / zip / apk).
 * Kembalikan { json } untuk JSON/teks, atau { buffer, mime } untuk file.
 */
async function callAny(group, path, params, timeout = 120000) {
    const res = await request(group, path, params, timeout);
    const mime = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const len = Number(res.headers.get('content-length')) || 0;
    if (len > 80 * 1024 * 1024) throw new Error('Hasil terlalu besar untuk dikirim lewat WhatsApp.');
    const buffer = Buffer.from(await res.arrayBuffer());

    const asText = !mime || /json|text|xml|javascript/.test(mime);
    if (asText) {
        const text = buffer.toString('utf8').trim();
        let json = null;
        try { json = JSON.parse(text); } catch { /* bukan JSON */ }
        if (!res.ok || (json && (json.status === false || json.success === false))) throw apiError(res.status, json, 'Permintaan ditolak oleh API.');
        if (json == null) {
            if (!text) throw new Error('Respon API kosong.');
            return { json: text };
        }
        return { json: json.data ?? json.result ?? json };
    }
    if (!res.ok) throw apiError(res.status, null, 'Permintaan ditolak oleh API.');
    if (!buffer.length) throw new Error('Respon API kosong.');
    return { buffer, mime, disposition: res.headers.get('content-disposition') || '' };
}

/** Ambil jawaban teks dari berbagai bentuk respon AI. */
function extractText(data) {
    if (data == null) return '';
    if (typeof data === 'string') return data.trim();
    const keys = ['response', 'answer', 'reply', 'result', 'text', 'message', 'content', 'output', 'data'];
    if (typeof data === 'object' && !Array.isArray(data)) {
        for (const k of keys) {
            if (data[k] != null) { const t = extractText(data[k]); if (t) return t; }
        }
    }
    if (Array.isArray(data)) {
        const t = data.map(extractText).filter(Boolean).join('\n');
        if (t) return t;
    }
    // terakhir: string terpanjang di dalam objek (selain link & pertanyaan)
    let best = '';
    (function walk(v, key, depth) {
        if (depth > 4 || v == null) return;
        if (typeof v === 'string') { if (!/^(question|prompt|query|text_input)$/i.test(key || '') && v.length > best.length) best = v; }
        else if (Array.isArray(v)) v.forEach(x => walk(x, key, depth + 1));
        else if (typeof v === 'object') Object.entries(v).forEach(([k, x]) => walk(x, k, depth + 1));
    })(data, '', 0);
    return best.trim();
}

/** Foto profil abu-abu polos (dipakai kalau pengirim menyembunyikan foto profilnya). */
let placeholderUrl = null;
async function placeholderAvatar() {
    if (placeholderUrl) return placeholderUrl;
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="#9aa4b2"/><circle cx="256" cy="200" r="90" fill="#e8ecf1"/><path d="M76 470c0-100 80-170 180-170s180 70 180 170z" fill="#e8ecf1"/></svg>';
    placeholderUrl = await uploadImage(await sharp(Buffer.from(svg)).png().toBuffer());
    return placeholderUrl;
}

module.exports = { callJson, callImage, callAny, extractText, placeholderAvatar, uploadImage };
