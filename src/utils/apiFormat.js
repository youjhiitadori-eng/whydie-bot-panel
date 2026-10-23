// Pembaca respon API yang fleksibel: apa pun bentuk JSON-nya diubah jadi teks WhatsApp yang rapi.
const { collectLinks } = require('./downloader');

const TITLE_KEYS = ['title', 'judul', 'name', 'nama', 'headline', 'text', 'username', 'label'];
const LINK_KEYS = ['url', 'link', 'href', 'permalink'];
const DATE_KEYS = ['date', 'pubDate', 'pubdate', 'published', 'publishedAt', 'published_at', 'time', 'tanggal', 'waktu', 'created_at', 'updated', 'updated_at', 'datetime'];
const DESC_KEYS = ['description', 'desc', 'deskripsi', 'summary', 'snippet', 'excerpt', 'content', 'body'];
const LIST_KEYS = ['items', 'list', 'results', 'result', 'articles', 'posts', 'news', 'berita', 'data', 'comics', 'comments', 'episodes', 'chapters', 'tracks', 'videos'];
const MAX_TEXT = 3800;

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const prim = (v) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
const clean = (s) => String(s).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

function pick(o, keys) {
    for (const k of keys) {
        const hit = Object.keys(o).find(x => x.toLowerCase() === k.toLowerCase());
        if (hit && prim(o[hit]) && String(o[hit]).trim() !== '') return { key: hit, value: clean(o[hit]) };
    }
    return null;
}

function humanize(key) {
    const s = String(key).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim();
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function fmtValue(v) {
    if (typeof v === 'boolean') return v ? 'Ya' : 'Tidak';
    if (typeof v === 'number') return Number.isInteger(v) && Math.abs(v) >= 1000 ? v.toLocaleString('id-ID') : String(v);
    return clean(v);
}

/** Satu item daftar (berita, komik, hasil pencarian) -> beberapa baris. */
function itemLines(o, idx) {
    if (prim(o)) return [`${idx}. ${clip(clean(o), 200)}`];
    if (!isObj(o)) return [];
    const title = pick(o, TITLE_KEYS);
    const link = pick(o, LINK_KEYS);
    const date = pick(o, DATE_KEYS);
    const desc = pick(o, DESC_KEYS);
    const used = new Set([title?.key, link?.key, date?.key, desc?.key]);
    const lines = [`${idx}. *${clip(title ? title.value : 'Item', 160)}*`];
    if (date) lines.push(`   🕒 ${clip(date.value, 60)}`);
    if (desc && desc.value !== title?.value) lines.push(`   ${clip(desc.value, 140)}`);
    // data tambahan singkat (author, rating, chapter, dll)
    let extra = 0;
    for (const [k, v] of Object.entries(o)) {
        if (used.has(k) || extra >= 3 || !prim(v) || String(v).trim() === '') continue;
        if (/^(id|slug|image|img|thumb|thumbnail|poster|cover|avatar|photo|picture)/i.test(k) || /^https?:\/\//i.test(String(v))) continue;
        lines.push(`   ▫️ ${humanize(k)}: ${clip(fmtValue(v), 80)}`);
        extra++;
    }
    if (link) lines.push(`   🔗 ${link.value}`);
    return lines;
}

function objectLines(o, depth = 0, skipKeys = new Set()) {
    const pad = '  '.repeat(depth);
    const out = [];
    for (const [k, v] of Object.entries(o)) {
        if (skipKeys.has(k) || v == null || v === '') continue;
        if (typeof v === 'string' && /^https?:\/\//i.test(v) && /(avatar|photo|picture|thumb|image|poster|cover|\bpp\b|pfp|icon)/i.test(k)) continue; // gambar dikirim terpisah
        if (prim(v)) {
            const s = fmtValue(v);
            if (s) out.push(`${pad}▫️ *${humanize(k)}:* ${clip(s, 400)}`);
        } else if (Array.isArray(v)) {
            if (!v.length) continue;
            if (v.every(prim)) out.push(`${pad}▫️ *${humanize(k)}:* ${clip(v.slice(0, 12).map(fmtValue).join(', '), 400)}`);
            else if (depth < 1) {
                out.push(`${pad}▫️ *${humanize(k)}:*`);
                v.slice(0, 6).forEach((x, i) => out.push(...itemLines(x, i + 1).map(l => pad + l)));
            }
        } else if (isObj(v) && depth < 2) {
            const sub = objectLines(v, depth + 1);
            if (sub.length) out.push(`${pad}▫️ *${humanize(k)}:*`, ...sub);
        }
    }
    return out;
}

function bestList(data) {
    if (Array.isArray(data)) return { key: null, list: data };
    if (!isObj(data)) return null;
    let best = null;
    for (const k of Object.keys(data)) {
        const v = data[k];
        if (!Array.isArray(v) || !v.length || !v.some(isObj)) continue;
        const score = v.length + (LIST_KEYS.includes(k.toLowerCase()) ? 0.5 : 0);
        if (!best || score > best.score) best = { key: k, list: v, score };
    }
    if (best) return best;
    for (const v of Object.values(data)) {   // data bersarang: { data: { items: [...] } }
        if (isObj(v)) { const r = bestList(v); if (r && r.list.length > 1) return r; }
    }
    return null;
}

/** Ubah data respon apa pun jadi teks rapi. opts: { limit } */
function renderData(data, opts = {}) {
    const limit = opts.limit || 12;
    if (data == null) return '';
    if (typeof data === 'string') return clip(data.trim(), MAX_TEXT);
    if (prim(data)) return fmtValue(data);

    const found = bestList(data);
    let lines = [];
    if (found && found.list.length > 1) {
        if (isObj(data) && found.key) {
            const head = objectLines(Object.fromEntries(Object.entries(data).filter(([k, v]) => k !== found.key && prim(v))));
            lines.push(...head.slice(0, 6));
            if (lines.length) lines.push('');
        }
        const shown = found.list.slice(0, limit);
        shown.forEach((x, i) => lines.push(...itemLines(x, i + 1), ''));
        if (found.list.length > shown.length) lines.push(`_…dan ${found.list.length - shown.length} lainnya_`);
    } else {
        lines = objectLines(isObj(data) ? data : { data });
        if (isObj(data) && !lines.length && found) lines = found.list.flatMap((x, i) => itemLines(x, i + 1));
    }
    let text = lines.join('\n').trim();
    if (text.length > MAX_TEXT) text = text.slice(0, MAX_TEXT).replace(/\n[^\n]*$/, '') + '\n_…(dipotong)_';
    return text;
}

/** Foto profil / gambar utama di dalam respon (untuk stalker). */
function pickPicture(data) {
    const links = collectLinks(data);
    const keyed = links.find(l => /(avatar|profile|\bpp\b|photo|picture|pfp|thumb|image|icon)/i.test(l.key) && l.kind !== 'video' && l.kind !== 'audio');
    return (keyed || links.find(l => l.kind === 'image'))?.url || '';
}

module.exports = { renderData, pickPicture, clean };
