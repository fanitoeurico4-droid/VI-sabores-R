// Área do cliente — lê o menu do restaurante no Supabase e envia encomendas/reservas.
// Abre com o link do restaurante: cliente.html?r=CODIGO
const sb = window.sb, RID = new URLSearchParams(location.search).get("r");
const KEYC = "easyfood_cliente_v2", UUID = /^[0-9a-f-]{36}$/i;
if (!RID) location.replace("restaurantes.html");
const $ = (s, r = document) => r.querySelector(s);
const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const mt = n => new Intl.NumberFormat("pt-MZ", { style: "currency", currency: "MZN", maximumFractionDigits: 0 }).format(n);
let TAXA_ENTREGA = 80; // taxa fixa (só usada se o restaurante não tiver localização); o administrador define o valor real
let DEST = null; // local de entrega marcado no mapa: { lat, lng, taxa, fora }
const comMapa = () => R.perfil.lat != null && R.perfil.lng != null;
const taxaAtual = () => comMapa() ? (DEST && DEST.taxa != null ? DEST.taxa : null) : TAXA_ENTREGA;
async function escolherDestino(lat, lng) {
  DEST = { lat: +lat.toFixed(6), lng: +lng.toFixed(6), taxa: null, fora: false };
  const { data, error } = await sb.rpc("calcular_taxa", { rid: RID, p_lat: DEST.lat, p_lng: DEST.lng }); // a taxa é sempre calculada na base de dados
  DEST.taxa = error ? null : data; DEST.fora = !error && data == null;
}

let C; try { C = { nome: "", telefone: "", endereco: "", meus: [], reservas: [], ...JSON.parse(localStorage.getItem(KEYC) || "{}") }; } catch { C = { nome: "", telefone: "", endereco: "", meus: [], reservas: [] }; }
C.meus = C.meus.filter(i => UUID.test(i)); C.reservas = C.reservas.filter(i => UUID.test(i));
const gravarC = () => localStorage.setItem(KEYC, JSON.stringify(C));

let R = { ok: false, aberto: true, perfil: {}, menu: [], encomendas: [], reservas: [] };
let aba = "cardapio", carrinho = {}, checkout = false;
document.querySelectorAll(".tabs button").forEach(b => b.onclick = async () => { aba = b.dataset.tab; checkout = false; await carregarMeus(); render(); });

async function carregarR() {
  if (!sb || !RID || !UUID.test(RID)) return;
  const { data: r } = await sb.from("restaurantes").select("*").eq("id", RID).maybeSingle();
  const { data: cfg } = await sb.from("config").select("taxa_entrega").maybeSingle(); if (cfg) TAXA_ENTREGA = cfg.taxa_entrega;
  if (!r) return;
  const { aberto, id, dono, criado, ...perfil } = r;
  const { data: m } = await sb.from("pratos").select("*").eq("restaurante_id", RID).eq("disponivel", true).order("nome");
  R = { ...R, ok: true, aberto, perfil, menu: m || [] };
  await carregarMeus();
}
async function carregarMeus() {
  if (!sb) return;
  const [a, b] = await Promise.all([
    C.meus.length ? sb.rpc("meus_pedidos", { ids: C.meus }) : { data: [] },
    C.reservas.length ? sb.rpc("minhas_reservas", { ids: C.reservas }) : { data: [] }]);
  R.encomendas = a.data || []; R.reservas = b.data || [];
}
function badge() {
  $("#cntPed").textContent = R.encomendas.filter(e => !["entregue", "recusada"].includes(e.estado)).length || "";
}
setInterval(async () => { if (document.hidden || !R.ok) return; await carregarMeus(); badge(); if (aba === "pedidos") vPedidos(); }, 8000);

function render() {
  document.querySelectorAll(".tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === aba));
  ["cardapio", "reservar", "pedidos"].forEach(id => $("#" + id).hidden = id !== aba);
  const p = R.perfil;
  $("#nomeTopo").textContent = p.nome || "Restaurante";
  $("#infoTopo").textContent = R.ok ? (R.aberto ? [p.endereco, p.cidade].filter(Boolean).join(", ") + (p.abre ? ` · ${p.abre}–${p.fecha}` : "") : "Fechado de momento") : "";
  badge();
  if (!R.ok) { $("#" + aba).innerHTML = `<div class="vazio">${!sb ? "Falta configurar o Supabase (ficheiro config.js)." : "Não encontrei este restaurante. Pede ao restaurante o link certo."}</div>`; $("#carrinhoBar").hidden = true; return; }
  ({ cardapio: vCardapio, reservar: vReservar, pedidos: vPedidos })[aba]();
  const n = Object.values(carrinho).reduce((s, q) => s + q, 0), bar = $("#carrinhoBar");
  bar.hidden = !(aba === "cardapio" && n && !checkout);
  if (!bar.hidden) { bar.innerHTML = `<span>Ver pedido (${n})</span><span>${mt(subtotal())}</span>`; bar.onclick = () => { checkout = true; render(); }; }
}
const preco = m => m.promo || m.preco;
const subtotal = () => Object.entries(carrinho).reduce((s, [id, q]) => { const m = R.menu.find(x => x.id === id); return s + (m ? preco(m) * q : 0); }, 0);

// ---------- Menu e pedido ----------
function vCardapio() {
  const el = $("#cardapio");
  if (checkout) return vCheckout(el);
  if (!R.menu.length) { el.innerHTML = `<div class="vazio">Este restaurante ainda não publicou o menu. Volta mais tarde.</div>`; return; }
  const cats = [...new Set(R.menu.map(m => m.categoria || "Outros"))];
  el.innerHTML = (R.aberto ? "" : `<div class="card"><strong>Restaurante fechado.</strong> <span class="muted">Podes ver o menu, mas não fazer pedidos agora.</span></div>`) +
    cats.map(c => `<h3>${esc(c)}</h3>` + R.menu.filter(m => (m.categoria || "Outros") === c).map(m => `
    <div class="card"><div class="linha"><div><strong>${esc(m.nome)}</strong><div class="muted">${esc(m.descricao)}</div></div>
    <div class="preco">${m.promo ? `<span class="antes">${mt(m.preco)}</span>${mt(m.promo)}` : mt(m.preco)}</div></div>
    <div class="acoes qtd">${carrinho[m.id] ? `<button data-menos="${m.id}" aria-label="Menos">−</button><strong>${carrinho[m.id]}</strong>` : ""}
    <button data-mais="${m.id}" aria-label="Mais" ${R.aberto ? "" : "disabled"}>+</button></div></div>`).join("")).join("") + `<div style="height:60px"></div>`;
  el.querySelectorAll("[data-mais]").forEach(b => b.onclick = () => { carrinho[b.dataset.mais] = (carrinho[b.dataset.mais] || 0) + 1; render(); });
  el.querySelectorAll("[data-menos]").forEach(b => b.onclick = () => { const id = b.dataset.menos; if (--carrinho[id] <= 0) delete carrinho[id]; render(); });
}
function vCheckout(el) {
  const itens = Object.entries(carrinho).map(([id, q]) => ({ m: R.menu.find(x => x.id === id), q })).filter(x => x.m);
  el.innerHTML = `<div class="bar"><h2>O teu pedido</h2><button class="b" id="voltar">Voltar ao menu</button></div>
  <div class="card">${itens.map(({ m, q }) => `<div class="linha"><span>${q}× ${esc(m.nome)}</span><span>${mt(preco(m) * q)}</span></div>`).join("")}</div>
  <form class="f card" id="fc">
    <label>O teu nome<input name="cliente" required value="${esc(C.nome)}"></label>
    <label>Telefone<input name="telefone" type="tel" required value="${esc(C.telefone)}"></label>
    <label>Como queres receber?<select name="tipo" id="tipo"><option value="entrega">Entrega ao domicílio${comMapa() ? " (taxa pela distância)" : " (+" + mt(TAXA_ENTREGA) + ")"}</option><option value="levantamento">Levantar no restaurante</option></select></label>
    <label id="lEnd">Endereço de entrega<input name="endereco" value="${esc(C.endereco)}" placeholder="Rua, bairro, ponto de referência"></label>
    <div id="boxMapa" hidden><div class="acoes" style="margin:0 0 6px"><button type="button" class="b" id="gps">Usar a minha localização</button></div>
    <div id="mapaEntrega" style="height:220px;border-radius:8px"></div><div class="muted" id="infoTaxa" style="margin-top:6px"></div></div>
    <label>Pagamento<select name="pagamento" id="pag"><option>Dinheiro na entrega</option><option>M-Pesa</option><option disabled>e-Mola (brevemente)</option></select></label>
    <label id="lMp">Número M-Pesa (84 ou 85)<input name="mpesa" type="tel" value="${esc(C.mpesa || C.telefone)}" placeholder="84 123 4567"></label>
    <div class="linha"><strong>Total</strong><strong id="tot" class="preco"></strong></div>
    <div class="acoes"><button class="b p">Enviar pedido</button></div>
  </form>`;
  const entrega = () => $("#tipo").value === "entrega";
  let mapa, pino;
  const poe = async (lat, lng) => {
    pino ? pino.setLatLng([lat, lng]) : (pino = L.marker([lat, lng], { draggable: true }).addTo(mapa).on("dragend", e => { const q = e.target.getLatLng(); poe(q.lat, q.lng); }));
    await escolherDestino(lat, lng); total();
  };
  const abrirMapa = () => {
    if (!mapa) {
      mapa = novoMapa("mapaEntrega", [R.perfil.lat, R.perfil.lng], 14);
      L.circleMarker([R.perfil.lat, R.perfil.lng], { radius: 8, color: "#0E3B43", fillColor: "#0E3B43", fillOpacity: .9 }).addTo(mapa).bindTooltip("Restaurante");
      mapa.on("click", e => poe(e.latlng.lat, e.latlng.lng)); if (DEST) poe(DEST.lat, DEST.lng);
    }
    setTimeout(() => mapa.invalidateSize(), 50);
  };
  const total = () => { $("#lMp").hidden = $("#pag").value !== "M-Pesa"; $("#lEnd").hidden = !entrega(); const usaMapa = entrega() && comMapa(); $("#boxMapa").hidden = !usaMapa; if (usaMapa) abrirMapa();
    $("#tot").textContent = mt(subtotal() + (entrega() ? (taxaAtual() ?? 0) : 0));
    $("#infoTaxa").textContent = !usaMapa ? "" : DEST && DEST.fora ? "Este local está fora da zona de entrega." : DEST && DEST.taxa != null
      ? `Taxa de entrega: ${mt(DEST.taxa)} (a ${(kmEntre(R.perfil.lat, R.perfil.lng, DEST.lat, DEST.lng) * 1.3).toFixed(1)} km por estrada, aprox.)` : "Toca no mapa para marcar onde queres receber."; };
  $("#tipo").onchange = total; $("#pag").onchange = total; total();
  $("#gps").onclick = async () => { const g = await minhaPosicao(); if (!g) return alert("Não foi possível obter a localização. Toca no mapa para marcar."); mapa.setView([g.lat, g.lng], 17); poe(g.lat, g.lng); };
  $("#voltar").onclick = () => { checkout = false; render(); };
  $("#fc").onsubmit = async ev => {
    ev.preventDefault(); const f = Object.fromEntries(new FormData(ev.target));
    if (f.tipo === "entrega" && !f.endereco.trim()) return alert("Indica o endereço de entrega.");
    if (f.tipo === "entrega" && taxaAtual() == null) return alert(DEST && DEST.fora ? "Este local está fora da zona de entrega." : "Marca no mapa o local de entrega.");
    if (f.pagamento === "M-Pesa" && !/^(258)?8[45]\d{7}$/.test((f.mpesa || "").replace(/\D/g, ""))) return alert("Indica um número M-Pesa válido (84 ou 85).");
    const id = crypto.randomUUID();
    const { error } = await sb.from("encomendas").insert({
      id, restaurante_id: RID, cliente: f.cliente.trim(), telefone: f.telefone.trim(), tipo: f.tipo,
      endereco: f.tipo === "entrega" ? f.endereco.trim() : "", pagamento: f.pagamento,
      itens: itens.map(({ m, q }) => ({ nome: m.nome, preco: preco(m), qtd: q })), taxa: f.tipo === "entrega" ? taxaAtual() : 0,
      destino_lat: f.tipo === "entrega" && DEST ? DEST.lat : null, destino_lng: f.tipo === "entrega" && DEST ? DEST.lng : null });
    if (error) return alert("Não foi possível enviar o pedido. O restaurante pode ter fechado. (" + error.message + ")");
    Object.assign(C, { nome: f.cliente.trim(), telefone: f.telefone.trim(), endereco: f.endereco.trim() }); C.meus.push(id); gravarC();
    await carregarMeus(); carrinho = {}; checkout = false; aba = "pedidos"; render();
    if (f.pagamento === "M-Pesa") { C.mpesa = f.mpesa; gravarC(); pagar(id, f.mpesa); }
  };
}

// ---------- Reservas ----------
function vReservar() {
  const hoje = new Date().toISOString().slice(0, 10);
  const minhas = [...R.reservas].reverse();
  $("#reservar").innerHTML = `<div class="bar"><h2>Reservar mesa</h2></div>
  <form class="f card" id="fr">
    <label>O teu nome<input name="cliente" required value="${esc(C.nome)}"></label>
    <label>Telefone<input name="telefone" type="tel" required value="${esc(C.telefone)}"></label>
    <div class="dois"><label>Data<input name="data" type="date" min="${hoje}" required></label>
    <label>Hora<input name="hora" type="time" required value="19:30"></label></div>
    <label>Número de pessoas<input name="pessoas" type="number" min="1" max="20" value="2" required></label>
    <div class="acoes"><button class="b p">Pedir reserva</button></div>
  </form>
  ${minhas.length ? `<h3>As minhas reservas</h3>` + minhas.map(r => `<div class="card"><div class="linha"><strong>${esc(r.data)} às ${esc(r.hora)} · ${r.pessoas} pessoas</strong>
    <span class="pill ${r.estado === "confirmada" ? "ok" : r.estado === "recusada" ? "no" : ""}">${r.estado === "pendente" ? "À espera de resposta" : r.estado}</span></div></div>`).join("") : ""}`;
  $("#fr").onsubmit = async ev => {
    ev.preventDefault(); const f = Object.fromEntries(new FormData(ev.target)), id = crypto.randomUUID();
    const { error } = await sb.from("reservas").insert({ id, restaurante_id: RID, cliente: f.cliente.trim(), telefone: f.telefone.trim(), pessoas: +f.pessoas, data: f.data, hora: f.hora });
    if (error) return alert("Não foi possível enviar a reserva: " + error.message);
    Object.assign(C, { nome: f.cliente.trim(), telefone: f.telefone.trim() }); C.reservas.push(id); gravarC();
    await carregarMeus(); render();
  };
}

// ---------- Acompanhar pedidos ----------
const ETAPAS = ["nova", "aceite", "preparar", "pronta", "entrega", "entregue"];
const TXT = { nova: "À espera do restaurante", aceite: "Pedido aceite", preparar: "A preparar", pronta: "Pronto", entrega: "A caminho", entregue: "Entregue", recusada: "Recusado pelo restaurante" };
function vPedidos() {
  const lista = [...R.encomendas].sort((a, b) => new Date(b.criada) - new Date(a.criada));
  $("#pedidos").innerHTML = `<div class="bar"><h2>Os meus pedidos</h2></div>` + (lista.length ? lista.map(e => {
    const i = ETAPAS.indexOf(e.estado), total = e.itens.reduce((s, x) => s + x.preco * x.qtd, 0) + e.taxa;
    return `<div class="card"><div class="linha"><strong>${TXT[e.estado]}</strong><span class="preco">${mt(total)}</span></div>
    <div class="passos ${e.estado === "recusada" ? "no" : ""}">${ETAPAS.map((_, k) => `<i class="${e.estado === "recusada" || k <= i ? "f" : ""}"></i>`).join("")}</div>
    <ul>${e.itens.map(x => `<li>${x.qtd}× ${esc(x.nome)}</li>`).join("")}</ul>
    <div class="muted">${e.tipo === "entrega" ? "Entrega: " + esc(e.endereco) : "Levantamento no restaurante"}${e.tempo ? " · Preparação: " + e.tempo + " min" : ""}${e.motoboy_nome ? ` · Motoboy: ${esc(e.motoboy_nome)}` + (e.motoboy_tel ? ` (<a href="tel:${esc(e.motoboy_tel)}">${esc(e.motoboy_tel)}</a>)` : "") : ""}</div>
    ${pagBloco(e)}${e.estado === "entrega" ? `<div class="acoes"><button class="b p" data-rec="${e.id}">Já recebi</button></div>` : ""}</div>`;
  }).join("") : `<div class="vazio">Ainda não fizeste pedidos. Escolhe pratos no menu.</div>`);
  document.querySelectorAll("[data-rec]").forEach(b => b.onclick = async () => { await sb.rpc("confirmar_recebido", { pedido: b.dataset.rec }); await carregarMeus(); render(); });
  document.querySelectorAll("[data-pagar]").forEach(b => b.onclick = () => { const n = prompt("Número M-Pesa (84 ou 85):", C.mpesa || C.telefone); if (n) { C.mpesa = n; gravarC(); pagar(b.dataset.pagar, n); } });
  document.querySelectorAll("[data-ver]").forEach(b => b.onclick = () => pagar(b.dataset.ver, "", "estado"));
}
carregarR().then(render);

// ---------- Pagamento M-Pesa (a cobrança é feita pela função "pagar" no servidor) ----------
const A_PAGAR = {};
async function pagar(id, tel, acao) {
  A_PAGAR[id] = true; render();
  const { data, error } = await sb.functions.invoke("pagar", { body: { pedido: id, telefone: tel, acao } });
  delete A_PAGAR[id];
  const msg = (data && data.erro) || (error && "Não foi possível contactar o serviço de pagamentos.");
  if (msg) alert(msg);
  await carregarMeus(); render();
}
function pagBloco(e) {
  if (e.pagamento !== "M-Pesa" || e.estado === "recusada") return "";
  if (e.pag_estado === "pago") return `<div class="acoes"><span class="pill ok">Pago por M-Pesa</span></div>`;
  if (A_PAGAR[e.id] || e.pag_estado === "a_processar") return `<div class="muted" style="margin-top:8px">A aguardar a confirmação no teu telemóvel. Introduz o PIN do M-Pesa quando aparecer o pedido.</div><div class="acoes"><button class="b" data-ver="${e.id}">Verificar pagamento</button></div>`;
  return `<div class="muted" style="margin-top:8px">${e.pag_estado === "falhou" ? "O pagamento não foi concluído." : "Pagamento por fazer."} O restaurante só começa depois de pagares.</div><div class="acoes"><button class="b p" data-pagar="${e.id}">Pagar com M-Pesa</button></div>`;
}
