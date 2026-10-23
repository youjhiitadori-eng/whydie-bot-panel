const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const P = require('pino');
const { loadBaileys } = require('./lib/baileys');

const app = express();
app.use(express.json());
app.use(express.static('public'));

app.use(session({
    secret: 'whydie-bot-super-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

const dbFolder = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, 'src/database');
if (!fs.existsSync(dbFolder)) fs.mkdirSync(dbFolder, { recursive: true });
const usersDbPath = path.join(dbFolder, 'users.json');

function getUsers() {
    if (!fs.existsSync(usersDbPath)) fs.writeFileSync(usersDbPath, '[]');
    return JSON.parse(fs.readFileSync(usersDbPath, 'utf8'));
}
function saveUsers(users) {
    fs.writeFileSync(usersDbPath, JSON.stringify(users, null, 2));
}

app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Isi semua kolom' });
    const users = getUsers();
    if (users.find(u => u.username === username)) return res.status(400).json({ error: 'Username sudah dipakai' });

    const hashedPassword = await bcrypt.hash(password, 10);
    users.push({ username, password: hashedPassword });
    saveUsers(users);
    res.json({ success: true, message: 'Registrasi berhasil, silakan login' });
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const users = getUsers();
    const user = users.find(u => u.username === username);
    if (!user) return res.status(400).json({ error: 'Akun tidak ditemukan' });
    
    const validPass = await bcrypt.compare(password, user.password);
    if (!validPass) return res.status(400).json({ error: 'Password salah' });

    req.session.user = { username: user.username };
    res.json({ success: true });
});

app.get('/api/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

app.get('/api/me', (req, res) => {
    if (req.session.user) res.json({ loggedIn: true, user: req.session.user });
    else res.json({ loggedIn: false });
});

app.get('/', (req, res) => {
    if (req.session.user) return res.redirect('/dashboard.html');
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/dashboard.html', (req, res, next) => {
    if (!req.session.user) return res.redirect('/');
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

let makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, delay, Browsers;
let activeSockets = {};

app.post('/api/pair', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
    const { phoneNumber } = req.body;
    if (!phoneNumber) return res.status(400).json({ error: 'Nomor WA wajib diisi' });

    try {
        const authFolder = path.join(dbFolder, `session_${req.session.user.username}_${phoneNumber}`);
        const { state, saveCreds } = await useMultiFileAuthState(authFolder);
        let version;
        try { ({ version } = await fetchLatestBaileysVersion()); } catch { version = [2, 3000, 1015901307]; }

        const sock = makeWASocket({
            version, logger: P({ level: 'silent' }), printQRInTerminal: false, auth: state,
            browser: Browsers?.macOS?.('Chrome') || ['Mac OS', 'Chrome', '14.4.1'],
            generateHighQualityLinkPreview: true, syncFullHistory: false, markOnlineOnConnect: true,
        });

        activeSockets[phoneNumber] = sock;
        sock.ev.on('creds.update', saveCreds);

        const messageHandler = require('./src/handlers/messageHandler');
        sock.ev.on('messages.upsert', (m) => {
            Promise.resolve(messageHandler(sock, m, true)).catch(e => console.error(e));
        });
        try { require('./src/handlers/groupHandler').attach(sock); } catch(e) {}
        try { require('./src/utils/nokosCore').attach(sock); } catch(e) {}

        if (!sock.authState.creds.registered) {
            await delay(1500);
            const code = await sock.requestPairingCode(phoneNumber);
            const formattedCode = code.match(/.{1,4}/g)?.join('-') || code;
            return res.json({ success: true, code: formattedCode });
        } else {
            return res.json({ success: false, message: 'Nomor sudah terdaftar' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Gagal membuat pairing code' });
    }
});

async function startServer() {
    const baileys = await loadBaileys();
    makeWASocket = baileys.default || baileys.makeWASocket;
    ({ useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, delay, Browsers } = baileys);

    const plugins = require('./src/utils/PluginLoader');
    plugins.init();

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, '0.0.0.0', () => console.log(`Server berjalan di port ${PORT}`));
}
startServer();
