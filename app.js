// Painel do restaurante — ligado ao Supabase (login, base de dados e avisos em tempo real).
const sb = window.sb;
const $ = (s, r = document) => r.querySelector(s);
const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const mt = n => new Intl.NumberFormat("pt-MZ", { style: "currency", currency: "MZN", maximumFractionDigits: 0 }).format(n);

let S = { aberto: true, perfil: {}, menu: [], encomendas: [], reservas: [] }, RID = null, aba = "encomendas", editar = null, USER = null;

async function init() {
  if (!sb) { $("#perfil").hidden = false; $("#perfil").innerHTML = `<div class="card"><strong>Falta configurar o Supabase.</strong><p class="muted">Abre o ficheiro config.js e cola o Project URL e a chave anon. Os passos estão no README.</p></div>`; return; }
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return vLogin();
  USER = session.user;
  await carregar(true);
  document.querySelector(".tabs").hidden = false; $("#btnAberto").hidden = false;
  document.querySelectorAll(".tabs button").forEach(b => b.onclick = () => { aba = b.dataset.tab; editar = null; render(); });
  $("#btnAberto").onclick = () => run(sb.from("restaurantes").update({ aberto: !S.aberto }).eq("id", RID));
  const canal = sb.channel("painel");
  ["encomendas", "reservas"].forEach(t => canal.on("postgres_changes", { event: "*", schema: "public", table: t, filter: `restaurante_id=eq.${RID}` }, refrescar));
  canal.subscribe();
  render();
}
async function carregar(criar) {
  let { data: r } = await sb.from("restaurantes").select("*").eq("dono", USER.id).maybeSingle();
  if (!r && criar) ({ data: r } = await sb.from("restaurantes").insert({}).select().single());
  if (!r) return;
  RID = r.id;
  const { aberto, id, dono, criado, aprovado, ...perfil } = r; S.aberto = aberto; S.aprovado = aprovado; S.perfil = perfil;
  const [p, e, rs] = await Promise.all([
    sb.from("pratos").select("*").eq("restaurante_id", RID).order("nome"),
    sb.from("encomendas").select("*").eq("restaurante_id", RID),
    sb.from("reservas").select("*").eq("restaurante_id", RID)]);
  S.menu = p.data || [];
  S.encomendas = (e.data || []).map(x => ({ ...x, criada: new Date(x.criada).getTime() }));
  S.reservas = rs.data || [];
}
async function refrescar() { if (editar !== null) return; await carregar(); render(); }
async function run(p) { const { error } = await p; if (error) alert("Erro: " + error.message); await carregar(); render(); }

function vLogin(msg = "") {
  $("#estadoTopo").textContent = "Entra para gerir o teu restaurante";
  $("#perfil").hidden = false;
  $("#perfil").innerHTML = `<form class="f card" id="fl">
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
  document.querySelectorAll(".tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === aba));
  ["encomendas", "reservas", "menu", "perfil"].forEach(id => $("#" + id).hidden = id !== aba);
  $("#nomeTopo").textContent = S.perfil.nome || "O teu restaurante";
  $("#estadoTopo").textContent = S.aprovado === false ? "À espera de aprovação — ainda não aparece aos clientes" : S.aberto ? "A receber encomendas" : "Fechado — não recebe encomendas";
  $("#btnAberto").textContent = S.aberto ? "Aberto" : "Fechado";
  $("#btnAberto").setAttribute("aria-pressed", S.aberto);
  $("#cntEnc").textContent = S.encomendas.filter(e => e.estado === "nova").length || "";
  $("#cntRes").textContent = S.reservas.filter(r => r.estado === "pendente").length || "";
  ({ encomendas: vEncomendas, reservas: vReservas, menu: vMenu, perfil: vPerfil })[aba]();
}

// ---------- Encomendas ----------
const FLUXO = {
  nova: ["Nova", "aceite"], aceite: ["Aceite", "preparar"], preparar: ["A preparar", "pronta"],
  pronta: ["Pronta", "entrega"], entrega: ["Com o motoboy", "entregue"], entregue: ["Entregue", null], recusada: ["Recusada", null]
};
const TXT_BTN = { aceite: "Aceitar", preparar: "Começar a preparar", pronta: "Marcar como pronta", entrega: "Entregue ao motoboy", entregue: "Confirmar entrega" };

function vEncomendas() {
  const el = $("#encomendas");
  const lista = [...S.encomendas].sort((a, b) => b.criada - a.criada);
  el.innerHTML = `<div class="bar"><h2>Encomendas</h2></div>` +
    (lista.length ? lista.map(e => {
      const [nome, prox] = FLUXO[e.estado];
      const total = e.itens.reduce((s, i) => s + i.preco * i.qtd, 0) + e.taxa;
      const cls = e.estado === "recusada" ? "no" : e.estado === "entregue" ? "ok" : "";
      return `<div class="card ${e.estado === "nova" ? "nova" : ""}">
        <div class="linha"><strong>${esc(e.cliente)}</strong><span class="pill ${cls}">${nome}</span></div>
        <div class="muted">${e.tipo === "entrega" ? "Entrega: " + esc(e.endereco) : "Levantamento no restaurante"} · ${esc(e.pagamento)}${e.telefone ? " · " + esc(e.telefone) : ""}${e.motoboy_nome ? " · Motoboy: " + esc(e.motoboy_nome) : ""}${e.pagamento === "M-Pesa" ? (e.pag_estado === "pago" ? " · Pago ✓" : " · À espera do pagamento") : ""}</div>
        <ul>${e.itens.map(i => `<li>${i.qtd}× ${esc(i.nome)}</li>`).join("")}</ul>
        <div class="linha"><span class="muted">${e.tempo ? "Preparação: " + e.tempo + " min" : "Taxa de entrega: " + mt(e.taxa)}</span><span class="preco">${mt(total)}</span></div>
        <div class="acoes">
          ${prox ? `<button class="b p" data-av="${e.id}" ${e.estado === "nova" && e.pagamento === "M-Pesa" && e.pag_estado !== "pago" ? "disabled" : ""}>${TXT_BTN[prox]}</button>` : ""}
          ${e.estado === "nova" ? `<button class="b d" data-rec="${e.id}">Recusar</button>` : ""}
        </div></div>`;
    }).join("") : `<div class="vazio">Ainda não há encomendas. Quando um cliente pedir, aparece aqui.</div>`);
  el.querySelectorAll("[data-av]").forEach(b => b.onclick = () => {
    const e = S.encomendas.find(x => x.id === b.dataset.av), upd = { estado: FLUXO[e.estado][1] };
    if (e.estado === "nova") {
      const t = prompt("Quantos minutos para preparar?", "25");
      if (t === null) return; upd.tempo = Math.max(1, parseInt(t) || 25);
    }
    run(sb.from("encomendas").update(upd).eq("id", e.id));
  });
  el.querySelectorAll("[data-rec]").forEach(b => b.onclick = () => run(sb.from("encomendas").update({ estado: "recusada" }).eq("id", b.dataset.rec)));
}

// ---------- Reservas ----------
function vReservas() {
  const el = $("#reservas");
  const lista = [...S.reservas].sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora));
  el.innerHTML = `<div class="bar"><h2>Reservas de mesa</h2></div>
  <p class="muted">Mesas disponíveis por horário: ${S.perfil.mesas}. Muda em Perfil.</p>` +
    (lista.length ? lista.map(r => {
      const ocupadas = S.reservas.filter(x => x.estado === "confirmada" && x.data === r.data && x.hora === r.hora).length;
      const cheio = r.estado === "pendente" && ocupadas >= S.perfil.mesas;
      return `<div class="card ${r.estado === "pendente" ? "nova" : ""}">
        <div class="linha"><strong>${esc(r.cliente)} · ${r.pessoas} pessoas</strong><span class="pill ${r.estado === "confirmada" ? "ok" : r.estado === "recusada" ? "no" : ""}">${r.estado}</span></div>
        <div class="muted">${esc(r.data)} às ${esc(r.hora)} · ${esc(r.telefone)}</div>
        ${cheio ? `<div class="muted" style="color:var(--erro)">Sem mesas livres neste horário.</div>` : ""}
        ${r.estado === "pendente" ? `<div class="acoes">
          <button class="b p" data-ok="${r.id}" ${cheio ? "disabled" : ""}>Confirmar</button>
          <button class="b d" data-no="${r.id}">Recusar</button></div>` : ""}</div>`;
    }).join("") : `<div class="vazio">Ainda não há reservas.</div>`);
  el.querySelectorAll("[data-ok]").forEach(b => b.onclick = () => run(sb.from("reservas").update({ estado: "confirmada" }).eq("id", b.dataset.ok)));
  el.querySelectorAll("[data-no]").forEach(b => b.onclick = () => run(sb.from("reservas").update({ estado: "recusada" }).eq("id", b.dataset.no)));
}

// ---------- Menu ----------
function vMenu() {
  const el = $("#menu");
  if (editar !== null) return formPrato(el);
  const cats = [...new Set(S.menu.map(m => m.categoria || "Outros"))];
  el.innerHTML = `<div class="bar"><h2>Menu</h2><button class="b p" id="novoPrato">Adicionar prato</button></div>` +
    (cats.length ? cats.map(c => `<h3>${esc(c)}</h3>` + S.menu.filter(m => (m.categoria || "Outros") === c).map(m => `
      <div class="card"><div class="linha"><div><strong>${esc(m.nome)}</strong><div class="muted">${esc(m.descricao)}</div></div>
      <div class="preco">${m.promo ? `<span class="antes">${mt(m.preco)}</span>${mt(m.promo)}` : mt(m.preco)}</div></div>
      <div class="acoes"><span class="pill ${m.disponivel ? "ok" : "no"}">${m.disponivel ? "Disponível" : "Esgotado"}</span>
      <button class="b" data-disp="${m.id}">${m.disponivel ? "Marcar esgotado" : "Marcar disponível"}</button>
      <button class="b" data-ed="${m.id}">Editar</button><button class="b d" data-del="${m.id}">Apagar</button></div></div>`).join("")).join("")
      : `<div class="vazio">O menu está vazio. Adiciona o primeiro prato para os clientes o verem.</div>`);
  $("#novoPrato").onclick = () => { editar = ""; render(); };
  el.querySelectorAll("[data-ed]").forEach(b => b.onclick = () => { editar = b.dataset.ed; render(); });
  el.querySelectorAll("[data-del]").forEach(b => b.onclick = () => { if (confirm("Apagar este prato?")) run(sb.from("pratos").delete().eq("id", b.dataset.del)); });
  el.querySelectorAll("[data-disp]").forEach(b => b.onclick = () => { const m = S.menu.find(x => x.id === b.dataset.disp); run(sb.from("pratos").update({ disponivel: !m.disponivel }).eq("id", m.id)); });
}
function formPrato(el) {
  const m = S.menu.find(x => x.id === editar) || { nome: "", descricao: "", preco: "", promo: "", categoria: "Pratos" };
  el.innerHTML = `<div class="bar"><h2>${editar ? "Editar prato" : "Novo prato"}</h2></div>
  <form class="f card" id="fp">
    <label>Nome<input name="nome" required value="${esc(m.nome)}"></label>
    <label>Descrição<textarea name="descricao" rows="2">${esc(m.descricao)}</textarea></label>
    <div class="dois"><label>Categoria<input name="categoria" list="cats" value="${esc(m.categoria)}"></label>
    <datalist id="cats"><option>Pratos</option><option>Bebidas</option><option>Sobremesas</option><option>Entradas</option></datalist>
    <label>Preço (MT)<input name="preco" type="number" min="0" required value="${esc(m.preco)}"></label></div>
    <label>Preço promocional (MT) — deixa em branco se não houver<input name="promo" type="number" min="0" value="${esc(m.promo || "")}"></label>
    <div class="acoes"><button class="b p">Guardar prato</button><button type="button" class="b" id="canc">Cancelar</button></div>
  </form>`;
  $("#canc").onclick = () => { editar = null; render(); };
  $("#fp").onsubmit = ev => {
    ev.preventDefault(); const f = Object.fromEntries(new FormData(ev.target));
    const d = { nome: f.nome.trim(), descricao: f.descricao.trim(), categoria: f.categoria.trim() || "Outros", preco: +f.preco, promo: f.promo ? +f.promo : 0 };
    const id = editar; editar = null;
    run(id ? sb.from("pratos").update(d).eq("id", id) : sb.from("pratos").insert({ ...d, restaurante_id: RID }));
  };
}

// ---------- Perfil ----------
function vPerfil() {
  const p = S.perfil, link = new URL("cliente.html?r=" + RID, location.href).href;
  $("#perfil").innerHTML = `<div class="bar"><h2>Perfil do restaurante</h2></div>
  <div class="card"><strong>Link para os teus clientes</strong><div class="muted" style="word-break:break-all;margin:4px 0 8px">${esc(link)}</div>
    <button class="b" id="copiar">Copiar link</button></div>
  <div class="card"><strong>Localização no mapa</strong>
    <div class="muted" style="margin:4px 0 8px">Os clientes encontram-te por proximidade e a taxa de entrega é calculada a partir daqui. Toca no mapa ou arrasta o pino.</div>
    <div id="mapaRest" style="height:240px;border-radius:8px"></div>
    <div class="acoes"><button type="button" class="b" id="gpsRest">Usar a minha localização</button><button type="button" class="b p" id="guardarLoc">Guardar localização</button></div></div>
  <form class="f card" id="fpf">
    ${p.foto ? `<img class="foto" src="${p.foto}" alt="Fotografia do restaurante">` : ""}
    <label>Fotografia<input type="file" id="foto" accept="image/*"></label>
    <label>Nome do restaurante<input name="nome" required value="${esc(p.nome)}"></label>
    <div class="dois"><label>Endereço<input name="endereco" value="${esc(p.endereco)}"></label>
    <label>Cidade<input name="cidade" value="${esc(p.cidade)}"></label></div>
    <div class="dois"><label>Telefone<input name="telefone" type="tel" value="${esc(p.telefone)}"></label>
    <label>Email<input name="email" type="email" value="${esc(p.email)}"></label></div>
    <div class="dois"><label>Abre às<input name="abre" type="time" value="${esc(p.abre)}"></label>
    <label>Fecha às<input name="fecha" type="time" value="${esc(p.fecha)}"></label></div>
    <div class="dois"><label>Dias de funcionamento<input name="dias" value="${esc(p.dias)}"></label>
    <label>Mesas por horário<input name="mesas" type="number" min="1" value="${esc(p.mesas)}"></label></div>
    <div class="acoes"><button class="b p">Guardar perfil</button><button type="button" class="b" id="sair">Sair da conta</button></div>
  </form>`;
  $("#copiar").onclick = () => navigator.clipboard?.writeText(link).then(() => $("#copiar").textContent = "Link copiado");
  {
    const tem = p.lat != null, ini = tem ? [p.lat, p.lng] : MAPA.centro; let pos = tem ? { lat: p.lat, lng: p.lng } : null;
    const m = novoMapa("mapaRest", ini, tem ? 16 : 12), pino = L.marker(ini, { draggable: true, opacity: tem ? 1 : .5 }).addTo(m);
    const mover = (lat, lng) => { pos = { lat, lng }; pino.setLatLng([lat, lng]).setOpacity(1); };
    pino.on("dragend", e => { const q = e.target.getLatLng(); mover(q.lat, q.lng); });
    m.on("click", e => mover(e.latlng.lat, e.latlng.lng));
    $("#gpsRest").onclick = async () => { const g = await minhaPosicao(); if (!g) return alert("Não foi possível obter a localização. Toca no mapa para marcar."); m.setView([g.lat, g.lng], 17); mover(g.lat, g.lng); };
    $("#guardarLoc").onclick = () => pos ? run(sb.from("restaurantes").update({ lat: +pos.lat.toFixed(6), lng: +pos.lng.toFixed(6) }).eq("id", RID)) : alert("Toca no mapa para marcar onde fica o restaurante.");
  }
  $("#sair").onclick = async () => { await sb.auth.signOut(); location.reload(); };
  $("#foto").onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const img = new Image(); img.onload = () => {
      const c = document.createElement("canvas"), r = Math.min(1, 900 / img.width);
      c.width = img.width * r; c.height = img.height * r; c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      run(sb.from("restaurantes").update({ foto: c.toDataURL("image/jpeg", .75) }).eq("id", RID));
    }; img.src = URL.createObjectURL(f);
  };
  $("#fpf").onsubmit = ev => {
    ev.preventDefault(); const f = Object.fromEntries(new FormData(ev.target));
    run(sb.from("restaurantes").update({ ...f, mesas: +f.mesas || 1 }).eq("id", RID));
  };
}
init();
