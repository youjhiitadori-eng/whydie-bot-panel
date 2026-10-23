// Daftar GAME tebak-tebakan (API: apiii-xrina.my.id/game/<path>)
// Mau tambah game? Tambah 1 entri di FEATURES. Bentuk:
//   path  : endpoint di API          label : nama game
//   build : (data) => { question, image?, answers: [..], clue?, reveal? }
//           question = teks soal, image = URL gambar soal (opsional), answers = semua jawaban yang diterima,
//           clue = petunjuk tambahan untuk .hint, reveal = info yang ditampilkan setelah soal selesai
const s = (v) => (v == null ? '' : String(v).trim());
const list = (...vals) => vals.map(s).filter(Boolean);

const FEATURES = {
    asahotak:    { path: 'asahotak',    label: 'Asah Otak',    build: (d) => ({ question: s(d.soal), answers: list(d.jawaban) }) },
    caklontong:  { path: 'caklontong',  label: 'Cak Lontong',  build: (d) => ({ question: s(d.soal), answers: list(d.jawaban), reveal: s(d.deskripsi) }) },
    kataacak:    { path: 'kataacak',    label: 'Kata Acak',    build: (d) => ({ question: `Susun huruf acak ini jadi kata yang benar:\n\n🔤 *${s(d.soal || d.kata)}*`, answers: list(d.jawaban, d.kata) }) },
    susunkata:   { path: 'susunkata',   label: 'Susun Kata',   build: (d) => ({ question: `Susun huruf ini jadi kata yang benar:\n\n🔤 *${s(d.soal)}*`, answers: list(d.jawaban), extra: d.tipe ? `🏷️ Tipe: ${s(d.tipe)}` : '' }) },
    tebakbendera:{ path: 'tebakbendera',label: 'Tebak Bendera',build: (d) => ({ question: 'Bendera negara apa ini?', image: s(d.img), answers: list(d.name || d.jawaban) }) },
    tebakbuah:   { path: 'tebakbuah',   label: 'Tebak Buah',   build: (d) => ({ question: s(d.soal), answers: list(d.jawaban) }) },
    tebakepep:   { path: 'tebakepep',   label: 'Tebak Karakter Free Fire', build: (d) => ({ question: 'Karakter Free Fire siapa ini?', image: s(d.img || d.fullimg), answers: list(d.jawaban), clue: s(d.deskripsi) && `Skill: ${s(d.deskripsi)}` }) },
    tebakgambar: { path: 'tebakgambar', label: 'Tebak Gambar', build: (d) => ({ question: 'Tebak maksud gambar ini!', image: s(d.img), answers: list(d.jawaban), clue: s(d.deskripsi) && `Petunjuk: ${s(d.deskripsi)}` }) },
    tebakhewan:  { path: 'tebakhewan',  label: 'Tebak Hewan',  build: (d) => ({ question: s(d.soal), answers: list(d.jawaban) }) },
    tebakkalimat:{ path: 'tebakkalimat',label: 'Tebak Kalimat',build: (d) => ({ question: `Lengkapi kalimat ini:\n\n${s(d.soal)}`, answers: list(d.jawaban) }) },
    tebakkata:   { path: 'tebakkata',   label: 'Tebak Kata',   build: (d) => ({ question: `Kata apa yang cocok untuk petunjuk ini?\n\n💡 ${s(d.soal)}`, answers: list(d.jawaban) }) },
    tebakkimia:  { path: 'tebakkimia',  label: 'Tebak Kimia',  build: (d) => ({ question: `Apa *lambang kimia* dari unsur *${s(d.unsur)}*?`, answers: list(d.lambang), clue: s(d.lambang) && `Jumlah huruf: ${s(d.lambang).length}` }) },
    tebaktebakan:{ path: 'tebaktebakan',label: 'Tebak-tebakan',build: (d) => ({ question: s(d.soal), answers: list(d.jawaban) }) },
};

const GAME_COMMANDS = Object.keys(FEATURES);

module.exports = { FEATURES, GAME_COMMANDS };
