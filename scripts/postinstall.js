// Bungkam log "Closing session" dari libsignal. Aman: tidak error kalau file tidak ada.
const fs = require('fs');
const path = require('path');

const candidates = [
    path.join(__dirname, '..', 'node_modules', 'libsignal', 'src', 'session_record.js'),
    path.join(__dirname, '..', 'node_modules', '@hanzofc', 'baileys', 'node_modules', 'libsignal', 'src', 'session_record.js'),
];

for (const file of candidates) {
    try {
        if (!fs.existsSync(file)) continue;
        const src = fs.readFileSync(file, 'utf8');
        const out = src.split('\n').filter(l => !/console\.info.*Closing session/.test(l)).join('\n');
        if (out !== src) fs.writeFileSync(file, out);
    } catch { /* abaikan */ }
}
