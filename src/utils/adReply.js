// Reply dengan foto kecil (thumbnail kotak) di dalam pesan, pakai foto menu (src/media/logo.png)
const config = require('../config');
const { getImage } = require('./helper');

let thumb;
function getThumb() {
    if (thumb === undefined) thumb = getImage('logo') || null;
    return thumb;
}

/** Tambahkan thumbnail ke pesan teks. Pesan yang sudah punya externalAdReply atau { noAd: true } tidak diubah. */
function withAd(content) {
    if (!content || typeof content !== 'object') return content;
    if (content.noAd) { const { noAd, ...rest } = content; return rest; }
    if (content.contextInfo?.externalAdReply) return content;
    const t = getThumb();
    if (!t) return content;
    return {
        ...content,
        contextInfo: {
            ...(content.contextInfo || {}),
            externalAdReply: {
                title: config.botName,
                body: config.footerTxt,
                thumbnail: t,
                mediaType: 1,
                renderLargerThumbnail: false,
                showAdAttribution: false,
                sourceUrl: 'https://' + String(config.website).replace(/^https?:\/\//, ''),
            },
        },
    };
}

module.exports = { withAd };
