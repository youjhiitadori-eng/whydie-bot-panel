// Auto lihat status (SW) + react love. Aktif default, bisa dimatikan owner lewat .autosw off
const settings = require('../utils/settings');

const EMOJI = '❤️';
const seen = new Set();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function onStatus(Nayla, msg, type = 'notify') {
    try {
        if (!settings.isAutoSW() || type !== 'notify') return;
        const key = msg?.key;
        if (!key?.id || key.fromMe) return;

        const poster = key.participant || key.participantAlt;
        if (!poster) return;

        // lewati status yang dihapus / pesan protokol
        const kinds = Object.keys(msg.message || {});
        if (!kinds.length || kinds.every(k => k === 'protocolMessage' || k === 'senderKeyDistributionMessage' || k === 'messageContextInfo')) return;

        if (seen.has(key.id)) return;
        seen.add(key.id);
        if (seen.size > 1000) seen.delete(seen.values().next().value);

        await sleep(1000 + Math.floor(Math.random() * 2000));   // jeda acak biar natural
        await Nayla.readMessages([key]);

        const me = String(Nayla.user?.id || '').replace(/:\d+@/, '@');
        await Nayla.sendMessage('status@broadcast',
            { react: { text: EMOJI, key } },
            { statusJidList: [poster, me].filter(Boolean) });
    } catch (e) {
        console.error('[SW] gagal lihat/react status:', e.message);
    }
}

module.exports = { onStatus };
