// Status pairing untuk website rental (tanpa terminal).
// Ditulis ke <dataDir>/pairing.json -> dibaca website lewat panel dan ditampilkan di halaman "Bot Saya".
// Hanya aktif kalau script dijalankan lewat website (ada ../config/bot.json). Jalan manual = semua fungsi no-op.
// state: starting | code | connected | expired | error
const fs = require('fs');
const path = require('path');
const config = require('../config');

function write(data) {
    const file = config.pairingFile;
    if (!config.managed || !file) return;
    try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const tmp = `${file}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify({ ...data, updatedAt: Date.now() }));
        fs.renameSync(tmp, file); // atomik: website tidak pernah membaca file setengah jadi
    } catch { /* abaikan */ }
}

module.exports = {
    starting: (number) => write({ state: 'starting', number: number || '', message: 'Menyiapkan kode pairing…' }),
    code: (number, code, attempt = 1) => write({ state: 'code', number: number || '', code, attempt, issuedAt: Date.now() }),
    connected: (number) => write({ state: 'connected', number: number || '', message: 'Bot terhubung ke WhatsApp.' }),
    expired: (number) => write({ state: 'expired', number: number || '', message: 'Kode pairing kedaluwarsa. Minta kode baru.' }),
    error: (message, number) => write({ state: 'error', number: number || '', message: String(message || 'Terjadi kesalahan').slice(0, 300) }),
    clear: () => {
        try { if (config.pairingFile) fs.rmSync(config.pairingFile, { force: true }); } catch { /* abaikan */ }
    },
};
