// Info Rental Bot: ketik "bot" atau "sc" (dengan atau tanpa titik) -> info rental Welper (foto + caption)
const fs = require('fs');
const path = require('path');
const config = require('../config');

const SITE = 'https://www.welper.web.id';

const TEXT = [
    '╭─〔 乂 *WELPER — BOT RENTAL* 〕',
    '│',
    '│ 👋 Hey, lagi nyari *rental bot WhatsApp*?',
    '│',
    '│ Sekarang rental bot jadi gampang banget',
    '│ lewat website Welper. Tinggal buka, cek',
    '│ pilihan rental yang tersedia, lalu pilih',
    '│ yang paling pas buat kebutuhan lu.',
    '│',
    '│ ✨ Nggak perlu ribet — semua informasi',
    '│ rental bisa lu akses langsung dari website.',
    '│',
    '├─ 🌐 *WEBSITE RENTAL*',
    `│ ${SITE}`,
    '│',
    '│ 🚀 Tunggu apa lagi? Kunjungi website-nya',
    '│ dan temukan pilihan rental yang cocok.',
    '╰──────────────────',
    '',
    '_Welper — Your Bot, Your Choice._',
].join('\n');

const handler = async (m) => {
    switch (m.command.name) {
        case 'bot':
        case 'sc': {
            const caption = `${TEXT}\n\n${config.footerTxt}`;
            try {
                const logo = fs.readFileSync(path.join(__dirname, '..', 'media', 'logo.png'));
                // Foto + caption biasa (bukan pesan tombol) supaya pasti terlihat di semua HP / WhatsApp
                return await m.Nayla.sendMessage(m.sender, { image: logo, caption }, { quoted: m.msg });
            } catch (e) {
                console.error('[RENTAL] gagal kirim foto, kirim teks biasa:', e.message);
                return m.reply({ text: caption });
            }
        }
    }
};

module.exports = handler;
