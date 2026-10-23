// AI MENU: .gpt .gemini .claude .qwen .blackbox .deepai ... (daftar di src/utils/aiList.js)
//   Pakai: .gpt <pertanyaan>   atau reply pesan lalu ketik .gpt
//   .aicostum <karakter / aturan> | <pertanyaan>
const config = require('../config');
const { FEATURES } = require('../utils/aiList');
const { getQuotedText } = require('../utils/mediaHelper');
const { callJson, extractText } = require('../utils/xrinaApi');

const MAX_LEN = 20000;

const handler = async (m) => {
    const name = m.command.name;
    const f = FEATURES[name];
    if (!f) return;
    const p = config.prefix;

    const raw = (m.command.fullArgs || '').trim();
    const quoted = (getQuotedText(m) || '').trim();
    let params = {};

    if (f.custom) {
        // .aicostum <karakter> | <pertanyaan>   (kalau reply pesan: isi reply dipakai sebagai pertanyaan)
        const i = raw.indexOf('|');
        let prompt = i >= 0 ? raw.slice(0, i).trim() : raw;
        let text = i >= 0 ? raw.slice(i + 1).trim() : quoted;
        if (!prompt || !text) {
            return m.reply({ text: `🧠 *${f.label}*\nAtur karakter AI sendiri, lalu tanya.\n\nFormat: *${p}${name} <karakter / aturan> | <pertanyaan>*\nContoh: *${p}${name} Kamu kucing yang suka ngomong meow | siapa namamu?*\nAtau reply pesan: *${p}${name} <karakter>*` });
        }
        params = { text, prompt };
    } else {
        const input = raw || quoted;
        if (!input) {
            return m.reply({ text: `🤖 *${f.label}*\nTulis pertanyaanmu dulu ya (atau reply pesan yang mau ditanyakan).\n\nContoh: *${p}${name} jelaskan apa itu black hole*` });
        }
        params = { [f.param || 'text']: input, ...(f.extra || {}) };
    }

    await m.react('⏳');
    try {
        const data = await callJson('ai', f.path, params);
        let answer = extractText(data);
        if (!answer) throw new Error('AI tidak memberi jawaban, coba pertanyaan lain.');
        if (answer.length > MAX_LEN) answer = answer.slice(0, MAX_LEN) + '…';
        await m.reply({ text: `${answer}\n\n_🤖 ${f.label} • ${config.botName}_` });
        await m.react('✅');
    } catch (e) {
        await m.react('❌');
        await m.reply({ text: `❌ ${e.message || 'AI gagal menjawab.'}` });
    }
};

// Dipakai PluginLoader (file ini sengaja tanpa "case")
handler.commands = Object.keys(FEATURES);

module.exports = handler;
