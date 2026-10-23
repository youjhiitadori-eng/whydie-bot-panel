// Klien API AI Image: upload foto -> panggil API -> kembalikan buffer gambar hasil
const BASE = process.env.AI_IMAGE_BASE || 'https://apiii-xrina.my.id/ai-image';
const UA = { 'User-Agent': 'Mozilla/5.0 (Nayla-AI)' };

function sniffType(buf) {
    if (!buf || buf.length < 12) return null;
    if (buf[0] === 0xFF && buf[1] === 0xD8) return { mime: 'image/jpeg', ext: 'jpg' };
    if (buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG') return { mime: 'image/png', ext: 'png' };
    if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
    if (buf.toString('latin1', 0, 3) === 'GIF') return { mime: 'image/gif', ext: 'gif' };
    return null;
}

/** Upload foto ke hosting sementara supaya API bisa mengambilnya lewat URL. */
async function uploadImage(buffer) {
    const type = sniffType(buffer) || { mime: 'image/jpeg', ext: 'jpg' };
    const errors = [];

    try {
        const form = new FormData();
        form.append('reqtype', 'fileupload');
        form.append('fileToUpload', new Blob([buffer], { type: type.mime }), `nayla.${type.ext}`);
        const res = await fetch('https://catbox.moe/user/api.php', { method: 'POST', body: form, headers: UA, signal: AbortSignal.timeout(60000) });
        const text = (await res.text()).trim();
        if (/^https?:\/\/\S+$/.test(text)) return text;
        errors.push('catbox: ' + text.slice(0, 80));
    } catch (e) { errors.push('catbox: ' + e.message); }

    try {
        const form = new FormData();
        form.append('files[]', new Blob([buffer], { type: type.mime }), `nayla.${type.ext}`);
        const res = await fetch('https://uguu.se/upload', { method: 'POST', body: form, headers: UA, signal: AbortSignal.timeout(60000) });
        const json = await res.json();
        const url = json?.files?.[0]?.url;
        if (url) return url;
        errors.push('uguu: respons tidak berisi url');
    } catch (e) { errors.push('uguu: ' + e.message); }

    throw new Error('Upload foto gagal (' + errors.join('; ') + ')');
}

function findUrl(node) {
    const urls = [];
    (function walk(v) {
        if (typeof v === 'string') { if (/^https?:\/\/\S+$/.test(v)) urls.push(v); }
        else if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    })(node);
    return urls.find(u => /\.(jpe?g|png|webp|gif)(\?|$)/i.test(u)) || urls[0] || null;
}

/** Panggil fitur. params: { url } atau { prompt, ... } */
async function generate(feature, params) {
    const qs = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    const res = await fetch(`${BASE}/${feature}?${qs}`, { headers: UA, signal: AbortSignal.timeout(180000) });
    if (!res.ok) throw new Error(`API membalas ${res.status}`);

    let buf = Buffer.from(await res.arrayBuffer());
    if (!sniffType(buf)) {
        const text = buf.toString('utf8').trim();
        let json = null;
        try { json = JSON.parse(text); } catch { /* bukan JSON */ }
        if (json && (json.status === false || json.success === false)) {
            throw new Error(String(json.message || json.error || 'API menolak permintaan').slice(0, 120));
        }
        const url = json ? findUrl(json) : (/^https?:\/\/\S+$/.test(text) ? text : null);
        if (!url) throw new Error('Respons API tidak berisi gambar');
        const img = await fetch(url, { headers: UA, signal: AbortSignal.timeout(60000) });
        if (!img.ok) throw new Error(`Gagal ambil hasil (${img.status})`);
        buf = Buffer.from(await img.arrayBuffer());
        if (!sniffType(buf)) throw new Error('Hasil dari API bukan gambar');
    }
    return buf;
}

module.exports = { uploadImage, generate, sniffType };
