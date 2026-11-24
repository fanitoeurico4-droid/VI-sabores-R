// Utilitários de mapa e localização (Leaflet). Antes de lançar a clientes reais, troca MAPA.tiles por um
// fornecedor de mapas com chave (o servidor gratuito do OpenStreetMap não é para uso intensivo).
const MAPA = { tiles: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", attr: "© OpenStreetMap", centro: [-25.9692, 32.5732] };
const kmEntre = (a, b, c, d) => {
  const r = x => x * Math.PI / 180, h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};
const minhaPosicao = () => new Promise(ok => navigator.geolocation
  ? navigator.geolocation.getCurrentPosition(p => ok({ lat: p.coords.latitude, lng: p.coords.longitude }), () => ok(null), { enableHighAccuracy: true, timeout: 10000 })
  : ok(null));
function novoMapa(id, centro, zoom) {
  const m = L.map(id).setView(centro, zoom);
  L.tileLayer(MAPA.tiles, { attribution: MAPA.attr, maxZoom: 19 }).addTo(m);
  return m;
}
