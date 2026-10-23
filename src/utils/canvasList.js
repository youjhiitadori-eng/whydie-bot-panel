// Daftar fitur Canva / Canvas (API: apiii-xrina.my.id/canvas/<path>)
// Mau tambah fitur? Cukup tambah 1 entri di FEATURES, command & menu otomatis ikut.
//   params : urutan input user (dipisah tanda |). Tiap param: { key, label, image?, optional?, def? }
//            image: true  -> boleh URL, foto yang dikirim/di-reply, atau (kalau kosong) foto profil WhatsApp pengirim
//   label  : nama fitur, example : contoh pemakaian (setelah nama command)
const img = (key, label = 'foto', extra = {}) => ({ key, label, image: true, optional: true, ...extra });
const txt = (key, label, extra = {}) => ({ key, label, ...extra });

const FEATURES = {
    callandro:  { path: 'call-andro', label: 'Fake Call Android', params: [img('pp', 'foto profil'), txt('nama', 'nama'), txt('durasi', 'durasi', { def: '00:12' })], example: 'Welper | 01:25' },
    callios:    { path: 'call-ios', label: 'Fake Call iPhone', params: [img('pp', 'foto profil'), txt('nama', 'nama'), txt('durasi', 'durasi', { def: '00:12' })], example: 'Welper | 01:25' },
    codesnap:   { path: 'codesnap', label: 'Screenshot Kode', params: [txt('code', 'kode', { multiline: true }), txt('language', 'bahasa', { def: 'auto', optional: true }), txt('theme', 'tema', { def: 'dracula-pro', optional: true })], example: 'console.log("halo") | javascript | dracula-pro', note: 'Reply pesan berisi kode lalu ketik .codesnap juga bisa.' },
    fakech:     { path: 'fakech', label: 'Fake Channel WhatsApp', params: [img('pp', 'foto profil'), txt('nama', 'nama channel'), txt('pengikut', 'jumlah pengikut', { def: '1,2 jt' }), txt('jam', 'jam', { def: '12.00' })], example: 'Nayla Channel | 1,2 jt | 12.00' },
    fakeff2:    { path: 'fakeff2', label: 'Fake Free Fire', params: [txt('usn', 'username')], example: 'Welper' },
    fakeffduo:  { path: 'fakeffduo', label: 'Fake Free Fire Duo', params: [txt('name1', 'nama pemain 1'), txt('name2', 'nama pemain 2')], example: 'Welper | Nayla' },
    fakegc:     { path: 'fakegc', label: 'Fake Grup WhatsApp', params: [img('pp', 'foto grup'), txt('nama', 'nama grup'), txt('anggota', 'jumlah anggota', { def: '256' })], example: 'Grup Santuy | 256' },
    fakegopay:  { path: 'fakegopay', label: 'Fake GoPay', params: [txt('saldo', 'saldo'), txt('koin', 'koin', { def: '0' }), txt('terpakai', 'terpakai', { def: '0' }), txt('bulan', 'bulan', { def: 'Januari' })], example: '1500000 | 250 | 350000 | Januari' },
    fakeml:     { path: 'fakeml', label: 'Fake Profil Mobile Legends', params: [img('avatar', 'avatar'), txt('username', 'username'), txt('rank', 'rank', { def: 'Mythic' })], example: 'Welper | Mythic' },
    fakeovo:    { path: 'fakeovo', label: 'Fake OVO', params: [txt('nominal', 'nominal')], example: '1500000' },
    faketele:   { path: 'faketele', label: 'Fake Profil Telegram', params: [img('pp', 'foto profil'), txt('nama', 'nama'), txt('nomor', 'nomor'), txt('bio', 'bio', { def: '-' }), txt('username', 'username')], example: 'Welper | +62 812 3456 7890 | Halo dunia | welper' },
    ffgirl:     { path: 'ffgirl', label: 'Free Fire Girl', params: [txt('username', 'username'), txt('template', 'template', { def: '1', optional: true })], example: 'Welper | 1' },
    igstory:    { path: 'ig-story', label: 'Fake Story Instagram', params: [img('photo', 'foto story', { fallbackSelf: false }), img('pp', 'foto profil'), txt('name', 'nama'), txt('username', 'username')], example: 'Welper | welper.id', note: 'Foto story = foto yang dikirim / di-reply, foto profil otomatis dari WhatsApp kamu.' },
    iqc:        { path: 'iqc', label: 'Fake Chat iPhone', params: [txt('text', 'teks pesan', { multiline: true }), txt('time', 'jam', { def: '12.00' })], example: 'Halo, lagi apa? | 12.00' },
    iqcpink:    { path: 'iqcpink', label: 'Fake Chat iPhone (Pink)', params: [txt('text', 'teks pesan', { multiline: true }), txt('time', 'jam', { def: '12.00' })], example: 'Halo, lagi apa? | 12.00' },
    iqcpinkv2:  { path: 'iqcpinkv2', label: 'Fake Chat iPhone (Pink v2)', params: [txt('text', 'teks pesan', { multiline: true }), img('image', 'gambar', { fallbackSelf: false }), txt('time', 'jam', { def: '12.00' })], example: 'Halo, lagi apa? | 12.00', note: 'Gambar = foto yang dikirim / di-reply.' },
    meledak:    { path: 'meledak', label: 'Efek Meledak', params: [img('image', 'gambar', { fallbackSelf: true })], example: '', note: 'Kirim / reply foto, atau kosongkan untuk pakai foto profilmu.' },
    memepolisi: { path: 'meme-polisi', label: 'Meme Polisi', params: [txt('username', 'username'), txt('text', 'teks')], example: 'Welper | Ditangkap karena terlalu ganteng' },
    musiccard:  { path: 'musiccard', label: 'Kartu Musik', params: [txt('judul', 'judul lagu'), txt('artis', 'artis'), img('cover', 'cover', { fallbackSelf: true })], example: 'Judul Lagu | Nama Artis', note: 'Cover = foto yang dikirim / di-reply (kosong = foto profilmu).' },
    nokia:      { path: 'nokia', label: 'SMS Nokia Jadul', params: [txt('message', 'isi pesan', { multiline: true }), txt('sender', 'pengirim'), txt('date', 'tanggal', { def: '01/01' }), txt('time', 'jam', { def: '12:00' })], example: 'Besok ketemu ya | Doi | 17/10 | 08:30' },
    quotes:     { path: 'quotes', label: 'Gambar Quotes', params: [txt('text', 'quotes', { multiline: true }), txt('name', 'nama')], example: 'Jangan menyerah | Welper' },
    ttqc:       { path: 'ttqc', label: 'Komentar TikTok', params: [txt('name', 'nama'), txt('text', 'komentar', { multiline: true }), img('avatar', 'foto profil')], example: 'Welper | Keren banget kak!' },
    windows:    { path: 'windows', label: 'Error Windows', params: [txt('text', 'teks error', { multiline: true })], example: 'Nayla AI telah berhenti bekerja' },
};
// Alias supaya nama panggilan lama / singkat juga jalan
FEATURES.callandro.alias = ['callandroid'];

const CANVAS_COMMANDS = Object.keys(FEATURES);

module.exports = { FEATURES, CANVAS_COMMANDS };
