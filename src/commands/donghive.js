// DONGHIVE: nonton / unduh donghua (anime China sub indo)
//   .donghive [halaman]      -> katalog donghua terbaru
//   .dhseries <no / link>    -> detail + daftar episode
//   .dhepisode <no / link> [stream]  -> link episode (tambah kata "stream" untuk link streaming)
// Hasil katalog & episode diingat per chat, jadi cukup ketik nomornya (contoh: .dhseries 3).
const config = require('../config');
const settings = require('../utils/settings');
const { callJson } = require('../utils/xrinaApi');
const { kindOf } = require('../utils/downloader');

const SITE = 'https://donghive.vip';
const TTL = 30 * 60 * 1000;
const memory = new Map(); // chat -> { at, catalog: [], episodes: [], series }

const str = (v) => (typeof v === 'string' || typeof v === 'number') ? String(v).trim() : '';
const clip = (s, n) => s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
const isUrl = (s) => /^https?:\/\//i.test(s);

function mem(chat) {
    const now = Date.now();
    let e = memory.get(chat);
    if (!e || now - e.at > TTL) { e = { at: now, catalog: [], episodes: [], series: null }; memory.set(chat, e); }
    e.at = now;
    return e;
}
setInterval(() => { const now = Date.now(); for (const [k, v] of memory) if (now - v.at > TTL) memory.delete(k); }, 10 * 60 * 1000).unref?.();

/** Cari array objek yang punya link (daftar episode / item). */
function findList(node, depth = 0) {
    if (depth > 4 || node == null) return [];
    if (Array.isArray(node)) {
        const objs = node.filter(x => x && typeof x === 'object' && !Array.isArray(x));
        if (objs.length && objs.some(x => linkOf(x))) return objs;
        for (const x of node) { const r = findList(x, depth + 1); if (r.length) return r; }
        return [];
    }
    if (typeof node === 'object') {
        for (const k of ['episodes', 'episode', 'items', 'list', 'chapters', 'results']) {
            if (Array.isArray(node[k])) { const r = findList(node[k], depth + 1); if (r.length) return r; }
        }
        for (const v of Object.values(node)) { const r = findList(v, depth + 1); if (r.length) return r; }
    }
    return [];
}
const linkOf = (x) => str(x.url) || str(x.link) || str(x.href) || '';
const titleOf = (x) => str(x.title) || str(x.name) || str(x.episode) || str(x.label) || str(x.number) || '';

function pick(obj, keys) {
    for (const k of keys) { const v = obj?.[k]; const s = Array.isArray(v) ? v.map(str).filter(Boolean).join(', ') : str(v); if (s) return s; }
    return '';
}
const pickDeep = (data, keys) => pick(data, keys) || pick(data?.info, keys) || pick(data?.detail, keys) || pick(data?.series, keys);

function toSeriesUrl(input) {
    if (isUrl(input)) return input;
    const slug = input.replace(/^\/+|\/+$/g, '');
    return /^[a-z0-9-]+$/i.test(slug) ? `${SITE}/${slug.toLowerCase()}/` : '';
}

async function sendMenuList(m, text, rows, title) {
    // Tombol hanya di grup / kalau dmButtons aktif; kalau gagal, teks biasa sudah terkirim.
    if (!(settings.isButtonOn(m.sender) && (m.isGroup || config.dmButtons === true))) return;
    try {
        await m.sendList({ text, footer: config.footerTxt, buttonTitle: '📂 Pilih', sections: [{ title, rows }], quoted: m.msg });
    } catch { /* abaikan */ }
}

const handler = async (m) => {
    const name = m.command.name;
    const p = config.prefix;
    const chat = mem(m.sender);
    const args = m.command.args;

    // ---------- KATALOG ----------
    if (name === 'donghive' || name === 'dhcatalog') {
        const page = Math.max(1, parseInt(args[0], 10) || 1);
        await m.react('⏳');
        try {
            const data = await callJson('donghive', 'catalog', { pages: page });
            const items = findList(data).filter(x => linkOf(x));
            if (!items.length) throw new Error('Katalog kosong / tidak bisa dibaca.');
            chat.catalog = items.map(x => ({ title: titleOf(x), url: linkOf(x), poster: str(x.poster) || str(x.image) || str(x.thumbnail), type: str(x.type), sub: str(x.sub), hot: !!x.hot }));

            const lines = chat.catalog.map((x, i) => `${String(i + 1).padStart(2, '0')}. ${x.hot ? '🔥 ' : ''}*${x.title}*${x.sub ? ` _(${x.sub})_` : ''}`);
            const text = [
                '🐉 *DONGHIVE*',
                `Katalog donghua • Halaman ${page}`,
                '',
                ...lines,
                '',
                `➥ Ketik *${p}dhseries <nomor>* untuk detail & episode`,
                `➥ Halaman lain: *${p}donghive ${page + 1}*`,
            ].join('\n');

            const cover = chat.catalog.find(x => x.poster)?.poster;
            let sent = false;
            if (cover && text.length <= 1000) {
                try { await m.Nayla.sendMessage(m.sender, { image: { url: cover }, caption: text }, { quoted: m.msg }); sent = true; } catch { /* kirim teks saja */ }
            }
            if (!sent) await m.reply({ text });
            await sendMenuList(m, 'Pilih donghua:', chat.catalog.slice(0, 20).map((x, i) => ({ title: clip(x.title, 24), description: x.sub || 'Lihat detail', id: `${p}dhseries ${i + 1}` })), `Halaman ${page}`);
            await m.react('✅');
        } catch (e) {
            await m.react('❌');
            await m.reply({ text: `❌ ${e.message}` });
        }
        return;
    }

    // ---------- DETAIL SERIES ----------
    if (name === 'dhseries' || name === 'dhserial') {
        const arg = (m.command.fullArgs || '').trim().split(/\s+/)[0] || '';
        if (!arg) return m.reply({ text: `🐉 *Detail Donghua*\nFormat: *${p}dhseries <nomor katalog / link / slug>*\nContoh: *${p}dhseries 3*\nLihat katalog dulu: *${p}donghive*` });
        let url = '';
        if (/^\d{1,3}$/.test(arg)) {
            const it = chat.catalog[parseInt(arg, 10) - 1];
            if (!it) return m.reply({ text: `⚠️ Nomor ${arg} tidak ada. Ketik *${p}donghive* dulu untuk membuka katalog.` });
            url = it.url;
        } else url = toSeriesUrl(arg);
        if (!url) return m.reply({ text: '⚠️ Link / slug donghua tidak valid.' });

        await m.react('⏳');
        try {
            const data = await callJson('donghive', 'series', { url });
            const eps = findList(data).filter(x => linkOf(x));
            const title = pickDeep(data, ['title', 'name']) || 'Donghua';
            const poster = pickDeep(data, ['poster', 'image', 'thumbnail', 'cover']);
            const synopsis = pickDeep(data, ['synopsis', 'sinopsis', 'description', 'desc', 'overview']);
            const meta = [
                ['📺 Status', pickDeep(data, ['status'])], ['🎞️ Tipe', pickDeep(data, ['type'])],
                ['🏷️ Genre', pickDeep(data, ['genres', 'genre'])], ['⭐ Rating', pickDeep(data, ['rating', 'score'])],
                ['📅 Rilis', pickDeep(data, ['released', 'release', 'year', 'aired'])], ['🏢 Studio', pickDeep(data, ['studio'])],
            ].filter(([, v]) => v).map(([k, v]) => `${k}: ${clip(v, 120)}`);

            chat.series = { title, url };
            chat.episodes = eps.map(x => ({ title: titleOf(x) || 'Episode', url: linkOf(x) }));

            const head = [`🐉 *${title}*`, ...meta, ...(synopsis ? ['', clip(synopsis, 550)] : [])].join('\n');
            if (poster) await m.Nayla.sendMessage(m.sender, { image: { url: poster }, caption: head }, { quoted: m.msg }).catch(() => m.reply({ text: head }));
            else await m.reply({ text: head });

            if (chat.episodes.length) {
                const shown = chat.episodes.slice(0, 60);
                const lines = shown.map((x, i) => `${String(i + 1).padStart(2, '0')}. ${clip(x.title, 60)}`);
                await m.reply({ text: [`📚 *Daftar Episode* (${chat.episodes.length})`, '', ...lines, ...(chat.episodes.length > 60 ? [`… dan ${chat.episodes.length - 60} lainnya`] : []), '', `➥ Ketik *${p}dhepisode <nomor>* untuk link episode`, `➥ Tambah kata *stream* untuk link streaming: *${p}dhepisode 1 stream*`].join('\n') });
                await sendMenuList(m, `Pilih episode ${title}:`, shown.slice(0, 20).map((x, i) => ({ title: clip(x.title, 24), description: 'Buka episode', id: `${p}dhepisode ${i + 1}` })), 'Episode');
            } else {
                await m.reply({ text: '⚠️ Daftar episode tidak ditemukan untuk donghua ini.' });
            }
            await m.react('✅');
        } catch (e) {
            await m.react('❌');
            await m.reply({ text: `❌ ${e.message}` });
        }
        return;
    }

    // ---------- EPISODE ----------
    if (name === 'dhepisode' || name === 'dheps') {
        const tokens = (m.command.fullArgs || '').trim().split(/\s+/).filter(Boolean);
        const wantStream = tokens.slice(1).some(t => /^(stream|streaming|ya|yes|on)$/i.test(t));
        const arg = tokens[0] || '';
        if (!arg) return m.reply({ text: `🎬 *Episode Donghua*\nFormat: *${p}dhepisode <nomor episode / link> [stream]*\nContoh: *${p}dhepisode 1*\nBuka daftar episode dulu: *${p}dhseries <nomor>*` });
        let url = '';
        if (/^\d{1,4}$/.test(arg)) {
            const it = chat.episodes[parseInt(arg, 10) - 1];
            if (!it) return m.reply({ text: `⚠️ Episode nomor ${arg} tidak ada. Ketik *${p}dhseries <nomor>* dulu.` });
            url = it.url;
        } else if (isUrl(arg)) url = arg;
        else return m.reply({ text: '⚠️ Link episode tidak valid.' });

        await m.react('⏳');
        try {
            const data = await callJson('donghive', 'episode', { url, stream: wantStream ? 'ya' : 'tidak' }, 150000);

            // kumpulkan semua link + labelnya (server / kualitas)
            const found = [];
            const seen = new Set();
            (function walk(v, label, depth) {
                if (depth > 5 || v == null) return;
                if (typeof v === 'string') {
                    if (isUrl(v) && !seen.has(v)) { seen.add(v); found.push({ url: v, label, kind: kindOf(v, label) }); }
                } else if (Array.isArray(v)) v.forEach(x => walk(x, label, depth + 1));
                else if (typeof v === 'object') {
                    const own = pick(v, ['server', 'name', 'label', 'quality', 'provider', 'host', 'title']);
                    for (const [k, x] of Object.entries(v)) walk(x, own || k, depth + 1);
                }
            })(data, 'link', 0);
            const links = found.filter(x => x.kind !== 'cover' && !/\.(jpe?g|png|webp|gif)(\?|$)/i.test(x.url));

            const epTitle = pickDeep(data, ['title', 'name', 'episode']) || (chat.episodes[parseInt(arg, 10) - 1]?.title) || 'Episode';
            if (!links.length) throw new Error('Link episode tidak ditemukan.');

            const lines = links.slice(0, 15).map((x, i) => `${i + 1}. ${clip(String(x.label), 30)}\n${x.url}`);
            await m.reply({ text: [`🎬 *${epTitle}*`, wantStream ? '📡 Mode: streaming' : '📥 Mode: download', '', ...lines, ...(links.length > 15 ? [`… +${links.length - 15} link lain`] : []), ...(wantStream ? [] : ['', `➥ Mau link streaming? *${p}dhepisode ${arg} stream*`])].join('\n') });

            // kalau ada file video langsung (mp4), coba kirim videonya
            const direct = links.find(x => /\.(mp4|mkv|webm|mov)(\?|$)/i.test(x.url));
            if (direct) {
                await m.Nayla.sendMessage(m.sender, { video: { url: direct.url }, caption: `🎬 *${epTitle}*\n\n_${config.botName} • ${config.ownerName}_`, mimetype: 'video/mp4' }, { quoted: m.msg }).catch(() => { });
            }
            await m.react('✅');
        } catch (e) {
            await m.react('❌');
            await m.reply({ text: `❌ ${e.message}` });
        }
    }
};

handler.commands = ['donghive', 'dhcatalog', 'dhseries', 'dhserial', 'dhepisode', 'dheps'];

module.exports = handler;
