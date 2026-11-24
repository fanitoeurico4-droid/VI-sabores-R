// Cola aqui os dados do teu projeto Supabase (Project Settings → API → Project URL e chave "anon public").
const SUPABASE_URL =https://xxkricnsfvqribinnnns.supabase.co/rest/v1/
const SUPABASE_KEY = sb_publishable_0Vr0nKNk6yBV1zfUQSiNxg_uqfXIKUw
if (SUPABASE_URL.includes("SEU-PROJETO")) {
  document.body.innerHTML = '<p style="padding:24px;font-family:sans-serif">Falta preencher o <b>config.js</b> com o URL e a chave do Supabase. Vê o README.</p>';
} else {
  window.sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
