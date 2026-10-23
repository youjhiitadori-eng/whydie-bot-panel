// Command buatan sendiri (khusus owner): .addlist, .editlist, .dellist, .liststore
// Setelah dibuat, siapa pun cukup mengetik nama command-nya (.promo, atau "promo" tanpa prefix) -> foto menu + teksnya.
const config = require('../config');
const store = require('../utils/storeList');
const { italic } = require('../utils/menuData');

const p = () => config.prefix;

// Teks setelah nama command; baris baru di teks tetap utuh
function rawArgs(m) {
    let t = String(m.text || '').trim();
    if (config.prefix && t.startsWith(config.prefix)) t = t.slice(config.prefix.length);
    return t.replace(/^\S+/, '').trim();
}

// Teks dari pesan yang di-reply (kalau teks tidak ditulis langsung)
function quotedText(m) {
    let msg = m.msg.message;
    msg = msg?.ephemeralMessage?.message || msg;
    for (const v of Object.values(msg || {})) {
        const q = v?.contextInfo?.quotedMessage;
        if (!q) continue;
        return (q.conversation || q.extendedTextMessage?.text || q.imageMessage?.caption || q.videoMessage?.caption
            || q.documentWithCaptionMessage?.message?.documentMessage?.caption || '').trim();
    }
    return '';
}

// "promo diskon 50%" -> { name: 'promo', body: 'diskon 50%' }
function parseNameBody(m) {
    const mt = rawArgs(m).match(/^(\S+)(?:\s+([\s\S]*))?$/);
    if (!mt) return { name: '', body: '' };
    return { name: store.normName(mt[1]), body: (mt[2] || '').trim() || quotedText(m) };
}

const ERR = {
    invalid: `❌ Nama command hanya boleh *huruf kecil, angka, _ atau -* (maks 30 karakter), tanpa spasi.`,
    reserved: `❌ Nama itu sudah dipakai command bawaan bot. Pilih nama lain.`,
    full: `❌ Daftar penuh (maks ${store.MAX_ITEMS} command). Hapus yang tidak dipakai dulu dengan *${'%P'}dellist*.`,
    toolong: `❌ Teks terlalu panjang (maks ${store.MAX_TEXT} karakter).`,
    error: `❌ Gagal menyimpan ke database. Coba lagi.`,
};
const err = (k) => ERR[k].replace('%P', p());

const handler = async (m) => {
    // Pengaman ganda: command ini juga dikunci lewat config.ownerOnlyCommands
    if (!m.isOwner) return;
    const reply = (text) => store.sendPhoto(m.Nayla, m.sender, text, m.msg);

    switch (m.command.name) {
        case 'addlist': {
            const { name, body } = parseNameBody(m);
            if (!name || !body) {
                return reply([
                    `📝 *Tambah command baru*`,
                    `Format: *${p()}addlist <nama> <teks>*`,
                    `Contoh: *${p()}addlist promo Diskon 50% sampai Minggu!*`,
                    '',
                    `Bisa juga reply sebuah pesan lalu ketik *${p()}addlist <nama>*.`,
                    `Teks boleh beberapa baris.`,
                ].join('\n'));
            }
            const r = store.add(name, body);
            if (r === 'exists') return reply(`⚠️ Command *${p()}${name}* sudah ada.\nUntuk mengubah isinya pakai *${p()}editlist ${name} <teks baru>*.`);
            if (r !== 'ok') return reply(err(r));
            return reply(`✅ Command *${p()}${name}* ditambahkan.\nKetik *${p()}${name}* untuk melihat hasilnya.`);
        }

        case 'editlist': {
            const { name, body } = parseNameBody(m);
            if (!name || !body) {
                return reply([
                    `✏️ *Edit command*`,
                    `Format: *${p()}editlist <nama> <teks baru>*`,
                    `Atau reply pesan lalu ketik *${p()}editlist <nama>*.`,
                    `Lihat daftar: *${p()}liststore*`,
                ].join('\n'));
            }
            const r = store.edit(name, body);
            if (r === 'notfound') return reply(`❌ Command *${p()}${name}* tidak ada.\nBuat baru dengan *${p()}addlist ${name} <teks>*.`);
            if (r !== 'ok') return reply(err(r));
            return reply(`✅ Isi command *${p()}${name}* diperbarui.`);
        }

        case 'dellist': {
            const name = store.normName(rawArgs(m).split(/\s+/)[0]);
            if (!name) return reply(`🗑️ Format: *${p()}dellist <nama>*\nLihat daftar: *${p()}liststore*`);
            return reply(store.remove(name)
                ? `✅ Command *${p()}${name}* dihapus.`
                : `❌ Command *${p()}${name}* tidak ditemukan.`);
        }

        case 'liststore': {
            const items = store.list();
            if (!items.length) return reply(`📭 Belum ada command buatan.\nTambah dengan *${p()}addlist <nama> <teks>*.`);
            const rows = items.map((it, i) => {
                const first = it.text.split('\n')[0].replace(/\s+/g, ' ');
                const prev = first.length > 28 ? first.slice(0, 28) + '…' : first;
                return `┃ ❏ ${i + 1}. ${p()}${it.name} — ${prev}`;
            });
            return reply([
                `┏━━━━━━⏤͟͟͞͞ ${italic('STORE LIST')}━━━┅┉┄`,
                `┃ ❏ ${italic('Total')} : ${items.length} command`,
                ...rows,
                '╰──━━━━━━━━━━━━━━━┅┉┄𖤛',
                `> ${p()}addlist · ${p()}editlist · ${p()}dellist`,
            ].join('\n'));
        }
    }
};

module.exports = handler;
