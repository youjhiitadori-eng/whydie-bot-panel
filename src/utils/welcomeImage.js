// Pembuat foto Welcome / Goodbye: foto profil member (dibulatkan) masuk ke lingkaran template,
// nama masuk ke kotak username. Template: src/media/welcome.png & src/media/goodbye.png (1600x900).
// Posisi lingkaran & kotak sudah diukur dari template (cx, cy, r = jari-jari dalam cincin).
const fs = require('fs');
const path = require('path');

const MEDIA = path.join(__dirname, '..', 'media');
const FONT_FILE = path.join(MEDIA, 'fonts', 'OpenSans-SemiBold.ttf');
const FONT_NAME = 'Open Sans SemiBold';

const TEMPLATES = {
    welcome: { file: 'welcome.png', cx: 797, cy: 369, r: 186, pill: { cx: 800, cy: 620, maxW: 284 }, fontSize: 38 },
    goodbye: { file: 'goodbye.png', cx: 799, cy: 393, r: 160, pill: { cx: 800, cy: 612, maxW: 270 }, fontSize: 34 },
};
const MIN_FONT = 22;

function getSharp() {
    try { return require('sharp'); } catch { throw new Error('Paket "sharp" belum terpasang. Jalankan: npm install'); }
}

const digits = (v) => String(v || '').replace(/\D/g, '');

/**
 * Bersihkan nama supaya selalu rapi di foto: buang emoji, karakter tak terlihat, dan huruf yang tidak
 * ada di font (Arab, CJK, dll). Hasil kosong = pakai nomor.
 */
function cleanName(raw) {
    let s = String(raw || '').normalize('NFKC');
    s = s.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, '');
    s = s.replace(/[^\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{N}\p{P}\p{Zs}\p{Sc}\p{Sm}\p{Sk}]/gu, '');
    s = s.replace(/\s+/g, ' ').replace(/^[@\s]+/, '').trim();
    if (!/[\p{L}\p{N}]/u.test(s)) return '';
    return Array.from(s).slice(0, 40).join('');
}

const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

async function renderText(sharp, text, size) {
    const buf = await sharp({
        text: {
            text: `<span foreground="#ffffff">${esc(text)}</span>`,
            font: `${FONT_NAME} ${size}`,
            fontfile: FONT_FILE,
            rgba: true,
            dpi: 72,
        },
    }).png().toBuffer();
    // Pakai alpha-nya saja + warna putih polos, supaya tepi huruf halus tanpa semburat warna
    const { data: alpha, info } = await sharp(buf).ensureAlpha().extractChannel('alpha').raw().toBuffer({ resolveWithObject: true });
    const out = await sharp({ create: { width: info.width, height: info.height, channels: 3, background: { r: 255, g: 255, b: 255 } } })
        .joinChannel(alpha, { raw: { width: info.width, height: info.height, channels: 1 } })
        .png().toBuffer();
    return { buf: out, w: info.width, h: info.height };
}

// Teks diperkecil (maksimal sampai ~62% ukuran awal) supaya muat di kotak; kalau masih terlalu
// panjang, dipotong dengan "…" pada jumlah huruf terbanyak yang masih muat.
async function fitText(sharp, text, baseSize, maxW) {
    let size = baseSize;
    let r = await renderText(sharp, text, size);
    if (r.w <= maxW) return r;

    size = Math.max(Math.round(baseSize * 0.62), MIN_FONT, Math.floor(size * (maxW / r.w) * 0.97));
    r = await renderText(sharp, text, size);
    if (r.w <= maxW) return r;

    const chars = Array.from(text);
    let lo = 2, hi = chars.length - 1, best = null;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const cand = await renderText(sharp, chars.slice(0, mid).join('').trimEnd() + '…', size);
        if (cand.w <= maxW) { best = cand; lo = mid + 1; } else hi = mid - 1;
    }
    return best || renderText(sharp, '@…', size);
}

// Foto default (siluet) kalau member tidak punya / menyembunyikan foto profil
function defaultAvatarSvg(d) {
    return Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${d}" height="${d}" viewBox="0 0 100 100">` +
        `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5a3a2c"/><stop offset="1" stop-color="#2a1812"/></linearGradient></defs>` +
        `<rect width="100" height="100" fill="url(#g)"/>` +
        `<circle cx="50" cy="38" r="17" fill="#f2c9a8" fill-opacity="0.9"/>` +
        `<path d="M14 100 C14 70 32 60 50 60 C68 60 86 70 86 100 Z" fill="#f2c9a8" fill-opacity="0.9"/>` +
        `</svg>`
    );
}

async function circleAvatar(sharp, avatarBuf, d) {
    let input = null;
    if (Buffer.isBuffer(avatarBuf) && avatarBuf.length) {
        try { input = await sharp(avatarBuf).rotate().resize(d, d, { fit: 'cover', position: 'attention' }).png().toBuffer(); } catch { input = null; }
    }
    if (!input) input = await sharp(defaultAvatarSvg(d)).png().toBuffer();
    const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${d}" height="${d}"><circle cx="${d / 2}" cy="${d / 2}" r="${d / 2}" fill="#fff"/></svg>`);
    return sharp(input).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
}

/**
 * kind: 'welcome' | 'goodbye'
 * opts: { avatar: Buffer|null, name: string, number: string }
 * return: Buffer JPEG 1600x900
 */
async function buildCard(kind, { avatar = null, name = '', number = '' } = {}) {
    const t = TEMPLATES[kind];
    if (!t) throw new Error(`Template "${kind}" tidak dikenal`);
    const tplPath = path.join(MEDIA, t.file);
    if (!fs.existsSync(tplPath)) throw new Error(`Template ${t.file} tidak ditemukan di src/media`);
    if (!fs.existsSync(FONT_FILE)) throw new Error('Font src/media/fonts/OpenSans-SemiBold.ttf tidak ditemukan');
    const sharp = getSharp();

    const label = cleanName(name) || digits(number).slice(0, 15) || 'member';
    const d = t.r * 2;
    const [avatarPng, text] = await Promise.all([
        circleAvatar(sharp, avatar, d),
        fitText(sharp, '@' + label, t.fontSize, t.pill.maxW),
    ]);

    return sharp(tplPath)
        .composite([
            { input: avatarPng, left: t.cx - t.r, top: t.cy - t.r },
            { input: text.buf, left: Math.round(t.pill.cx - text.w / 2), top: Math.round(t.pill.cy - text.h / 2) },
        ])
        .jpeg({ quality: 92 })
        .toBuffer();
}

module.exports = { buildCard, cleanName, TEMPLATES };
