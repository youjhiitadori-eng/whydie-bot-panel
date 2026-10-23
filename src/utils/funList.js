// Daftar fitur FUN (API: apiii-xrina.my.id/fun/<path>)
// Mau tambah fitur? Tambah 1 entri di FEATURES. Bentuk:
//   path   : endpoint di API
//   param  : nama parameter input ('nama' / 'type'), kosongkan kalau tanpa input
//   label  : nama fitur, example : contoh isi input
//   fallbackName: true -> kalau input kosong pakai nama WhatsApp pengirim
//   image  : true -> API membalas gambar
//   format : (data, ctx) => teks balasan   (ctx: { input, pushname })
const s = (v) => (v == null ? '' : String(v).trim());

const quote = (icon, title) => (d) => `${icon} *${title}*\n\n${s(d.result || d.quote || d.text)}`;

const FEATURES = {
    artinama: {
        path: 'artinama', param: 'nama', label: 'Arti Nama', example: 'Galih', fallbackName: true,
        format: (d, c) => [`🔮 *ARTI NAMA ${s(d.nama || c.input).toUpperCase()}*`, '', s(d.arti), ...(d.catatan ? ['', `📝 _${s(d.catatan)}_`] : [])].join('\n'),
    },
    cekcantik: { path: 'cekcantik', label: 'Cek Kecantikan', format: (d, c) => `💅 *CEK CANTIK*\n👤 ${c.pushname}\n\n${s(d.result)}` },
    cekganteng: { path: 'cekganteng', label: 'Cek Ketampanan', format: (d, c) => `😎 *CEK GANTENG*\n👤 ${c.pushname}\n\n${s(d.result)}` },
    cekiq: { path: 'cekiq', label: 'Cek IQ', format: (d, c) => `🧠 *CEK IQ*\n👤 ${c.pushname}\n\n${s(d.result)}` },
    cekkhodam: {
        path: 'cekkhodam', param: 'nama', label: 'Cek Khodam', example: 'Galih', fallbackName: true,
        format: (d, c) => `🧿 *CEK KHODAM*\n👤 Nama: ${s(d.nama || c.input)}\n✨ Khodam: *${s(d.khodam)}*\n📜 ${s(d.deskripsi)}`,
    },
    ceksifat: {
        path: 'ceksifat', param: 'nama', label: 'Cek Sifat', example: 'Galih', fallbackName: true,
        format: (d, c) => [
            `🔍 *CEK SIFAT ${s(d.nama || c.input).toUpperCase()}*`, '',
            `😇 Akhlak baik : ${s(d.ahlak_baik)}`, `😈 Akhlak buruk : ${s(d.ahlak_buruk)}`,
            `🙂 Orangnya : ${s(d.orang_yang)}`, `🗣️ Selalu : ${s(d.selalu)}`,
            `🧠 Kecerdasan : ${s(d.kecerdasan)}`, `😜 Kenakalan : ${s(d.kenakalan)}`,
            `💪 Keberanian : ${s(d.keberanian)}`, `😨 Ketakutan : ${s(d.ketakutan)}`,
        ].join('\n'),
    },
    longteks: { path: 'longteks', label: 'Teks Random Panjang', format: (d) => s(d.text || d.result) },
    pantun: { path: 'pantun', label: 'Pantun', format: (d) => `📜 *PANTUN*\n\n${s(d.pantun) || (d.lines || []).join('\n')}` },
    pap: { path: 'pap', param: 'type', label: 'Pap Foto', example: 'cewe', image: true, choices: ['cewe', 'cowo'] },
    quotesbijak: { path: 'quotes-bijak', label: 'Quotes Bijak', format: quote('🧙', 'QUOTES BIJAK') },
    quotesbucin: { path: 'quotes-bucin', label: 'Quotes Bucin', format: quote('💘', 'QUOTES BUCIN') },
    quotesgalau: { path: 'quotes-galau', label: 'Quotes Galau', format: quote('🥀', 'QUOTES GALAU') },
    quotesgombal: { path: 'quotes-gombal', label: 'Quotes Gombal', format: quote('😏', 'QUOTES GOMBAL') },
    quotesmotivasi: { path: 'quotes-motivasi', label: 'Quotes Motivasi', format: quote('🔥', 'QUOTES MOTIVASI') },
};

const FUN_COMMANDS = Object.keys(FEATURES);

module.exports = { FEATURES, FUN_COMMANDS };
