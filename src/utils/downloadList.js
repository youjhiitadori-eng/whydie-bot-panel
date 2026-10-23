// Daftar fitur Download (API: apiii-xrina.my.id/download/<path>)
// Mau tambah fitur? Cukup tambah 1 baris di FEATURES, command & menu otomatis ikut.
//   path  : nama endpoint di API
//   param : 'url' (link) atau 'q' (kata kunci pencarian)
//   want  : 'video' | 'audio' | 'auto' (kirim sesuai jenis file) | 'file' (kirim sebagai dokumen)
//   label : teks singkat untuk pesan bantuan
const FEATURES = {
    ytmp4:      { path: 'ytmp4',      param: 'url', want: 'video', label: 'Video YouTube', example: 'https://youtu.be/xxxx 720', quality: true },
    ytmp3:      { path: 'ytmp3',      param: 'url', want: 'audio', label: 'Audio YouTube', example: 'https://youtu.be/xxxx' },
    play:       { path: 'play',       param: 'q',   want: 'audio', label: 'Cari & putar lagu', example: 'jakarta hari ini' },
    tiktok:     { path: 'tiktok',     param: 'url', want: 'video', label: 'Video TikTok', example: 'https://vt.tiktok.com/xxxx' },
    twitterdl:  { path: 'twitterdl',  param: 'url', want: 'video', label: 'Video Twitter / X', example: 'https://x.com/user/status/123' },
    instagram:  { path: 'instagram',  param: 'url', want: 'auto',  label: 'Reel / foto Instagram', example: 'https://www.instagram.com/reel/xxxx' },
    igmp3:      { path: 'igmp3',      param: 'url', want: 'audio', label: 'Audio dari Instagram', example: 'https://www.instagram.com/reel/xxxx' },
    facebook:   { path: 'facebook',   param: 'url', want: 'video', label: 'Video Facebook', example: 'https://fb.watch/xxxx' },
    capcut:     { path: 'capcut',     param: 'url', want: 'video', label: 'Template CapCut', example: 'https://www.capcut.com/tv2/xxxx' },
    snackvideo: { path: 'snackvideo', param: 'url', want: 'video', label: 'Video SnackVideo', example: 'https://sck.io/xxxx' },
    bilibili:   { path: 'bilibili',   param: 'url', want: 'video', label: 'Video Bilibili', example: 'https://www.bilibili.tv/xxxx' },
    pindl:      { path: 'pindl',      param: 'url', want: 'auto',  label: 'Foto / video Pinterest', example: 'https://pin.it/xxxx' },
    mediafire:  { path: 'mediafire',  param: 'url', want: 'file',  label: 'File MediaFire', example: 'https://www.mediafire.com/file/xxxx' },
    terabox:    { path: 'terabox',    param: 'url', want: 'file',  label: 'File Terabox', example: 'https://terabox.com/s/xxxx' },
    gdrive:     { path: 'gdrive',     param: 'url', want: 'file',  label: 'File Google Drive', example: 'https://drive.google.com/file/d/xxxx' },
    aio:        { path: 'aio',        param: 'url', want: 'auto',  label: 'Downloader semua platform (v1)', example: 'https://link-apa-saja' },
    aio2:       { path: 'aio2',       param: 'url', want: 'auto',  label: 'Downloader semua platform (v2)', example: 'https://link-apa-saja' },
};

// Urutan tampil di menu (play2 = music player + lirik, ada di src/commands/play2.js)
const DOWNLOAD_COMMANDS = Object.keys(FEATURES).flatMap(c => c === 'play' ? [c, 'play2'] : [c]);

module.exports = { FEATURES, DOWNLOAD_COMMANDS };
