// Daftar fitur AI Chat (API: apiii-xrina.my.id/ai/<path>)
// Mau tambah fitur? Cukup tambah 1 baris di FEATURES, command & menu otomatis ikut.
//   path  : endpoint di API          param : nama parameter teks (default 'text')
//   extra : parameter tambahan (angka/teks tetap)     label : nama singkat
const FEATURES = {
    gpt:         { path: 'gpt',         label: 'ChatGPT' },
    gemini:      { path: 'gemini',      label: 'Google Gemini' },
    claude:      { path: 'claudehaiku', label: 'Claude Haiku' },
    claudehaiku: { path: 'claudehaiku', label: 'Claude Haiku' },
    qwen:        { path: 'qwen',        label: 'Qwen' },
    blackbox:    { path: 'blackbox-ai', param: 'query', label: 'Blackbox AI' },
    deepai:      { path: 'deepai',      label: 'DeepAI' },
    algolia:     { path: 'algolia',     label: 'Algolia AI' },
    asyntai:     { path: 'asyntai',     label: 'Asyntai' },
    overchat:    { path: 'overchat',    label: 'Overchat' },
    notegpt:     { path: 'notegpt',     label: 'NoteGPT', extra: { model: 'auto', search: 'false' } },
    notrack:     { path: 'notrack-ai',  label: 'NoTrack AI', extra: { style: 'normal' } },
    clara:       { path: 'clara',       label: 'Clara' },
    ethan:       { path: 'ethan',       label: 'Ethan' },
    guru:        { path: 'guru',        label: 'Guru' },
    honcho:      { path: 'honcho',      label: 'Honcho' },
    maya:        { path: 'maya',        label: 'Maya' },
    naxa:        { path: 'naxa',        label: 'Naxa' },
    nova:        { path: 'nova',        label: 'Nova' },
    // Persona kustom: .aicostum <prompt/karakter> | <pertanyaan>
    aicostum:    { path: 'aicostum',    label: 'AI Custom (atur karakter sendiri)', custom: true },
    // Unlimited AI: karakter bawaan
    rinai:       { path: 'unlimitedai', label: 'Rin AI',     extra: { character: 'rin-ai' } },
    zetaai:      { path: 'unlimitedai', label: 'Zeta AI',    extra: { character: 'zeta-ai' } },
    frierenai:   { path: 'unlimitedai', label: 'Frieren AI', extra: { character: 'frieren-ai' } },
};

const AI_COMMANDS = Object.keys(FEATURES).filter(c => c !== 'claudehaiku');

module.exports = { FEATURES, AI_COMMANDS };
