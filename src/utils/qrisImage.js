// Ubah data pembayaran QRIS dari Nokoskuy (payment.qris) menjadi FOTO kode QR yang siap dikirim ke WhatsApp.
//
// payment.qris berisi salah satu dari:
//   - teks QRIS (diawali "0002...")                -> digambar jadi QR
//   - URL gambar QR (qris_is_image_url = true)     -> diunduh apa adanya
//   - data:image/...;base64,...                     -> didekode
// Tidak pernah throw: gagal -> null (pemanggil jatuh ke tombol "Buka Halaman Bayar").
const QRCode = require('qrcode');
const axios = require('axios');

const IMG_URL = /^https?:\/\/\S+$/i;

async function fromUrl(url) {
    const { data } = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000, maxContentLength: 5 * 1024 * 1024 });
    return Buffer.from(data);
}

/**
 * @param {{qris?:string, qris_is_image_url?:boolean}} payment
 * @returns {Promise<Buffer|null>} PNG/JPG
 */
async function qrisBuffer(payment) {
    const raw = String(payment?.qris || '').trim();
    if (!raw) return null;
    try {
        if (/^data:image\/[a-z+]+;base64,/i.test(raw)) return Buffer.from(raw.split(',')[1], 'base64');
        if (payment.qris_is_image_url || (IMG_URL.test(raw) && /\.(png|jpe?g|webp)(\?|$)/i.test(raw))) return await fromUrl(raw);
        // Teks QRIS -> QR. Margin (quiet zone) 4 modul + latar putih supaya terbaca semua aplikasi e-wallet/m-banking.
        return await QRCode.toBuffer(raw, {
            type: 'png', width: 720, margin: 4, errorCorrectionLevel: 'M',
            color: { dark: '#000000', light: '#FFFFFF' },
        });
    } catch (e) {
        console.error('[QRIS] gagal membuat gambar QR:', e.message);
        return null;
    }
}

module.exports = { qrisBuffer };
