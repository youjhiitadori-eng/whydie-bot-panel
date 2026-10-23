// Daftar fitur API apiii-xrina.my.id untuk 6 kategori menu: INFO, KOMIK, MAKER, SEARCH, STALKER, TOOLS
// Mau tambah fitur? Cukup tambah 1 baris di GROUPS[...].features, command & menu otomatis ikut.
//   path   : nama endpoint (https://apiii-xrina.my.id/<group>/<path>)
//   params : input user berurutan. { key, label, kind?, optional?, def? }
//            kind: 'url' (link) | 'image' (link ATAU kirim/reply foto) | teks biasa (default)
//   fixed  : parameter tetap yang selalu dikirim ke API
//   want   : cara menampilkan hasil
//            'text' (daftar/teks rapi) | 'image' | 'video' | 'audio' | 'sticker' | 'images' (beberapa gambar) | 'file'
//   alias  : nama panggilan lain
const T = (key, label, extra = {}) => ({ key, label, ...extra });
const U = (key, label, extra = {}) => ({ key, label, kind: 'url', ...extra });
const I = (key, label, extra = {}) => ({ key, label, kind: 'image', ...extra });

const GROUPS = {
    info: {
        title: 'INFO MENU', cmd: 'infomenu', desc: 'Berita, gempa & info terkini', icon: '📰',
        features: {
            antara:       { path: 'antara', label: 'Berita Antara', params: [] },
            beritajakarta: { path: 'beritajakarta', label: 'Berita Jakarta', params: [T('limit', 'jumlah', { def: '10', optional: true })], fixed: {}, example: '10' },
            bmkggempa:    { path: 'bmkg-gempa', label: 'Info Gempa BMKG', params: [], fixed: { format: 'image' }, want: 'image', alias: ['gempa'] },
            cnbc:         { path: 'cnbc', label: 'Berita CNBC Indonesia', params: [] },
            cnn:          { path: 'cnn', label: 'Berita CNN Indonesia', params: [] },
            infopublik:   { path: 'infopublik', label: 'Info Publik', params: [T('limit', 'jumlah', { def: '10', optional: true })], example: '10' },
            kemenag:      { path: 'kemenag', label: 'Berita Kemenag', params: [T('limit', 'jumlah', { def: '10', optional: true })], example: '10' },
            kemkes:       { path: 'kemkes', label: 'Berita Kemenkes', params: [T('limit', 'jumlah', { def: '10', optional: true })], example: '10' },
            kompas:       { path: 'kompas', label: 'Berita Kompas', params: [] },
        },
    },
    komik: {
        title: 'KOMIK MENU', cmd: 'komikmenu', desc: 'Cari, detail & baca komik', icon: '📚',
        features: {
            komikhome:   { path: 'home', label: 'Beranda Komik', params: [] },
            komikupdate: { path: 'update', label: 'Update Komik Terbaru', params: [] },
            komikbrowse: { path: 'browse', label: 'Jelajah Komik', params: [] },
            komiksearch: { path: 'search', label: 'Cari Komik', params: [T('q', 'judul komik')], example: 'one piece' },
            komikdetail: { path: 'detail', label: 'Detail Komik', params: [U('url', 'link komik')], example: 'https://link-komik' },
            komikread:   { path: 'read', label: 'Baca Chapter Komik', params: [U('url', 'link chapter')], example: 'https://link-chapter', want: 'images', max: 10 },
        },
    },
    maker: {
        title: 'MAKER MENU', cmd: 'makermenu', desc: 'Bikin stiker, brat, meme & quotes', icon: '🎨',
        features: {
            attp:           { path: 'attp', label: 'Stiker Teks Berwarna (ATTP)', params: [T('text', 'teks')], want: 'sticker', example: 'Halo semua' },
            brat:           { path: 'brat', label: 'Stiker Brat', params: [T('text', 'teks'), T('theme', 'tema', { def: 'putih', optional: true })], want: 'sticker', example: 'haloo | putih' },
            bratvermeil:    { path: 'brat-vermeil', label: 'Stiker Brat Vermeil', params: [T('text', 'teks')], want: 'sticker', example: 'haloo' },
            bratgojo:       { path: 'bratgojo', label: 'Stiker Brat Gojo', params: [T('text', 'teks')], want: 'sticker', example: 'haloo' },
            bratspongebob:  { path: 'bratspongebob', label: 'Stiker Brat Spongebob', params: [T('text', 'teks')], want: 'sticker', example: 'haloo' },
            bratvid:        { path: 'bratvid', label: 'Brat Video', params: [T('text', 'teks')], want: 'video', example: 'haloo', slow: true },
            bratvid2:       { path: 'bratvid2', label: 'Brat Video v2', params: [T('text', 'teks')], want: 'video', example: 'haloo', slow: true },
            emojimix:       { path: 'emojimix', label: 'Gabung 2 Emoji', params: [T('emoji1', 'emoji 1'), T('emoji2', 'emoji 2')], want: 'sticker', example: '😎 | 😍', spaceSplit: true, note: 'Boleh ditulis rapat: .emojimix 😎😍' },
            qc:             { path: 'qc', label: 'Quote Chat (stiker)', params: [T('text', 'teks', { multiline: true }), T('name', 'nama', { optional: true, def: '@sender' }), T('color', 'warna', { def: 'yellow', optional: true }), I('avatar', 'foto profil', { optional: true, self: true })], want: 'sticker', example: 'Halo semua | Welper | yellow', note: 'Foto profil otomatis dari WhatsApp kamu, atau kirim / reply foto.' },
            smeme:          { path: 'smeme', label: 'Stiker Meme (gambar)', params: [I('url', 'gambar', { fromMedia: true }), T('top', 'teks atas', { optional: true, def: '' }), T('bottom', 'teks bawah', { optional: true, def: '' })], want: 'image', example: 'teks atas | teks bawah', note: 'Kirim / reply foto, atau tempel link gambar.' },
            smemevid:       { path: 'smemevid', label: 'Meme Video / GIF', params: [U('url', 'link video / gif'), T('top', 'teks atas', { optional: true, def: '' }), T('bottom', 'teks bawah', { optional: true, def: '' })], want: 'video', example: 'https://link-video | teks atas | teks bawah', slow: true },
            stickerreaksi:  { path: 'sticker-reaksi', label: 'Stiker Reaksi', params: [T('text', 'teks')], want: 'sticker', example: 'mantap' },
        },
    },
    search: {
        title: 'SEARCH MENU', cmd: 'searchmenu', desc: 'Cari lagu, resep, stiker & lainnya', icon: '🔎',
        features: {
            amfinder:         { path: 'amfinder', label: 'Cari Lagu dari Link (AM Finder)', params: [U('url', 'link')], example: 'https://link-lagu' },
            capcutcomment:    { path: 'capcut-comment', label: 'Komentar CapCut', params: [U('url', 'link CapCut')], example: 'https://www.capcut.com/tv2/xxxx' },
            lyrics:           { path: 'lyrics', label: 'Cari Lirik Lagu', params: [T('q', 'judul lagu')], example: 'sial mahalini', alias: ['lirik'] },
            npm:              { path: 'npm', label: 'Cari Package NPM', params: [T('q', 'nama package')], example: 'axios' },
            pinterest:        { path: 'pinterest', label: 'Cari Gambar Pinterest', params: [T('q', 'kata kunci')], fixed: { limit: '10' }, want: 'images', max: 5, example: 'aesthetic wallpaper', alias: ['pin'] },
            resep:            { path: 'resep', label: 'Cari Resep Masakan', params: [T('q', 'nama masakan')], example: 'nasi goreng' },
            spotify:          { path: 'spotify', label: 'Cari Lagu Spotify', params: [T('query', 'judul lagu')], example: 'sial mahalini' },
            stickertelegram:  { path: 'sticker-telegram', label: 'Cari Stiker Telegram', params: [T('keyword', 'kata kunci')], example: 'kucing', alias: ['stele'] },
            stickerly:        { path: 'stickerly', label: 'Cari Stiker Sticker.ly', params: [T('q', 'kata kunci')], example: 'kucing' },
            ttsearch:         { path: 'ttsearch', label: 'Cari Video TikTok', params: [T('q', 'kata kunci')], example: 'kucing lucu' },
            ytcomment:        { path: 'yt-comment', label: 'Komentar YouTube', params: [U('url', 'link YouTube')], example: 'https://youtu.be/xxxx' },
            ytsearch:         { path: 'ytsearch', label: 'Cari Video YouTube', params: [T('q', 'kata kunci')], example: 'tutorial nodejs', alias: ['yts'] },
        },
    },
    stalker: {
        title: 'STALKER MENU', cmd: 'stalkermenu', desc: 'Cek profil akun game & sosmed', icon: '🕵️',
        features: {
            stalkff:       { path: 'stalk-ff', label: 'Stalk Free Fire', params: [T('uid', 'ID Free Fire')], example: '36587925', pic: true },
            stalkgh:       { path: 'stalk-gh', label: 'Stalk GitHub', params: [T('username', 'username')], example: 'torvalds', pic: true },
            stalkig:       { path: 'stalk-ig', label: 'Stalk Instagram', params: [T('username', 'username')], example: 'instagram', pic: true },
            stalkml:       { path: 'stalk-ml', label: 'Stalk Mobile Legends', params: [T('id', 'ID'), T('server', 'server')], example: '12123123 | 3122', spaceSplit: true, pic: true },
            stalkroblox:   { path: 'stalk-roblox', label: 'Stalk Roblox', params: [T('username', 'username')], example: 'Roblox', pic: true },
            stalktelegram: { path: 'stalk-telegram', label: 'Stalk Telegram', params: [T('username', 'username')], example: 'durov', pic: true },
            stalkthreads:  { path: 'stalk-threads', label: 'Stalk Threads', params: [T('username', 'username')], example: 'zuck', pic: true },
            stalktiktok:   { path: 'stalk-tiktok', label: 'Stalk TikTok', params: [T('username', 'username')], example: 'tiktok', pic: true },
            stalkx:        { path: 'stalk-x', label: 'Stalk X / Twitter', params: [T('username', 'username')], example: 'elonmusk', pic: true },
            stalkyt:       { path: 'stalk-yt', label: 'Stalk YouTube', params: [T('username', 'username / channel')], example: 'MrBeast', pic: true },
        },
    },
    tools: {
        title: 'TOOLS MENU', cmd: 'toolsmenu', desc: 'OCR, TTS, QR, bypass, tempmail & lainnya', icon: '🧰',
        features: {
            bypass:      { path: 'bypass', label: 'Bypass Link Shortener', params: [U('url', 'link')], example: 'https://link-pendek' },
            ceknsfw:     { path: 'cek-nsfw', label: 'Cek Gambar NSFW', params: [I('image', 'gambar', { fromMedia: true })], example: '', note: 'Kirim / reply foto, atau tempel link gambar.' },
            cekbanwa:    { path: 'cekban-wa', label: 'Cek Banned Nomor WhatsApp', params: [T('number', 'nomor')], example: '628123456789' },
            cekmail:     { path: 'cekmail', label: 'Cek Inbox Tempmail', params: [T('token', 'token tempmail')], example: 'token-dari-.tempmail', note: 'Token didapat dari command .tempmail' },
            cekphising:  { path: 'cekphising', label: 'Cek Link Phising', params: [U('url', 'link')], example: 'https://link-mencurigakan', alias: ['cekphishing'] },
            createvid:   { path: 'createvid', label: 'Buat Video dari Prompt', params: [T('prompt', 'prompt', { multiline: true })], want: 'video', example: 'kucing lompat di bulan', slow: true },
            hdvid:       { path: 'hdvid', label: 'HD-kan Video', params: [U('url', 'link video'), T('mode', 'mode', { def: 'hd2x', optional: true, choices: ['cinematic', 'hd4x', 'hd2x'] })], want: 'video', example: 'https://link-video | hd2x', spaceSplit: true, slow: true, note: 'Mode: cinematic, hd4x, hd2x (default hd2x).' },
            ocr:         { path: 'ocr', label: 'Gambar ke Teks (OCR)', params: [I('url', 'gambar', { fromMedia: true })], example: '', note: 'Kirim / reply foto, atau tempel link gambar.' },
            qrcode:      { path: 'qrcode', label: 'Buat QR Code', params: [T('text', 'teks / link')], want: 'image', example: 'https://welper.web.id', alias: ['qr'] },
            rateweb:     { path: 'rateweb', label: 'Nilai Performa Website', params: [U('url', 'link website'), T('strategy', 'strategi', { def: 'desktop', optional: true, choices: ['desktop', 'mobile'] })], example: 'https://welper.web.id | desktop', spaceSplit: true },
            tempmail:    { path: 'tempmail', label: 'Email Sementara', params: [] },
            tts:         { path: 'tts', label: 'Teks ke Suara (TTS)', params: [T('text', 'teks', { multiline: true }), T('model', 'model suara', { def: 'miku', optional: true })], want: 'audio', example: 'Halo semua | miku' },
            transkripsi: { path: 'transkripsi', label: 'Transkripsi Video / Audio', params: [U('url', 'link video / audio')], example: 'https://youtu.be/xxxx', slow: true },
            txt2video:   { path: 'txt2video', label: 'Teks ke Video', params: [T('prompt', 'prompt', { multiline: true })], want: 'video', example: 'pantai saat matahari terbenam', slow: true },
            vid2prompt:  { path: 'vid2prompt', label: 'Video ke Prompt', params: [U('url', 'link video'), T('personalization', 'gaya / personalisasi', { optional: true, def: '' })], example: 'https://link-video | cinematic', slow: true },
            web2apk:     { path: 'web2apk', label: 'Website ke APK', params: [U('url', 'link website'), T('appName', 'nama aplikasi'), T('packageName', 'package name')], want: 'file', example: 'https://welper.web.id | Welper | id.welper.app', slow: true },
            webtozip:    { path: 'webtozip', label: 'Website ke ZIP', params: [U('url', 'link website')], want: 'file', example: 'https://welper.web.id', slow: true },
            whatmusic:   { path: 'whatmusic', label: 'Tebak Lagu dari Video / Audio', params: [U('url', 'link video / audio')], example: 'https://link-video' },
        },
    },
};

// Satukan jadi { namaCommand: fitur } + nama panggilan
const FEATURES = {};
for (const [group, g] of Object.entries(GROUPS)) {
    for (const [name, f] of Object.entries(g.features)) {
        f.group = group;
        f.want = f.want || 'text';
        f.name = name;
        FEATURES[name] = f;
    }
}
for (const f of Object.values({ ...FEATURES })) for (const a of f.alias || []) FEATURES[a] = f;

const COMMANDS = Object.keys(FEATURES);
const groupCommands = (group) => Object.keys(GROUPS[group].features);

module.exports = { GROUPS, FEATURES, COMMANDS, groupCommands };
