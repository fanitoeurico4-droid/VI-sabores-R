const SUPABASE_URL = "https://xxkricnsfvqribinnnns.supabase.co";
const SUPABASE_KEY = "sb_publishable_0Vr0nKNk6yBV1zfUQSiNxg_uqfXIKUw";
try {
  if (SUPABASE_URL.includes("COLA-AQUI") || SUPABASE_KEY.includes("COLA-AQUI")) throw new Error("O URL ou a chave ainda não foram preenchidos.");
  if (!window.supabase) throw new Error("A biblioteca do Supabase não carregou.");
  window.sb = window.supabase.createClient(SUPABASE_URL.trim(), SUPABASE_KEY.trim());
} catch (e) {
  alert("Erro no config.js: " + e.message);
}
