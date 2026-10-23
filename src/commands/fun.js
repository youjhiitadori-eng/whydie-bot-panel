// FUN MENU: .artinama .cekkhodam .pantun .pap ... (daftar di src/utils/funList.js)
const config = require('../config');
const { FEATURES } = require('../utils/funList');
const { getQuotedText } = require('../utils/mediaHelper');
const { callJson, callImage } = require('../utils/xrinaApi');

const ALIAS = { cewe: 'cewe', cewek: 'cewe', wanita: 'cewe', perempuan: 'cewe', girl: 'cewe', cowo: 'cowo', cowok: 'cowo', pria: 'cowo', laki: 'cowo', boy: 'cowo' };

const handler = async (m) => {
    const name = m.command.name;
    const f = FEATURES[name];
    if (!f) return;
    const p = config.prefix;
    const pushname = m.pushname || 'Kak';

    const params = {};
    let input = '';
    if (f.param) {
        input = (m.command.fullArgs || getQuotedText(m) || '').trim();
        if (f.choices) {
            input = ALIAS[input.toLowerCase().split(/\s+/)[0]] || '';
            if (!input) return m.reply({ text: `📸 *${f.label}*\nPilih jenisnya dulu:\n• *${p}${name} cewe*\n• *${p}${name} cowo*` });
        } else if (!input) {
            if (f.fallbackName) input = pushname;
            else return m.reply({ text: `✏️ *${f.label}*\nContoh: *${p}${name} ${f.example}*` });
        }
        params[f.param] = input.slice(0, 60);
    }

    await m.react('⏳');
    try {
        if (f.image) {
            const img = await callImage('fun', f.path, { ...params, format: 'image' });
            await m.Nayla.sendMessage(m.sender, { image: img, caption: `📸 *${f.label}* (${input})\n\n_${config.botName} • ${config.ownerName}_` }, { quoted: m.msg });
        } else {
            const data = await callJson('fun', f.path, params, 45000);
            const d = data && typeof data === 'object' ? data : { result: data };
            const text = f.format(d, { input, pushname });
            if (!text.trim()) throw new Error('Respon API kosong, coba lagi.');
            await m.reply({ text: `${text}\n\n_${config.botName} • ${config.ownerName}_` });
        }
        await m.react('✅');
    } catch (e) {
        await m.react('❌');
        await m.reply({ text: `❌ ${e.message || 'Gagal memproses.'}` });
    }
};

// Dipakai PluginLoader (file ini sengaja tanpa "case")
handler.commands = Object.keys(FEATURES);

module.exports = handler;
