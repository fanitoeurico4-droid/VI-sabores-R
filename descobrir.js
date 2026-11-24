// Restaurantes por proximidade: mapa + lista ordenada pela distância ao cliente.
const sb = window.sb;
const $ = (s, r = document) => r.querySelector(s);
const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
let LISTA = [], POS = null, mapa, camada;

async function init() {
  if (!sb) { $("#lista").innerHTML = `<div class="card"><strong>Falta configurar o Supabase.</strong> <span class="muted">Preenche o config.js.</span></div>`; return; }
  mapa = novoMapa("mapaLista", MAPA.centro, 12); camada = L.layerGroup().addTo(mapa);
  $("#gps").onclick = localizar;
  const { data, error } = await sb.from("restaurantes").select("id,nome,endereco,cidade,aberto,lat,lng,abre,fecha");
  if (error) { $("#lista").innerHTML = `<div class="vazio">Não foi possível carregar os restaurantes.</div>`; return; }
  LISTA = data || []; desenhar();
}
async function localizar() {
  $("#gps").textContent = "A localizar…";
  POS = await minhaPosicao();
  $("#gps").textContent = "Perto de mim";
  if (!POS) alert("Não foi possível obter a tua localização. Verifica a permissão do navegador.");
  desenhar();
}
function desenhar() {
  camada.clearLayers();
  const lista = LISTA.map(r => ({ ...r, d: POS && r.lat != null ? kmEntre(POS.lat, POS.lng, r.lat, r.lng) : null }))
    .sort((a, b) => (a.d ?? 1e9) - (b.d ?? 1e9) || a.nome.localeCompare(b.nome));
  const pts = [];
  lista.filter(r => r.lat != null).forEach(r => {
    L.marker([r.lat, r.lng]).addTo(camada).bindPopup(`<strong>${esc(r.nome)}</strong><br><a href="cliente.html?r=${r.id}">Ver menu</a>`); pts.push([r.lat, r.lng]);
  });
  if (POS) { L.circleMarker([POS.lat, POS.lng], { radius: 8, color: "#0E3B43", fillColor: "#F2B632", fillOpacity: 1 }).addTo(camada).bindTooltip("Tu"); pts.push([POS.lat, POS.lng]); }
  if (pts.length > 1) mapa.fitBounds(pts, { padding: [30, 30], maxZoom: 16 }); else if (pts.length) mapa.setView(pts[0], 15);
  $("#sub").textContent = POS ? "Ordenados pela distância" : "Toca em “Perto de mim” para ordenar pela distância";
  $("#lista").innerHTML = lista.length ? lista.map(r => `<div class="card"><div class="linha"><div><strong>${esc(r.nome)}</strong>
    <div class="muted">${esc([r.endereco, r.cidade].filter(Boolean).join(", "))}${r.abre ? ` · ${esc(r.abre)}–${esc(r.fecha)}` : ""}</div></div>
    <span class="pill ${r.aberto ? "ok" : "no"}">${r.aberto ? "Aberto" : "Fechado"}</span></div>
    <div class="linha" style="margin-top:8px;align-items:center"><span class="muted">${r.d != null ? "a " + r.d.toFixed(1) + " km" : r.lat == null ? "sem localização no mapa" : ""}</span>
    <a class="b p" href="cliente.html?r=${r.id}">Ver menu</a></div></div>`).join("")
    : `<div class="vazio">Ainda não há restaurantes disponíveis.</div>`;
}
init();
