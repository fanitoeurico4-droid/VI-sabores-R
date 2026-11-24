// Painel do administrador — aprova restaurantes e motoboys, vê a atividade, define taxas e comissões.
const sb = window.sb;
const $ = (s, r = document) => r.querySelector(s);
const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const mt = n => new Intl.NumberFormat("pt-MZ", { style: "currency", currency: "MZN", maximumFractionDigits: 0 }).format(n);
let USER = null, aba = "aprov", periodo = 0;
let D = { rest: [], mb: [], enc: [], res: [], cfg: { taxa_entrega: 80, comissao_restaurante: 10, comissao_motoboy: 20 } };
const nomeR = id => (D.rest.find(r => r.id === id) || {}).nome || "—";
const sub = e => e.itens.reduce((s, i) => s + i.preco * i.qtd, 0);
const pill = (ok, a, b) => `<span class="pill ${ok ? "ok" : ""}">${ok ? a : b}</span>`;
const sair = async () => { await sb.auth.signOut(); location.reload(); };

async function init() {
  if (!sb) { $("#app").innerHTML = `<div class="card"><strong>Falta configurar o Supabase.</strong> <span class="muted">Preenche o config.js.</span></div>`; return; }
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return vLogin();
  USER = session.user;
  const { data: adm } = await sb.from("admins").select("user_id").maybeSingle();
  if (!adm) {
    $("#sub").textContent = "Sem permissão";
    $("#app").innerHTML = `<div class="card"><strong>Esta conta ainda não é de administrador.</strong>
      <p class="muted">No SQL Editor do Supabase, corre:</p>
      <pre style="white-space:pre-wrap;overflow-x:auto">insert into admins (user_id) select id from auth.users where email = '${esc(USER.email)}';</pre>
      <div class="acoes"><button class="b" id="sair">Sair</button></div></div>`;
    $("#sair").onclick = sair; return;
  }
  $("#sub").textContent = USER.email; $("#tabs").hidden = false;
  document.querySelectorAll("#tabs button").forEach(b => b.onclick = () => { aba = b.dataset.tab; render(); });
  await carregar(); render();
  setInterval(async () => { if (aba !== "taxas" && !document.hidden) { await carregar(); render(); } }, 15000);
}
async function carregar() {
  const res = await Promise.all([
    sb.from("restaurantes").select("*").order("criado", { ascending: false }),
    sb.from("motoboys").select("*").order("criado", { ascending: false }),
    sb.from("encomendas").select("*").order("criada", { ascending: false }).limit(500),
    sb.from("reservas").select("*").order("data", { ascending: false }).limit(200),
    sb.from("config").select("*").maybeSingle()]);
  const erro = res.find(x => x.error); if (erro) return alert("Erro: " + erro.error.message);
  D = { rest: res[0].data, mb: res[1].data, enc: res[2].data, res: res[3].data, cfg: res[4].data || D.cfg };
}

function vLogin(msg = "") {
  $("#sub").textContent = "Entra com a conta de administrador";
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

function render() {
  document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === aba));
  $("#cntAprov").textContent = D.rest.filter(r => !r.aprovado).length + D.mb.filter(m => !m.aprovado).length || "";
  ({ aprov: vAprov, atividade: vAtividade, taxas: vTaxas, relatorios: vRel })[aba]();
  $("#app").insertAdjacentHTML("beforeend", `<div class="acoes"><button class="b" id="sair">Sair</button></div>`);
  $("#sair").onclick = sair;
}

function vAprov() {
  const lista = (tab, arr, linha) => arr.length ? [...arr].sort((a, b) => a.aprovado - b.aprovado).map(x => `
    <div class="card ${x.aprovado ? "" : "nova"}"><div class="linha"><div>${linha(x)}</div>${pill(x.aprovado, "Aprovado", "Pendente")}</div>
    <div class="acoes"><button class="b ${x.aprovado ? "d" : "p"}" data-t="${tab}" data-id="${x.id}" data-v="${!x.aprovado}">${x.aprovado ? "Suspender" : "Aprovar"}</button></div></div>`).join("")
    : `<div class="vazio">Ainda não há registos.</div>`;
  $("#app").innerHTML = `<div class="bar"><h2>Restaurantes</h2></div>` +
    lista("restaurantes", D.rest, r => `<strong>${esc(r.nome)}</strong><div class="muted">${esc([r.endereco, r.cidade].filter(Boolean).join(", "))}${r.telefone ? " · " + esc(r.telefone) : ""}</div>`) +
    `<div class="bar" style="margin-top:20px"><h2>Motoboys</h2></div>` +
    lista("motoboys", D.mb, m => `<strong>${esc(m.nome)}</strong><div class="muted">${esc(m.telefone)}${m.moto ? " · mota " + esc(m.moto) : ""}</div>`);
  document.querySelectorAll("[data-t]").forEach(b => b.onclick = async () => {
    const { error } = await sb.from(b.dataset.t).update({ aprovado: b.dataset.v === "true" }).eq("id", b.dataset.id);
    if (error) alert("Erro: " + error.message); await carregar(); render();
  });
}

function vAtividade() {
  const cor = { entregue: "ok", recusada: "no" };
  $("#app").innerHTML = `<div class="bar"><h2>Encomendas recentes</h2></div>` + (D.enc.slice(0, 40).map(e => `
    <div class="card"><div class="linha"><strong>${esc(nomeR(e.restaurante_id))}</strong><span class="pill ${cor[e.estado] || ""}">${esc(e.estado)}</span></div>
    <div class="muted">${esc(e.cliente)} · ${e.tipo === "entrega" ? "entrega" : "levantamento"} · ${esc(e.pagamento)}${e.motoboy_nome ? " · motoboy " + esc(e.motoboy_nome) : ""}</div>
    <div class="linha"><span class="muted">${new Date(e.criada).toLocaleString("pt-PT")}</span><span class="preco">${mt(sub(e) + e.taxa)}</span></div></div>`).join("") || `<div class="vazio">Sem encomendas.</div>`) +
    `<div class="bar" style="margin-top:20px"><h2>Reservas recentes</h2></div>` + (D.res.slice(0, 20).map(r => `
    <div class="card"><div class="linha"><strong>${esc(nomeR(r.restaurante_id))}</strong><span class="pill ${r.estado === "confirmada" ? "ok" : r.estado === "recusada" ? "no" : ""}">${esc(r.estado)}</span></div>
    <div class="muted">${esc(r.cliente)} · ${r.pessoas} pessoas · ${esc(r.data)} às ${esc(r.hora)}</div></div>`).join("") || `<div class="vazio">Sem reservas.</div>`);
}

function vTaxas() {
  const c = D.cfg;
  $("#app").innerHTML = `<div class="bar"><h2>Taxas e comissões</h2></div>
  <form class="f card" id="ft">
    <label>Taxa base da entrega (MT)<input name="base" type="number" min="0" required value="${c.taxa_base ?? 50}"></label>
    <label>Valor por quilómetro (MT)<input name="km" type="number" min="0" required value="${c.taxa_km ?? 15}"></label>
    <label>Taxa máxima (MT)<input name="max" type="number" min="0" required value="${c.taxa_max ?? 300}"></label>
    <label>Distância máxima de entrega (km)<input name="raio" type="number" min="1" required value="${c.raio_max_km ?? 10}"></label>
    <label>Taxa fixa, para restaurantes sem localização no mapa (MT)<input name="taxa" type="number" min="0" required value="${c.taxa_entrega}"></label>
    <label>Comissão sobre os pratos vendidos pelo restaurante (%)<input name="cr" type="number" min="0" max="100" required value="${c.comissao_restaurante}"></label>
    <label>Comissão sobre a taxa de entrega, descontada ao motoboy (%)<input name="cm" type="number" min="0" max="100" required value="${c.comissao_motoboy}"></label>
    <div class="acoes"><button class="b p">Guardar</button></div></form>`;
  $("#ft").onsubmit = async ev => {
    ev.preventDefault(); const f = Object.fromEntries(new FormData(ev.target));
    const { error } = await sb.from("config").update({ taxa_entrega: +f.taxa, taxa_base: +f.base, taxa_km: +f.km, taxa_max: +f.max, raio_max_km: +f.raio, comissao_restaurante: +f.cr, comissao_motoboy: +f.cm }).eq("id", 1);
    if (error) return alert("Erro: " + error.message); await carregar(); alert("Guardado.");
  };
}

function vRel() {
  const lim = periodo ? Date.now() - periodo * 864e5 : 0;
  const f = D.enc.filter(e => e.estado === "entregue" && new Date(e.criada).getTime() >= lim);
  const cr = D.cfg.comissao_restaurante / 100, cm = D.cfg.comissao_motoboy / 100;
  const vendas = f.reduce((s, e) => s + sub(e), 0), taxas = f.reduce((s, e) => s + e.taxa, 0);
  const comR = Math.round(vendas * cr), comM = Math.round(taxas * cm);
  const por = {}; f.forEach(e => { const p = por[e.restaurante_id] ||= { n: 0, v: 0 }; p.n++; p.v += sub(e); });
  $("#app").innerHTML = `<div class="bar"><h2>Relatório</h2>
    <select id="per" style="width:auto"><option value="0">Tudo</option><option value="1">Últimas 24 h</option><option value="7">7 dias</option><option value="30">30 dias</option></select></div>
  <div class="card"><div class="muted">Receita da plataforma</div><div class="preco" style="font-size:1.8rem">${mt(comR + comM)}</div>
    <div class="muted">${mt(comR)} de restaurantes + ${mt(comM)} de motoboys</div></div>
  <div class="card"><div class="linha"><span>Encomendas entregues</span><strong>${f.length}</strong></div>
    <div class="linha"><span>Vendas em pratos</span><strong>${mt(vendas)}</strong></div>
    <div class="linha"><span>Taxas de entrega cobradas</span><strong>${mt(taxas)}</strong></div></div>
  <h3>Por restaurante</h3>` + (Object.entries(por).map(([id, p]) => `<div class="card"><div class="linha"><strong>${esc(nomeR(id))}</strong><span class="preco">${mt(p.v)}</span></div>
    <div class="muted">${p.n} encomendas · comissão ${mt(Math.round(p.v * cr))}</div></div>`).join("") || `<div class="vazio">Sem encomendas entregues neste período.</div>`) +
    `<p class="muted">Calculado sobre as últimas 500 encomendas, com as comissões atuais.</p>`;
  $("#per").value = periodo; $("#per").onchange = e => { periodo = +e.target.value; render(); };
}
init();
