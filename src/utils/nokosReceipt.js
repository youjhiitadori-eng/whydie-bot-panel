// Struk Nokos: versi TEKS (caption) + versi FOTO (PNG dibuat dengan sharp). Nomor disensor dengan bintang.
const fs = require('fs');
const path = require('path');
const config = require('../config');

const FONT_FILE = path.join(__dirname, '..', 'media', 'fonts', 'OpenSans-SemiBold.ttf');
const FONT_NAME = 'Open Sans SemiBold';

const rp = (n) => 'Rp' + Math.round(Number(n) || 0).toLocaleString('id-ID');
const wib = (t = Date.now()) => {
    try { return new Date(t).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(/\./g, ':') + ' WIB'; } catch { return '-'; }
};

/** 6265512345677 -> 6265*****677 (4 digit depan + 3 digit belakang, tengah jadi bintang) */
function maskPhone(v) {
    const s = String(v || '').replace(/\D/g, '');
    if (!s) return '-';
    if (s.length <= 7) return s.slice(0, 2) + '*'.repeat(Math.max(1, s.length - 2));
    return s.slice(0, 4) + '*'.repeat(s.length - 7) + s.slice(-3);
}

const THEME = {
    success: { color: '#16a34a', icon: '✓', label: 'BERHASIL' },
    error: { color: '#dc2626', icon: '✕', label: 'GAGAL' },
    refund: { color: '#d97706', icon: '↩', label: 'REFUND' },
};

/**
 * spec: { kind: 'success'|'error'|'refund', title, rows: [[label, value], ...], note }
 */
function receiptText(spec) {
    const t = THEME[spec.kind] || THEME.success;
    const w = Math.max(...spec.rows.map(r => r[0].length));
    return [
        `┏━━━━━━ 🧾 *STRUK ${spec.title}* ━━━┅┉┄`,
        `┃ ❏ Status : *${t.label}*`,
        ...spec.rows.map(([k, v]) => `┃ ❏ ${k.padEnd(w)} : ${v}`),
        '╰──━━━━━━━━━━━━━━━┅┉┄𖤛',
        ...(spec.note ? ['', `> ${spec.note}`] : []),
    ].join('\n');
}

const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function textPng(sharp, text, size, color) {
    return sharp({ text: { text: `<span foreground="${color}">${esc(text)}</span>`, font: `${FONT_NAME} ${size}`, fontfile: FONT_FILE, rgba: true, dpi: 72 } }).png().toBuffer({ resolveWithObject: true });
}

/** Foto struk (Buffer PNG). Mengembalikan null kalau sharp/font tidak ada (pemanggil cukup kirim teks). */
async function receiptImage(spec) {
    let sharp;
    try { sharp = require('sharp'); } catch { return null; }
    if (!fs.existsSync(FONT_FILE)) return null;
    const t = THEME[spec.kind] || THEME.success;
    const W = 720, PAD = 48, rowH = 62;
    const H = 330 + spec.rows.length * rowH + (spec.note ? 90 : 20);

    const layers = [];
    const put = async (text, size, color, left, top, align = 'left') => {
        const { data, info } = await textPng(sharp, text, size, color);
        const maxW = W - PAD * 2 - (align === 'right' ? 250 : 0);
        let buf = data, w = info.width, h = info.height;
        if (w > maxW && align === 'right') { // nilai kepanjangan -> kecilkan
            const r = await textPng(sharp, text, Math.max(16, Math.floor(size * maxW / w)), color);
            buf = r.data; w = r.info.width; h = r.info.height;
        }
        layers.push({ input: buf, left: align === 'right' ? Math.max(PAD, W - PAD - w) : left, top: Math.round(top - h / 2) });
    };

    await put(config.botName || 'Nokos Store', 30, '#475569', PAD, 60);
    await put(`STRUK ${spec.title}`, 40, '#0f172a', PAD, 175);
    await put(`${t.icon} ${t.label}`, 34, t.color, PAD, 235);

    let y = 300;
    for (const [k, v] of spec.rows) {
        await put(k, 26, '#64748b', PAD, y + 22);
        await put(String(v), 28, '#0f172a', 0, y + 22, 'right');
        layers.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W - PAD * 2}" height="2"><rect width="100%" height="2" fill="#e2e8f0"/></svg>`), left: PAD, top: y + rowH - 12 });
        y += rowH;
    }
    if (spec.note) await put(spec.note.slice(0, 60), 22, '#64748b', PAD, y + 40);

    const base = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">` +
        `<rect width="100%" height="100%" fill="#f1f5f9"/><rect x="16" y="16" width="${W - 32}" height="${H - 32}" rx="28" fill="#ffffff"/>` +
        `<rect x="16" y="16" width="${W - 32}" height="14" rx="7" fill="${t.color}"/>` +
        `<circle cx="${W - 90}" cy="110" r="42" fill="${t.color}" fill-opacity="0.12"/></svg>`);
    return sharp(base).composite(layers).png().toBuffer();
}

/* ---------- SPEC per kejadian ---------- */

const orderSuccessSpec = (o) => ({
    kind: 'success', title: 'ORDER',
    rows: [['Kode', `#${o.id}`], ['Layanan', o.serviceName], ['Negara', o.countryName], ['Nomor', maskPhone(o.phone)], ['Harga', rp(o.sellPrice)], ['Pembayaran', 'Saldo Toko'], ['Waktu', wib()]],
    note: 'OTP otomatis dikirim ke chat ini.',
});

const orderFailSpec = (o, why) => ({
    kind: why === 'failed' ? 'error' : 'refund', title: why === 'failed' ? 'ORDER GAGAL' : 'REFUND',
    rows: [['Kode', `#${o.id}`], ['Layanan', o.serviceName], ['Nomor', maskPhone(o.phone)], ['Alasan', { cancelled: 'Dibatalkan', expired: 'Waktu habis', failed: 'Gagal dibuat' }[why] || String(why)], ['Refund', rp(o.sellPrice)], ['Waktu', wib()]],
    note: 'Saldo sudah kembali ke akunmu.',
});

const errorSpec = (title, message, extra = []) => ({ kind: 'error', title, rows: [...extra, ['Info', String(message).slice(0, 40)], ['Waktu', wib()]], note: 'Coba lagi atau hubungi owner.' });

const depositSuccessSpec = (d, balance) => ({
    kind: 'success', title: 'DEPOSIT',
    rows: [
        ['Kode', `#${d.id}`], ['Saldo Masuk', rp(d.credit != null ? d.credit : d.nominal)], ['Biaya', rp(d.payFee != null ? d.payFee : d.fee)], ['Total Bayar', rp(d.total)],
        ['Metode', (d.method && d.method.label) || 'QRIS'], ['Saldo Sekarang', rp(balance)], ['Waktu', wib()],
    ],
});

/** Kirim struk (foto + caption teks). Foto gagal dibuat -> teks saja. Tidak pernah throw. */
async function sendReceipt(sendCard, Nayla, jid, spec) {
    try {
        let image = null;
        try { image = await receiptImage(spec); } catch (e) { console.error('[NOKOS-STRUK] gagal buat foto:', e.message); }
        return await sendCard(Nayla, jid, { text: receiptText(spec), buttons: [], image });
    } catch (e) { console.error('[NOKOS-STRUK] gagal kirim:', e.message); }
}

module.exports = { maskPhone, receiptText, receiptImage, sendReceipt, orderSuccessSpec, orderFailSpec, errorSpec, depositSuccessSpec };
