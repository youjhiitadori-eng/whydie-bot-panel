// Pembuat ZIP murni Node.js (tanpa program zip/tar & tanpa dependency baru).
// zipDir(rootDir, outFile, { skip: (relPath, isDir) => boolean }) -> { files, bytes }
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();

function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
}

function dosDateTime(date) {
    const d = new Date(date);
    const year = Math.max(1980, d.getFullYear());
    return {
        time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
        date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
    };
}

function* walk(dir, rel, skip) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isSymbolicLink()) continue;
        if (e.isDirectory()) {
            if (skip(r, true)) continue;
            yield* walk(path.join(dir, e.name), r, skip);
        } else if (e.isFile()) {
            if (skip(r, false)) continue;
            yield { abs: path.join(dir, e.name), rel: r };
        }
    }
}

function zipDir(rootDir, outFile, { skip = () => false } = {}) {
    const fd = fs.openSync(outFile, 'w');
    const central = [];
    let offset = 0;
    let count = 0;
    const write = (buf) => { fs.writeSync(fd, buf, 0, buf.length); offset += buf.length; };
    try {
        for (const f of walk(rootDir, '', skip)) {
            let data;
            try { data = fs.readFileSync(f.abs); } catch { continue; } // file terkunci / hilang: lewati
            const stat = fs.statSync(f.abs);
            const name = Buffer.from(f.rel, 'utf8');
            const comp = data.length ? zlib.deflateRawSync(data, { level: 6 }) : Buffer.alloc(0);
            const useDeflate = comp.length < data.length;
            const body = useDeflate ? comp : data;
            const method = useDeflate ? 8 : 0;
            const crc = crc32(data);
            const { time, date } = dosDateTime(stat.mtime);

            const lh = Buffer.alloc(30);
            lh.writeUInt32LE(0x04034b50, 0);
            lh.writeUInt16LE(20, 4);
            lh.writeUInt16LE(0x0800, 6);          // nama file UTF-8
            lh.writeUInt16LE(method, 8);
            lh.writeUInt16LE(time, 10);
            lh.writeUInt16LE(date, 12);
            lh.writeUInt32LE(crc, 14);
            lh.writeUInt32LE(body.length, 18);
            lh.writeUInt32LE(data.length, 22);
            lh.writeUInt16LE(name.length, 26);
            lh.writeUInt16LE(0, 28);

            const localOffset = offset;
            write(lh); write(name); write(body);

            const ch = Buffer.alloc(46);
            ch.writeUInt32LE(0x02014b50, 0);
            ch.writeUInt16LE(0x031E, 4);          // dibuat di Unix
            ch.writeUInt16LE(20, 6);
            ch.writeUInt16LE(0x0800, 8);
            ch.writeUInt16LE(method, 10);
            ch.writeUInt16LE(time, 12);
            ch.writeUInt16LE(date, 14);
            ch.writeUInt32LE(crc, 16);
            ch.writeUInt32LE(body.length, 20);
            ch.writeUInt32LE(data.length, 24);
            ch.writeUInt16LE(name.length, 28);
            ch.writeUInt32LE(((stat.mode & 0xFFFF) << 16) >>> 0, 38);
            ch.writeUInt32LE(localOffset, 42);
            central.push(Buffer.concat([ch, name]));
            count++;
        }
        if (count > 65534) throw new Error('Terlalu banyak file untuk dijadikan ZIP.');
        const cdStart = offset;
        for (const c of central) write(c);
        const cdSize = offset - cdStart;
        const end = Buffer.alloc(22);
        end.writeUInt32LE(0x06054b50, 0);
        end.writeUInt16LE(count, 8);
        end.writeUInt16LE(count, 10);
        end.writeUInt32LE(cdSize, 12);
        end.writeUInt32LE(cdStart, 16);
        write(end);
    } finally {
        fs.closeSync(fd);
    }
    return { files: count, bytes: offset };
}

module.exports = { zipDir, crc32 };
