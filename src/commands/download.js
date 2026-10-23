// Download: .ytmp4 .ytmp3 .play .tiktok .twitterdl .instagram .igmp3 .facebook .capcut
//           .snackvideo .bilibili .pindl .mediafire .terabox .gdrive .aio .aio2
// Daftar fitur ada di src/utils/downloadList.js (command otomatis terdaftar dari sana).
const config = require('../config');
const { FEATURES } = require('../utils/downloadList');
const { callApi, collectLinks, kindFromMime, sniff, nameFromUrl } = require('../utils/downloader');
const { getQuotedText } = require('../utils/mediaHelper');
const { formatBytes } = require('../utils/helper');

const MAX_FILE_MB = 100;      // file lebih besar dari ini dikirim sebagai link saja
const MAX_ITEMS = 5;          // maksimal media yang dikirim per command
const QUALITIES = ['144', '240', '360', '480', '720', '1080'];

const str = (v) => (typeof v === 'string' || typeof v === 'number') ? String(v).trim() : '';

function buildCaption(data, extra = []) {
    const d = data && typeof data === 'object' ? data : {};
    const author = typeof d.author === 'object' ? (d.author?.nickname || d.author?.name || d.author?.unique_id) : d.author;
    const lines = [];
    const title = str(d.title) || str(d.filename) || str(d.name);
    if (title) lines.push(`🎬 *${title.length > 200 ? title.slice(0, 200) + '…' : title}*`);
    if (str(author)) lines.push(`👤 ${str(author)}`);
    if (str(d.quality)) lines.push(`📺 ${str(d.quality)}`);
    if (str(d.duration)) lines.push(`⏱️ ${str(d.duration)}`);
    lines.push(...extra);
    lines.push('', `_${config.botName} • ${config.ownerName}_`);
    return lines.join('\n');
}

// Kirim satu media. Kalau gagal dikirim lewat URL, kirim link-nya.
async function sendOne(m, item, kind, caption, fileInfo = {}) {
    const { Nayla, sender, msg } = m;
    const opts = { quoted: msg };
    try {
        if (kind === 'video') return await Nayla.sendMessage(sender, { video: { url: item.url }, caption, mimetype: 'video/mp4' }, opts);
        if (kind === 'audio') return await Nayla.sendMessage(sender, { audio: { url: item.url }, mimetype: 'audio/mpeg' }, opts);
        if (kind === 'image') return await Nayla.sendMessage(sender, { image: { url: item.url }, caption }, opts);
        const fileName = fileInfo.name || nameFromUrl(item.url) || 'file';
        return await Nayla.sendMessage(sender, {
            document: { url: item.url }, fileName,
            mimetype: fileInfo.mime && fileInfo.mime !== 'text/html' ? fileInfo.mime : 'application/octet-stream',
            caption,
        }, opts);
    } catch (e) {
        console.error('[DOWNLOAD] gagal kirim media:', e.message);
        return m.reply({ text: `⚠️ Gagal mengirim file langsung. Unduh lewat link ini:\n${item.url}` });
    }
}

const handler = async (m) => {
    const name = m.command.name;
    const f = FEATURES[name];
    if (!f) return;

    const p = config.prefix;
    const args = m.command.args;
    const raw = (m.command.fullArgs || getQuotedText(m) || '').trim();

    // --- ambil input ---
    let input = raw;
    let quality = '';
    if (f.param === 'url') {
        const tokens = raw.split(/\s+/).filter(Boolean);
        input = tokens[0] || '';
        if (f.quality) {
            const q = (tokens[1] || args[1] || '').replace(/p$/i, '');
            quality = QUALITIES.includes(q) ? q : '720';
        }
    }
    if (!input) {
        const what = f.param === 'q' ? 'judul / kata kunci' : 'link';
        return m.reply({ text: `📥 *${f.label}*\nKirim ${what}-nya dulu ya (atau reply pesan yang berisi ${what}).\n\nContoh: *${p}${name} ${f.example}*${f.quality ? `\nKualitas: ${QUALITIES.join(' / ')} (default 720)` : ''}` });
    }

    await m.react('⏳');
    try {
        const params = { [f.param]: input };
        if (quality) params.quality = quality;
        const data = await callApi(f.path, params);
        const links = collectLinks(data);
        const media = links.filter(i => i.kind !== 'cover');
        const cover = links.find(i => i.kind === 'cover');
        if (!media.length) throw new Error('Media tidak ditemukan di link tersebut.');
        const isImagePost = String(data?.type || '').toLowerCase() === 'image';

        // --- pilih & kirim sesuai jenis fitur ---
        if (f.want === 'audio') {
            const item = media.find(i => i.kind === 'audio') || media.find(i => i.kind === 'unknown') || media[0];
            if (name === 'play') {
                const info = buildCaption(data, ['🎵 Mengirim audio...']);
                if (cover) await m.Nayla.sendMessage(m.sender, { image: { url: cover.url }, caption: info }, { quoted: m.msg }).catch(() => { });
                else await m.reply({ text: info });
            } else if (data?.title) {
                await m.reply({ text: buildCaption(data, ['🎵 Mengirim audio...']) });
            }
            await sendOne(m, item, 'audio', '');
        } else if (f.want === 'video') {
            const playable = media.filter(i => i.kind === 'video' || i.kind === 'unknown');
            if (playable.length && !isImagePost) {
                await sendOne(m, playable[0], 'video', buildCaption(data));
            } else {
                const imgs = media.filter(i => i.kind === 'image' || (isImagePost && i.kind === 'unknown')).slice(0, 10);
                if (!imgs.length) throw new Error('Video tidak ditemukan di link tersebut.');
                for (let i = 0; i < imgs.length; i++) await sendOne(m, imgs[i], 'image', i === 0 ? buildCaption(data) : '');
            }
        } else if (f.want === 'file') {
            const item = media[0];
            const info = await sniff(item.url);
            const fileName = str(data?.filename) || str(data?.name) || info.name || nameFromUrl(item.url);
            const sizeText = info.size ? `📦 ${formatBytes(info.size)}` : (str(data?.size) ? `📦 ${str(data.size)}` : '');
            if (info.size && info.size > MAX_FILE_MB * 1024 * 1024) {
                await m.reply({ text: `📦 File terlalu besar untuk dikirim lewat WhatsApp (${formatBytes(info.size)}, batas ${MAX_FILE_MB} MB).\nUnduh lewat link ini:\n${item.url}` });
            } else {
                await sendOne(m, item, 'file', buildCaption({ title: fileName }, sizeText ? [sizeText] : []), { name: fileName, mime: info.mime });
            }
        } else {
            // auto: tebak jenis tiap link (ekstensi -> tipe file di server)
            let sent = 0;
            for (const item of media) {
                if (sent >= MAX_ITEMS) break;
                let kind = item.kind;
                if (kind === 'unknown') {
                    const info = await sniff(item.url);
                    kind = kindFromMime(info.mime);
                    if (kind === 'unknown') kind = 'video';
                }
                await sendOne(m, item, kind, sent === 0 ? buildCaption(data) : '');
                sent++;
            }
        }
        await m.react('✅');
    } catch (e) {
        await m.react('❌');
        await m.reply({ text: `❌ ${e.message || 'Gagal mengunduh.'}` });
    }
};

// Dipakai PluginLoader (file ini sengaja tanpa "case")
handler.commands = Object.keys(FEATURES);

module.exports = handler;
