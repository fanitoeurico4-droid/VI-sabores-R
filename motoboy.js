// Área do motoboy — login próprio; só vê entregas através das funções do Supabase (supabase/motoboy.sql).
const sb = window.sb;
const $ = (s, r = document) => r.querySelector(s);
const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const mt = n => new Intl.NumberFormat("pt-MZ", { style: "currency", currency: "MZN", maximumFractionDigits: 0 }).format(n);
const KD = "easyfood_motoboy_disp";
let POS = null, USER = null, ME = null, LIVRES = [], MINHAS = [], aba = "disponiveis", disp = localStorage.getItem(KD) !== "0";
const falha = e => alert("Erro: " + (e.message || e));
const navLink = (txt, lat, lng) => lat != null && lng != null ? `<a href="https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}" target="_blank" rel="noopener">${txt}</a>` : "";
const kmDe = e => POS && e.recolha_lat != null ? kmEntre(POS.lat, POS.lng, e.recolha_lat, e.recolha_lng) : null;
const abertas = () => MINHAS.filter(e => e.estado !== "entregue" && e.estado !== "recusada");

async function init() {
  if (!sb) { $("#app").innerHTML = `<div class="card"><strong>Falta configurar o Supabase.</strong> <span class="muted">Preenche o config.js.</span></div>`; return; }
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return vLogin();
  USER = session.user;
  const { data } = await sb.from("motoboys").select("*").eq("user_id", USER.id).maybeSingle();
  if (!data) return vPerfil();
  ME = data;
  if (!ME.aprovado) {
    $("#tit").textContent = ME.nome; $("#sub").textContent = "À espera de aprovação";
    $("#app").innerHTML = `<div class="vazio">O teu perfil está a ser analisado pelo administrador. Volta mais tarde.</div><div class="acoes"><button class="b" id="sair">Sair</button></div>`;
    $("#sair").onclick = async () => { await sb.auth.signOut(); location.reload(); }; return;
  }
  $("#tit").textContent = ME.nome; $("#sub").textContent = "Mota: " + (ME.moto || "—");
  $("#tabs").hidden = false; $("#btnDisp").hidden = false;
  document.querySelectorAll("#tabs button").forEach(b => b.onclick = () => { aba = b.dataset.tab; render(); });
  $("#btnDisp").onclick = () => { disp = !disp; localStorage.setItem(KD, disp ? "1" : "0"); atualizar(); };
  minhaPosicao().then(p => { POS = p; if (p) atualizar(); });
  await atualizar();
  setInterval(() => { if (!document.hidden) atualizar(); }, 10000); // sem tempo real para motoboys: atualiza de 10 em 10 s
}
async function atualizar() {
  const [l, m] = await Promise.all([disp ? sb.rpc("entregas_livres") : Promise.resolve({ data: [] }), sb.rpc("minhas_entregas")]);
  if (l.error || m.error) return console.error(l.error || m.error);
  LIVRES = (l.data || []).sort((a, b) => (kmDe(a) ?? 1e9) - (kmDe(b) ?? 1e9)); MINHAS = m.data || []; render();
}
async function agir(p) { const { data, error } = await p; if (error) falha(error); await atualizar(); return data; }

function vLogin(msg = "") {
  $("#sub").textContent = "Entra para ver entregas";
  $("#app").innerHTML = `<form class="f card" id="fl">
    <label>Email<input name="email" type="email" required autocomplete="email"></label>
    <label>Palavra-passe (mínimo 6 caracteres)<input name="pw" type="password" minlength="6" required autocomplete="current-password"></label>
    <p class="muted" id="msg">${esc(msg)}</p>
    <div class="acoes"><button class="b p" value="in">Entrar</button><button class="b" value="up">Criar conta</button></div></form>`;
  $("#fl").onsubmit = async ev => {
    ev.preventDefault(); const f = Object.fromEntries(new FormData(ev.target)), novo = ev.submitter.value === "up";
    const cred = { email: f.email, password: f.pw };
    const { data, error } = novo ? await sb.auth.signUp(cred) : await sb.auth.signInWithPassword(cred);
    if (error) return $("#msg").textContent = error.message;
    if (!data.session) return $("#msg").textContent = "Conta criada. Confirma o email e depois entra.";
    location.reload();
  };
}
function vPerfil() {
  $("#sub").textContent = "Cria o teu perfil de motoboy";
  $("#app").innerHTML = `<form class="f card" id="fp">
    <label>Nome<input name="nome" required></label>
    <label>Telefone<input name="telefone" type="tel" required></label>
    <label>Mota (modelo ou matrícula)<input name="moto"></label>
    <div class="acoes"><button class="b p">Começar</button></div></form>`;
  $("#fp").onsubmit = async ev => {
    ev.preventDefault(); const f = Object.fromEntries(new FormData(ev.target));
    const { error } = await sb.from("motoboys").insert({ nome: f.nome.trim(), telefone: f.telefone.trim(), moto: f.moto.trim() });
    if (error) return falha(error); location.reload();
  };
}

function render() {
  $("#btnDisp").textContent = disp ? "Disponível" : "Indisponível";
  $("#btnDisp").setAttribute("aria-pressed", disp);
  $("#cntDisp").textContent = LIVRES.length || ""; $("#cntCurso").textContent = abertas().length || "";
  document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === aba));
  ({ disponiveis: vDisponiveis, curso: vCurso, ganhos: vGanhos })[aba]();
}

function vDisponiveis() {
  const el = $("#app");
  if (!disp) { el.innerHTML = `<div class="vazio">Estás indisponível. Liga o botão no topo para ver entregas.</div>`; return; }
  el.innerHTML = LIVRES.length ? LIVRES.map(e => `<div class="card nova"><div class="linha"><strong>Ganho: ${mt(e.ganho)}</strong>
    <span class="pill">${e.estado === "pronta" ? "Pronto para recolher" : "A preparar"}</span></div>
    <div class="muted">Recolher: ${esc(e.restaurante)}, ${esc(e.recolha)}${kmDe(e) != null ? ` · a ${kmDe(e).toFixed(1)} km de ti` : ""}</div>
    <div class="muted">Entregar em: ${esc(e.destino)}</div>
    <div class="muted">${navLink("Ver recolha no mapa", e.recolha_lat, e.recolha_lng)} ${navLink("Ver destino no mapa", e.destino_lat, e.destino_lng)}</div>
    <div class="acoes"><button class="b p" data-ac="${e.id}">Aceitar entrega</button></div></div>`).join("")
    : `<div class="vazio">Sem entregas por agora. Mantém-te disponível.</div>`;
  el.querySelectorAll("[data-ac]").forEach(b => b.onclick = async () => {
    if (await agir(sb.rpc("aceitar_entrega", { pedido: b.dataset.ac }))) { aba = "curso"; render(); }
    else alert("Outro motoboy já aceitou esta entrega.");
  });
}

function vCurso() {
  const el = $("#app"), l = abertas();
  el.innerHTML = l.length ? l.map(e => {
    const a = e.estado === "entrega";
    return `<div class="card"><div class="linha"><strong>${a ? "A caminho do cliente" : e.estado === "pronta" ? "Pronto: vai recolher" : "A aguardar o restaurante"}</strong><span class="preco">${mt(e.ganho)}</span></div>
    <div class="muted">Recolher: ${esc(e.restaurante)}, ${esc(e.recolha)}${e.recolha_tel ? ` · <a href="tel:${esc(e.recolha_tel)}">${esc(e.recolha_tel)}</a>` : ""}</div>
    <div class="muted">Entregar a ${esc(e.cliente)}: ${esc(e.destino)}${e.cliente_tel ? ` · <a href="tel:${esc(e.cliente_tel)}">${esc(e.cliente_tel)}</a>` : ""}</div>
    <div style="margin-top:8px"><strong>${e.pagamento === "Dinheiro na entrega" ? "Cobrar " + mt(e.total) + " ao cliente" : "Pagamento: " + esc(e.pagamento)}</strong></div>
    <div class="muted" style="margin-top:6px">${navLink("Navegar até à recolha", e.recolha_lat, e.recolha_lng)} ${navLink("Navegar até ao cliente", e.destino_lat, e.destino_lng)}</div>
    <div class="acoes">${a ? `<button class="b p" data-ent="${e.id}">Entreguei ao cliente</button>`
      : `<button class="b p" data-rec="${e.id}" ${e.estado === "pronta" ? "" : "disabled"}>Recolhi o pedido</button>`}</div></div>`;
  }).join("") : `<div class="vazio">Não tens entregas em curso.</div>`;
  el.querySelectorAll("[data-rec]").forEach(b => b.onclick = () => agir(sb.rpc("atualizar_entrega", { pedido: b.dataset.rec, novo: "entrega" })));
  el.querySelectorAll("[data-ent]").forEach(b => b.onclick = async () => { await agir(sb.rpc("atualizar_entrega", { pedido: b.dataset.ent, novo: "entregue" })); aba = "ganhos"; render(); });
}

function vGanhos() {
  const feitas = MINHAS.filter(e => e.estado === "entregue").sort((a, b) => new Date(b.criada) - new Date(a.criada));
  const soma = feitas.reduce((s, e) => s + e.ganho, 0);
  $("#app").innerHTML = `<div class="card"><div class="muted">Ganhos das entregas concluídas</div><div class="preco" style="font-size:1.8rem">${mt(soma)}</div><div class="muted">${feitas.length} entregas</div></div>` +
    feitas.map(e => `<div class="card"><div class="linha"><span>${esc(e.destino)}</span><strong>${mt(e.ganho)}</strong></div></div>`).join("") +
    `<div class="acoes"><button class="b" id="sair">Sair</button></div>`;
  $("#sair").onclick = async () => { await sb.auth.signOut(); location.reload(); };
}
init();
