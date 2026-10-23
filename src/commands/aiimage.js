// AI Image: kirim/reply foto + command (contoh: .tozombie), atau .flux <prompt>
// Daftar fitur ada di src/utils/aiImageList.js (command otomatis terdaftar dari sana).
const config = require('../config');
const { FEATURES } = require('../utils/aiImageList');
const { getImageBuffer, getQuotedText } = require('../utils/mediaHelper');
const { uploadImage, generate } = require('../utils/aiClient');

const handler = async (m) => {
    const name = m.command.name;
    const feature = FEATURES[name];
    if (!feature) return;

    const { Nayla, sender, msg } = m;
    const p = config.prefix;
    let params;

    if (feature.type === 'text') {
        const prompt = m.command.fullArgs || getQuotedText(m);
        if (!prompt) {
            return m.reply({ text: `📝 Tulis prompt-nya dulu.\nContoh: *${p}${name} anime imut*` });
        }
        params = { prompt };
        if (name === 'text2img') params.shape = 'hd';
    } else {
        let buffer = null;
        try { buffer = await getImageBuffer(m); } catch (e) { buffer = null; }
        if (!buffer) {
            return m.reply({ text: `🖼️ Kirim foto dengan caption *${p}${name}*, atau reply foto dengan *${p}${name}*.` });
        }
        await m.react('⏳');
        try {
            params = { url: await uploadImage(buffer) };
        } catch (e) {
            await m.react('❌');
            return m.reply({ text: `❌ ${e.message}` });
        }
        if (name === 'hd') {
            const n = parseInt(m.command.args[0], 10);
            params.scale = n >= 1 && n <= 8 ? n : 4;
        }
    }

    if (feature.type === 'text') await m.react('⏳');
    try {
        const result = await generate(name, params);
        await Nayla.sendMessage(sender, {
            image: result,
            caption: `✅ *Sukses dibuat!*\n🎨 Fitur: ${p}${name}\n\n_${config.botName} • ${config.ownerName}_`,
        }, { quoted: msg });
        await m.react('✅');
    } catch (e) {
        await m.react('❌');
        await m.reply({ text: `❌ Gagal membuat gambar: ${e.message}` });
    }
};

// Dipakai PluginLoader (file ini sengaja tanpa "case")
handler.commands = Object.keys(FEATURES);

module.exports = handler;
