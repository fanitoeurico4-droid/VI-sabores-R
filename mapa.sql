-- Corre DEPOIS dos outros quatro (schema, motoboy, admin, pagamentos): SQL Editor > New query > Run.

alter table restaurantes add column lat float8, add column lng float8;
alter table encomendas add column destino_lat float8, add column destino_lng float8;
alter table config
  add column taxa_base int not null default 50 check (taxa_base >= 0),
  add column taxa_km int not null default 15 check (taxa_km >= 0),
  add column taxa_max int not null default 300 check (taxa_max >= 0),
  add column raio_max_km int not null default 10 check (raio_max_km > 0);

-- Distância em linha reta (km) entre dois pontos.
create function distancia_km(lat1 float8, lng1 float8, lat2 float8, lng2 float8) returns float8
language sql immutable as $$
  select 2 * 6371 * asin(sqrt(power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2))) $$;

-- Taxa de entrega = base + valor por km (distância em linha reta x 1,3, arredondada para cima), com teto.
-- Devolve null se o destino estiver fora da zona de entrega ou faltar o ponto no mapa.
-- Restaurante sem localização: usa a taxa fixa da tabela config.
create function calcular_taxa(rid uuid, p_lat float8, p_lng float8) returns int
language sql stable security definer set search_path = public as $$
  select case
    when r.lat is null or r.lng is null then c.taxa_entrega
    when p_lat is null or p_lng is null then null
    when distancia_km(r.lat, r.lng, p_lat, p_lng) * 1.3 > c.raio_max_km then null
    else least(c.taxa_max, c.taxa_base + c.taxa_km * ceil(distancia_km(r.lat, r.lng, p_lat, p_lng) * 1.3))::int
  end
  from restaurantes r cross join config c where r.id = rid $$;
grant execute on function calcular_taxa(uuid, float8, float8) to anon, authenticated;

-- A base de dados recusa pedidos com uma taxa diferente da calculada.
drop policy enc_criar on encomendas;
create policy enc_criar on encomendas for insert to anon, authenticated
  with check (estado = 'nova'
    and pagamento in ('Dinheiro na entrega', 'M-Pesa')
    and pag_estado = case when pagamento = 'M-Pesa' then 'pendente' else 'nao_aplica' end
    and pag_tentativas = 0 and pag_ref is null and pag_conv is null and pag_msg is null
    and taxa = case when tipo = 'entrega' then calcular_taxa(restaurante_id, destino_lat, destino_lng) else 0 end
    and exists (select 1 from restaurantes r where r.id = restaurante_id and r.aberto and r.aprovado));

-- Funções do motoboy: agora com as coordenadas, para abrir a navegação.
drop function entregas_livres();
create function entregas_livres() returns table (id uuid, restaurante text, recolha text, recolha_tel text, recolha_lat float8, recolha_lng float8,
  destino text, destino_lat float8, destino_lng float8, ganho int, estado text)
language sql security definer set search_path = public as $$
  select e.id, r.nome, r.endereco, r.telefone, r.lat, r.lng, e.endereco, e.destino_lat, e.destino_lng,
    round(e.taxa * (100 - c.comissao_motoboy) / 100.0)::int, e.estado
  from encomendas e join restaurantes r on r.id = e.restaurante_id cross join config c
  where e.tipo = 'entrega' and e.motoboy_id is null and e.estado in ('aceite','preparar','pronta')
    and exists (select 1 from motoboys m where m.user_id = auth.uid() and m.aprovado)
$$;
drop function minhas_entregas();
create function minhas_entregas() returns table (id uuid, restaurante text, recolha text, recolha_tel text, recolha_lat float8, recolha_lng float8,
  cliente text, cliente_tel text, destino text, destino_lat float8, destino_lng float8, pagamento text, total int, taxa int, ganho int, estado text, criada timestamptz)
language sql security definer set search_path = public as $$
  select e.id, r.nome, r.endereco, r.telefone, r.lat, r.lng, e.cliente, e.telefone, e.endereco, e.destino_lat, e.destino_lng, e.pagamento,
    (coalesce((select sum((i->>'preco')::numeric * (i->>'qtd')::numeric) from jsonb_array_elements(e.itens) i), 0) + e.taxa)::int,
    e.taxa, round(e.taxa * (100 - c.comissao_motoboy) / 100.0)::int, e.estado, e.criada
  from encomendas e join restaurantes r on r.id = e.restaurante_id cross join config c
  where e.motoboy_id = (select m.id from motoboys m where m.user_id = auth.uid())
$$;
revoke all on function entregas_livres(), minhas_entregas() from public, anon;
grant execute on function entregas_livres(), minhas_entregas() to authenticated;
