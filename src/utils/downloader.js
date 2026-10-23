// Pemanggil API download + pembaca respon yang fleksibel (format tiap endpoint bisa beda-beda)
const config = require('../config');

const API_TIMEOUT = 90 * 1000;
const SNIFF_TIMEOUT = 8 * 1000;
const URL_RE = /^https?:\/\//i;
const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36';

const base = () => String(config.downloadApi || 'https://apiii-xrina.my.id/download').replace(/\/+$/, '');

/** Panggil endpoint, kembalikan isi `data`. Lempar Error berpesan ramah kalau gagal. */
async function callApi(path, params) {
    const qs = new URLSearchParams(params).toString();
    let res;
    try {
        res = await fetch(`${base()}/${path}?${qs}`, { signal: AbortSignal.timeout(API_TIMEOUT), headers: { 'User-Agent': UA } });
    } catch (e) {
        if (e?.name === 'TimeoutError' || e?.name === 'AbortError') throw new Error('Server downloader terlalu lama merespon, coba lagi sebentar.');
        throw new Error('Tidak bisa terhubung ke server downloader.');
    }
    let json = null;
    try { json = await res.json(); } catch { /* bukan JSON */ }

    if (!res.ok || !json || json.status === false) {
        const apiMsg = json?.message || json?.error;
        if (res.status >= 500) throw new Error(apiMsg || 'Server downloader lagi error, coba lagi nanti.');
        throw new Error(apiMsg || 'Link tidak valid atau media tidak ditemukan.');
    }
    return json.data ?? json.result ?? json;
}

/** Jenis link dari ekstensi / nama field. 'cover' = thumbnail (tidak dikirim sebagai media utama). */
function kindOf(url, key) {
    const u = url.toLowerCase();
    const k = String(key || '').toLowerCase();
    if (/(cover|thumb|poster|avatar|preview|icon)/.test(k)) return 'cover';
    if (/\.(mp3|m4a|opus|ogg|wav|aac)(\?|$)/.test(u) || /[?&]type=(mp3|m4a)/.test(u) || /(audio|music|mp3)/.test(k)) return 'audio';
    if (/\.(mp4|mov|webm|mkv|m4v)(\?|$)/.test(u) || /[?&]type=mp4/.test(u) || /video/.test(k)) return 'video';
    if (/\.(jpe?g|png|webp|gif)(\?|$)/.test(u)) return 'image';
    return 'unknown';
}

/** Kumpulkan semua link http(s) di dalam data (urut sesuai respon), tanpa duplikat. */
function collectLinks(data) {
    const items = [];
    const seen = new Set();
    const walk = (val, key, depth) => {
        if (depth > 4 || val == null) return;
        if (typeof val === 'string') {
            if (URL_RE.test(val) && !seen.has(val)) { seen.add(val); items.push({ url: val, key, kind: kindOf(val, key) }); }
        } else if (Array.isArray(val)) {
            for (const v of val) walk(v, key, depth + 1);
        } else if (typeof val === 'object') {
            for (const [k, v] of Object.entries(val)) walk(v, k, depth + 1);
        }
    };
    walk(data, 'data', 0);
    return items;
}

/** Cek tipe & ukuran file tanpa mengunduhnya. */
async function sniff(url) {
    const tryFetch = async (init) => {
        const res = await fetch(url, { ...init, redirect: 'follow', signal: AbortSignal.timeout(SNIFF_TIMEOUT), headers: { 'User-Agent': UA, ...(init.headers || {}) } });
        const mime = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
        const range = res.headers.get('content-range');
        const size = range ? Number(range.split('/')[1]) : Number(res.headers.get('content-length'));
        const cd = res.headers.get('content-disposition') || '';
        const name = decodeURIComponent((cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i) || [])[1] || '');
        try { res.body?.cancel(); } catch { /* abaikan */ }
        return { ok: res.ok, mime, size: Number.isFinite(size) && size > 0 ? size : 0, name };
    };
    try {
        const head = await tryFetch({ method: 'HEAD' });
        if (head.ok && head.mime) return head;
    } catch { /* coba GET */ }
    try {
        const got = await tryFetch({ method: 'GET', headers: { Range: 'bytes=0-0' } });
        if (got.ok) return got;
    } catch { /* abaikan */ }
    return { ok: false, mime: '', size: 0, name: '' };
}

function kindFromMime(mime) {
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/')) return 'audio';
    if (mime.startsWith('image/')) return 'image';
    return 'unknown';
}

/** Nama file dari URL (tanpa query) */
function nameFromUrl(url) {
    try {
        const last = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || '');
        return /\.[a-z0-9]{2,5}$/i.test(last) ? last : '';
    } catch { return ''; }
}

module.exports = { callApi, collectLinks, kindOf, kindFromMime, sniff, nameFromUrl };
