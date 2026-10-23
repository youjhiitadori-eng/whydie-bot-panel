// Tampilan & hitungan harga toko Nokos. Dipakai oleh command (src/commands/nokos.js) dan poller OTP.
const config = require('../config');

const nk = () => config.nokos || {};
const p = () => config.prefix;
/** Bentuk command/ID tombol: cmd('nk s whatsapp') -> ".nk s whatsapp" */
const cmd = (s) => p() + s;

const rp = (n) => 'Rp' + Math.round(Number(n) || 0).toLocaleString('id-ID');

/* ------------------------------ HARGA ------------------------------ */

/** Harga jual dari harga API (harga modal). Selalu dibulatkan ke atas. */
function sellPrice(apiPrice) {
    const { flat = 0, percent = 0 } = nk().profit || {};
    const profit = Math.ceil(Math.max(0, Number(flat) || 0) + apiPrice * Math.max(0, Number(percent) || 0) / 100);
    return { api: apiPrice, profit, sell: apiPrice + profit };
}

/** Hitungan deposit: user transfer total, saldo masuk = nominal. */
function depositQuote(nominal) {
    const { flat = 0, percent = 0 } = nk().depositFee || {};
    const fee = Math.ceil(Math.max(0, Number(flat) || 0) + nominal * Math.max(0, Number(percent) || 0) / 100);
    return { nominal, fee, total: nominal + fee };
}

/* ------------------------------ TOMBOL ------------------------------ */

const quick = (text, id) => ({ name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: text, id }) });
const copyBtn = (text, code) => ({ name: 'cta_copy', buttonParamsJson: JSON.stringify({ display_text: text, copy_code: String(code) }) });
const urlBtn = (text, url) => ({ name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: text, url, merchant_url: url }) });
const listBtn = (title, sections) => ({ name: 'single_select', buttonParamsJson: JSON.stringify({ title, sections }) });

/* ------------------------------ KIRIM ------------------------------ */

const ownerJids = () => [].concat(config.superOwner || [], config.coOwner || [])
    .map(n => String(n).replace(/\D/g, '')).filter((v, i, a) => v && a.indexOf(v) === i)
    .map(n => n + '@s.whatsapp.net');

/**
 * Kirim kartu (teks + tombol, opsional foto). Kalau gagal -> teks biasa supaya user tetap dapat info.
 * content: { text, buttons, footer, image(Buffer), quoted, mentions }
 */
async function sendCard(Nayla, jid, content) {
    const { text, buttons = [], footer = config.footerTxt, image, quoted, mentions } = content;
    const contextInfo = mentions ? { mentionedJid: mentions } : {};
    if (buttons.length) {
        try {
            const h = require('./interactiveHelper');
            if (image) return await h.sendInteractiveWithImage(Nayla, jid, { text, footer, buttons, imageSource: image, quoted, contextInfo, strict: true });
            return await h.sendInteractiveMessage(Nayla, jid, { text, footer, buttons, quoted, contextInfo });
        } catch (e) {
            console.error('[NOKOS-UI] gagal kirim tombol, fallback teks:', e.message);
        }
    }
    const body = `${text}\n\n${footer}`;
    if (image) {
        try { return await Nayla.sendMessage(jid, { image, caption: body, contextInfo }, quoted ? { quoted } : undefined); } catch { /* lanjut teks */ }
    }
    return Nayla.sendMessage(jid, { text: body, contextInfo }, quoted ? { quoted } : undefined);
}

/** Kabari semua owner (tanpa melempar error). */
async function notifyOwners(Nayla, text) {
    for (const jid of ownerJids()) {
        try { await Nayla.sendMessage(jid, { text }); } catch { /* abaikan */ }
    }
}

/* ------------------------------ TEKS ------------------------------ */

const hhmm = (iso) => {
    try { return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }).replace('.', ':') + ' WIB'; } catch { return '-'; }
};

const box = (title, rows) => [`┏━━━━━━⏤͟͟͞͞ ${title} ━━━┅┉┄`, ...rows.map(r => `┃ ❏ ${r}`), '╰──━━━━━━━━━━━━━━━┅┉┄𖤛'].join('\n');

function orderCreatedText(o) {
    return [
        box(`✅ ORDER #${o.id}`, [
            `Layanan : ${o.serviceName}`,
            `Negara  : ${o.countryName}`,
            `Harga   : ${rp(o.sellPrice)}`,
            `Nomor   : ${o.phone ? '*' + o.phone + '*' : '_sedang disiapkan..._'}`,
            ...(o.expiresAt ? [`Batas   : ${hhmm(o.expiresAt)}`] : []),
        ]),
        '',
        '1. Masukkan nomor di aplikasi tujuan',
        '2. Minta kode verifikasi (OTP)',
        '3. OTP otomatis dikirim ke chat ini ⚡',
        '',
        '> Tidak ada OTP sampai batas waktu = saldo kembali otomatis.',
    ].join('\n');
}

function otpText(o, canNext) {
    return [
        box(`🔔 OTP MASUK #${o.id}`, [
            `Layanan : ${o.serviceName}`,
            `Nomor   : ${o.phone}`,
            `Kode    : *${o.otp}*`,
        ]),
        ...(o.otpMessage ? ['', `💬 ${String(o.otpMessage).slice(0, 300)}`] : []),
        '',
        canNext ? '> Butuh kode lagi di nomor yang sama? Tekan *OTP Lagi*.' : '> Pembelian selesai. Terima kasih 🙏',
    ].join('\n');
}

const REASON = { cancelled: 'dibatalkan', expired: 'waktu habis tanpa OTP', failed: 'gagal dibuat' };
function refundText(o, why) {
    return [
        box(`↩️ SALDO KEMBALI #${o.id}`, [
            `Layanan : ${o.serviceName}`,
            `Alasan  : ${REASON[why] || why}`,
            `Refund  : ${rp(o.sellPrice)}`,
        ]),
        '',
        '> Saldo sudah dikembalikan ke akunmu.',
    ].join('\n');
}

// Command yang tetap boleh dipakai user biasa saat "kunci toko" aktif (di chat pribadi)
const STORE_COMMANDS = new Set([
    'menu', 'allmenu', 'ownermenu', 'toolsmenu', 'downloadmenu', 'grupmenu', 'groupmenu', 'aiimagemenu', 'setormenu', 'setmenu', 'infomenu', 'komikmenu', 'makermenu', 'searchmenu', 'stalkermenu',
    'nokosmenu', 'nokos', 'nk', 'beli', 'cari', 'saldo', 'profil', 'deposit', 'cekdepo', 'riwayat', 'rules',
]);

module.exports = {
    STORE_COMMANDS, rp, cmd, nk, sellPrice, depositQuote, hhmm, box,
    quick, copyBtn, urlBtn, listBtn,
    sendCard, notifyOwners, ownerJids,
    orderCreatedText, otpText, refundText,
};
