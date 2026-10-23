// CANVA MENU: .fakeml .iqc .quotes .codesnap ... (daftar di src/utils/canvasList.js)
//   Input dipisah tanda |  ->  .iqc Halo | 12.00
//   Parameter foto: kirim/reply foto, tempel link gambar, atau kosongkan = foto profil WhatsApp kamu.
const config = require('../config');
const { FEATURES } = require('../utils/canvasList');
const { getImageBuffer, getQuotedText } = require('../utils/mediaHelper');
const { callImage, placeholderAvatar, uploadImage } = require('../utils/xrinaApi');

function helpText(name, f) {
    const p = config.prefix;
    const rows = f.params.map(x => {
        const tag = x.image ? '🖼️' : '✏️';
        const need = x.image ? 'opsional' : (x.def !== undefined ? `default: ${x.def}` : 'wajib');
        return `${tag} ${x.label} _(${need})_`;
    });
    return [
        `🎨 *${f.label}*`,
        '',
        ...rows,
        '',
        `Format: *${p}${name}${f.example ? ' ' + f.params.filter(x => !x.image).map(x => `<${x.label}>`).join(' | ') : ''}*`,
        ...(f.example ? [`Contoh: *${p}${name} ${f.example}*`] : []),
        ...(f.note ? ['', `💡 ${f.note}`] : []),
        '',
        '_Pisahkan setiap isian dengan tanda |_',
    ].join('\n');
}

async function profilePic(m) {
    const jid = m.msg.key.participant || m.sender;
    try {
        const url = await m.Nayla.profilePictureUrl(jid, 'image');
        if (url) return url;
    } catch { /* foto profil disembunyikan / tidak ada */ }
    return placeholderAvatar();
}

const handler = async (m) => {
    const name = m.command.name;
    const f = FEATURES[name];
    if (!f) return;

    const textParams = f.params.filter(x => !x.image);
    const imageParams = f.params.filter(x => x.image);

    // --- pisahkan isian teks / link gambar ---
    let raw = (m.command.fullArgs || '').trim();
    if (!raw && textParams[0]?.multiline) raw = (getQuotedText(m) || '').trim();
    // link gambar boleh ditempel di mana saja (dipisah | atau cuma spasi)
    const urlSegs = imageParams.length ? (raw.match(/https?:\/\/[^\s|]+/g) || []) : [];
    if (urlSegs.length) raw = raw.replace(/https?:\/\/[^\s|]+/g, ' ');
    const segs = raw ? raw.split('|').map(s => s.trim().replace(/\s{2,}/g, ' ')).filter(Boolean) : [];
    let texts = segs;
    if (texts.length > textParams.length && textParams[0]?.multiline) {
        const extra = texts.length - textParams.length;
        texts = [texts.slice(0, extra + 1).join(' | '), ...texts.slice(extra + 1)];
    }

    const params = {};
    for (let i = 0; i < textParams.length; i++) {
        const x = textParams[i];
        const v = texts[i];
        if (v) params[x.key] = v;
        else if (x.def !== undefined) params[x.key] = x.def;
        else if (!x.optional) return m.reply({ text: `⚠️ Isian *${x.label}* belum diisi.\n\n${helpText(name, f)}` });
    }

    await m.react('⏳');
    try {
        // --- foto: upload dari pesan / link / foto profil ---
        let uploaded = null;
        if (imageParams.length) {
            let buf = null;
            try { buf = await getImageBuffer(m); } catch { buf = null; }
            if (buf) uploaded = await uploadImage(buf);
        }
        const primary = imageParams.find(x => x.fallbackSelf === false) || imageParams[0];
        let urlIdx = 0;
        for (const x of imageParams) {
            let val = null;
            if (x === primary && uploaded) val = uploaded;
            else if (urlSegs[urlIdx]) val = urlSegs[urlIdx++];
            else if (x.fallbackSelf === false) val = null;
            else val = await profilePic(m);
            if (!val) {
                await m.react('❌');
                return m.reply({ text: `🖼️ Fitur ini butuh *${x.label}*.\nKirim foto dengan caption *${config.prefix}${name}*, reply foto, atau tempel link gambar.\n\n${helpText(name, f)}` });
            }
            params[x.key] = val;
        }

        const result = await callImage('canvas', f.path, params);
        await m.Nayla.sendMessage(m.sender, {
            image: result,
            caption: `✅ *${f.label}*\n\n_${config.botName} • ${config.ownerName}_`,
        }, { quoted: m.msg });
        await m.react('✅');
    } catch (e) {
        await m.react('❌');
        await m.reply({ text: `❌ Gagal membuat gambar: ${e.message}` });
    }
};

// Dipakai PluginLoader (file ini sengaja tanpa "case")
handler.commands = Object.keys(FEATURES).flatMap(c => [c, ...(FEATURES[c].alias || [])]);
// Alias -> fitur yang sama
for (const [c, f] of Object.entries(FEATURES)) for (const a of f.alias || []) FEATURES[a] = f;

module.exports = handler;
