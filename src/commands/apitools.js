// 6 kategori API: INFO, KOMIK, MAKER, SEARCH, STALKER, TOOLS  (daftar fitur: src/utils/apiList.js)
//   Input dipisah tanda |  ->  .brat haloo | putih      (satu isian saja = tulis langsung, tanpa |)
//   Parameter gambar: kirim / reply foto, atau tempel link gambar.
const sharp = require('sharp');
const config = require('../config');
const { FEATURES, GROUPS } = require('../utils/apiList');
const { callAny, placeholderAvatar, uploadImage } = require('../utils/xrinaApi');
const { renderData, pickPicture } = require('../utils/apiFormat');
const { collectLinks, nameFromUrl } = require('../utils/downloader');
const { getImageBuffer, getQuotedText } = require('../utils/mediaHelper');

const URL_RE = /^https?:\/\/\S+$/i;
const UA = { 'User-Agent': 'Mozilla/5.0 (Nayla-AI)' };
const EXT = { web2apk: 'apk', webtozip: 'zip' };

function helpText(name, f) {
    const p = config.prefix;
    const shown = f.params.filter(x => !x.self);
    const rows = shown.map(x => {
        const need = x.optional || x.def !== undefined ? `opsional${x.def ? `, default: ${x.def}` : ''}` : 'wajib';
        return `${x.kind === 'image' ? '🖼️' : x.kind === 'url' ? '🔗' : '✏️'} ${x.label} _(${need})_`;
    });
    const fmt = shown.length ? ` ${shown.map(x => `<${x.label}>`).join(' | ')}` : '';
    return [
        `${GROUPS[f.group].icon} *${f.label}*`,
        ...(rows.length ? ['', ...rows] : []),
        '',
        `Format: *${p}${f.name}${fmt}*`,
        ...(f.example ? [`Contoh: *${p}${f.name} ${f.example}*`] : []),
        ...(f.note ? ['', `💡 ${f.note}`] : []),
        ...(shown.length > 1 ? ['', '_Pisahkan setiap isian dengan tanda |_'] : []),
    ].join('\n');
}

async function profilePic(m) {
    try {
        const url = await m.Nayla.profilePictureUrl(m.msg.key.participant || m.sender, 'image');
        if (url) return url;
    } catch { /* foto disembunyikan */ }
    return placeholderAvatar();
}

/** Pecah 2 emoji tanpa pemisah ("😎😍") jadi dua bagian. */
function splitEmoji(s) {
    try {
        const seg = [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(s)].map(x => x.segment).filter(x => x.trim());
        return seg.length === 2 ? seg : null;
    } catch { return null; }
}

/** Baca input user -> objek parameter API. Lempar { help: true } kalau ada isian wajib yang kosong. */
async function buildParams(m, f) {
    let raw = (m.command.fullArgs || '').trim();
    if (!raw && f.params[0]?.multiline) raw = (getQuotedText(m) || '').trim();

    const params = {};
    const queue = [];                                   // parameter yang diisi dari teks
    const hasImg = f.params.some(x => x.kind === 'image');
    let media = null;
    if (hasImg) { try { media = await getImageBuffer(m); } catch { media = null; } }
    let uploaded = null;

    for (const x of f.params) {
        if (x.kind !== 'image') { queue.push(x); continue; }
        if (media) {
            uploaded = uploaded || await uploadImage(media);
            params[x.key] = uploaded;
        } else if (x.self) {
            const hit = raw.match(/https?:\/\/[^\s|]+/);
            if (hit) { params[x.key] = hit[0]; raw = raw.replace(hit[0], ' ').trim(); }
            else params[x.key] = await profilePic(m);
        } else queue.push(x);
    }

    let segs;
    if (queue.length <= 1) segs = raw ? [raw] : [];
    else if (raw.includes('|')) segs = raw.split('|').map(s => s.trim()).filter((s, i, a) => s || i < a.length - 1);
    else if (f.spaceSplit) {
        const parts = raw.split(/\s+/).filter(Boolean);
        segs = parts.length > queue.length ? [...parts.slice(0, queue.length - 1), parts.slice(queue.length - 1).join(' ')] : parts;
    } else segs = raw ? [raw] : [];
    if (f.name === 'emojimix' && segs.length === 1) segs = splitEmoji(segs[0]) || segs;
    if (segs.length > queue.length && queue[0]?.multiline) {   // teks panjang yang mengandung "|"
        const extra = segs.length - queue.length;
        segs = [segs.slice(0, extra + 1).join(' | '), ...segs.slice(extra + 1)];
    }

    queue.forEach((x, i) => {
        let v = (segs[i] || '').trim();
        if (!v && x.def !== undefined) v = x.def === '@sender' ? (m.pushname || 'Kak') : x.def;
        if (!v) { if (x.optional || x.def === '') return; throw Object.assign(new Error('help'), { help: true }); }
        if ((x.kind === 'url' || x.kind === 'image') && !URL_RE.test(v)) throw Object.assign(new Error('bad-url'), { help: true, why: `⚠️ *${x.label}* harus berupa link (diawali http:// atau https://).` });
        params[x.key] = v;
    });
    return params;
}

const mimeKind = (mime) => (mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : 'file');

async function toSticker(buf, mime) {
    if (mime === 'image/webp') return buf;
    return sharp(buf).resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 90 }).toBuffer();
}

async function download(url, max = 60 * 1024 * 1024) {
    const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(90000) });
    if (!res.ok) throw new Error(`Gagal mengambil hasil (${res.status}).`);
    const mime = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > max) throw new Error('Hasil terlalu besar untuk dikirim lewat WhatsApp.');
    return { buf, mime };
}

const caption = (f) => `✅ *${f.label}*\n\n_${config.botName} • ${config.ownerName}_`;

/** Kirim file mentah (buffer) sesuai jenisnya. */
async function sendBuffer(m, f, buf, mime, disposition) {
    const opts = { quoted: m.msg };
    const kind = mimeKind(mime);
    if (f.want === 'sticker' && (kind === 'image')) {
        try { return await m.Nayla.sendMessage(m.sender, { sticker: await toSticker(buf, mime) }, opts); }
        catch (e) { console.error('[APITOOLS] gagal jadi stiker:', e.message); }
    }
    if (kind === 'image') return m.Nayla.sendMessage(m.sender, { image: buf, caption: caption(f) }, opts);
    if (kind === 'video') return m.Nayla.sendMessage(m.sender, { video: buf, caption: caption(f), mimetype: mime === 'image/gif' ? 'video/mp4' : mime, gifPlayback: f.want === 'sticker' }, opts);
    if (kind === 'audio') return m.Nayla.sendMessage(m.sender, { audio: buf, mimetype: mime.includes('mpeg') || mime.includes('mp3') ? 'audio/mpeg' : mime }, opts);
    const cd = decodeURIComponent((disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i) || [])[1] || '');
    const fileName = cd || `${f.name}.${EXT[f.name] || 'bin'}`;
    return m.Nayla.sendMessage(m.sender, { document: buf, fileName, mimetype: mime || 'application/octet-stream', caption: caption(f) }, opts);
}

/** Kirim hasil lewat link (JSON berisi URL media). Kembalikan true kalau terkirim. */
async function sendFromLinks(m, f, data) {
    const links = collectLinks(data);
    const opts = { quoted: m.msg };
    if (f.want === 'images') {
        const imgs = links.filter(l => l.kind === 'image' || (l.kind === 'unknown' && !/\.(mp4|mp3|m4a|html?|json)(\?|$)/i.test(l.url))).slice(0, f.max || 5);
        let sent = 0;
        for (const it of imgs) {
            try { await m.Nayla.sendMessage(m.sender, { image: { url: it.url }, caption: sent === 0 ? caption(f) : undefined }, opts); sent++; } catch { /* lewati yang gagal */ }
        }
        return sent > 0;
    }
    const want = f.want === 'sticker' ? 'image' : f.want;
    const link = links.find(l => l.kind === want)
        || links.find(l => l.kind === 'unknown' && want !== 'file')
        || (want === 'file' ? links.find(l => l.kind !== 'cover') : null);
    if (!link) return false;
    try {
        if (f.want === 'sticker') {
            const { buf, mime } = await download(link.url);
            await sendBuffer(m, f, buf, mime.startsWith('image/') ? mime : 'image/png', '');
        } else if (want === 'image') await m.Nayla.sendMessage(m.sender, { image: { url: link.url }, caption: caption(f) }, opts);
        else if (want === 'video') await m.Nayla.sendMessage(m.sender, { video: { url: link.url }, caption: caption(f), mimetype: 'video/mp4' }, opts);
        else if (want === 'audio') await m.Nayla.sendMessage(m.sender, { audio: { url: link.url }, mimetype: 'audio/mpeg' }, opts);
        else await m.Nayla.sendMessage(m.sender, { document: { url: link.url }, fileName: nameFromUrl(link.url) || `${f.name}.${EXT[f.name] || 'bin'}`, mimetype: 'application/octet-stream', caption: caption(f) }, opts);
        return true;
    } catch (e) {
        console.error('[APITOOLS] gagal kirim media:', e.message);
        await m.reply({ text: `⚠️ Gagal mengirim langsung. Buka lewat link ini:\n${link.url}` });
        return true;
    }
}

async function sendText(m, f, data) {
    let text = renderData(data, { limit: f.group === 'info' ? 10 : 12 });
    if (!text) throw new Error('API tidak mengembalikan data. Coba cek isiannya lalu ulangi.');
    text = `${GROUPS[f.group].icon} *${f.label}*\n\n${text}\n\n_${config.botName} • ${config.ownerName}_`;
    const pic = f.pic ? pickPicture(data) : '';
    if (pic) {
        try {
            if (text.length <= 1000) return await m.Nayla.sendMessage(m.sender, { image: { url: pic }, caption: text }, { quoted: m.msg });
            await m.Nayla.sendMessage(m.sender, { image: { url: pic } }, { quoted: m.msg });
        } catch { /* foto gagal: kirim teks saja */ }
    }
    return m.reply({ text });
}

const handler = async (m) => {
    const f = FEATURES[m.command.name];
    if (!f) return;

    let params;
    try { params = await buildParams(m, f); }
    catch (e) {
        if (!e.help) { await m.reply({ text: `❌ ${e.message}` }); return; }
        return m.reply({ text: `${e.why ? e.why + '\n\n' : ''}${helpText(m.command.name, f)}` });
    }

    await m.react('⏳');
    if (f.slow) m.reply({ text: `⏳ *${f.label}* lagi diproses, bisa sampai beberapa menit. Tunggu ya…` }).catch(() => { });
    try {
        const res = await callAny(f.group, f.path, { ...(f.fixed || {}), ...params }, f.slow ? 300000 : 120000);
        if (res.buffer) {
            await sendBuffer(m, f, res.buffer, res.mime, res.disposition);
        } else if (f.want === 'text' || !(await sendFromLinks(m, f, res.json))) {
            await sendText(m, f, res.json);
        }
        await m.react('✅');
    } catch (e) {
        console.error(`[APITOOLS] ${m.command.name}:`, e.message);
        await m.react('❌');
        await m.reply({ text: `❌ ${e.message}` });
    }
};

// Dipakai PluginLoader (file ini sengaja tanpa kata kunci switch-case)
handler.commands = Object.keys(FEATURES);

module.exports = handler;
