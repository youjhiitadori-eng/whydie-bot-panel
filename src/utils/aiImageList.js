// Daftar fitur AI Image (API: apiii-xrina.my.id/ai-image/<fitur>)
// Mau tambah fitur? Cukup tambah nama di IMAGE_FEATURES (butuh foto) atau TEXT_FEATURES (butuh prompt).
const IMAGE_FEATURES = [
    'tozombie', 'hd', 'hd2', 'tobotak', 'tochibi', 'tofigura', 'tofigurav2', 'tofigurav3',
    'toghibli', 'tohijab', 'tomaid', 'tohitam', 'tojapanese', 'tojepang', 'tokacamata',
    'tokamboja', 'toliquor', 'tomirror', 'tomoai', 'tomonyet', 'topacar', 'topeci',
    'topiramida', 'toputih', 'toreal', 'toroblox', 'toroh', 'totato', 'totua',
    'tounderground', 'toviking',
];
const TEXT_FEATURES = ['flux', 'text2img'];

const FEATURES = {};
for (const n of IMAGE_FEATURES) FEATURES[n] = { type: 'image' };
for (const n of TEXT_FEATURES) FEATURES[n] = { type: 'text' };

module.exports = { FEATURES, IMAGE_FEATURES, TEXT_FEATURES };
