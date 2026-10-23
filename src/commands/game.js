// GAME MENU: .tebakgambar .asahotak .tebakbendera ... (daftar di src/utils/gameList.js)
//   Jawab langsung dengan mengetik di chat (tanpa prefix). .hint = petunjuk, .nyerah = menyerah.
//   Pengecekan jawaban ada di src/handlers/messageHandler.js -> gameState.tryAnswer
const config = require('../config');
const { FEATURES } = require('../utils/gameList');
const { callJson } = require('../utils/xrinaApi');
const game = require('../utils/gameState');

const handler = async (m) => {
    const name = m.command.name;
    const p = config.prefix;
    const chat = m.sender;

    if (name === 'hint' || name === 'petunjuk') {
        return m.reply({ text: game.hint(chat) || `ℹ️ Tidak ada game yang sedang berjalan. Mulai dengan *${p}gamemenu*.` });
    }
    if (name === 'nyerah' || name === 'skip') {
        return m.reply({ text: game.giveUp(chat) || 'ℹ️ Tidak ada game yang sedang berjalan.' });
    }

    const f = FEATURES[name];
    if (!f) return;
    const active = game.get(chat);
    if (active) return m.reply({ text: `⚠️ Masih ada soal *${active.title}* yang belum dijawab di chat ini.\nJawab dulu, atau ketik *${p}nyerah*.` });

    await m.react('⏳');
    try {
        const data = await callJson('game', f.path, {}, 30000);
        const q = f.build(data && typeof data === 'object' ? data : {});
        if (!q.question || !q.answers?.length) throw new Error('Soal tidak valid dari server, coba lagi.');
        if (game.get(chat)) return; // keburu ada game lain (spam command)
        await game.start(m.Nayla, chat, m.msg, { command: name, title: f.label, ...q });
        await m.react('🎮');
    } catch (e) {
        await m.react('❌');
        await m.reply({ text: `❌ ${e.message || 'Gagal mengambil soal.'}` });
    }
};

handler.commands = [...Object.keys(FEATURES), 'hint', 'petunjuk', 'nyerah', 'skip'];

module.exports = handler;
