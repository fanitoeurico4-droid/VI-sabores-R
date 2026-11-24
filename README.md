# Plataforma de reservas e entregas — protótipo

- `index.html` — **restaurante**: conta com email e palavra-passe, perfil, menu, encomendas e reservas.
- `restaurantes.html` — **mapa para o cliente**: restaurantes perto de si, ordenados por distância; leva ao menu de cada um.
- `cliente.html?r=CODIGO` — **cliente**: menu, pedido, acompanhar entrega e reservar mesa. O link com o código aparece no painel do restaurante.

- `motoboy.html` — **motoboy**: conta própria, ficar disponível, aceitar entregas, recolher, entregar e ver as taxas ganhas.

- `admin.html` — **administrador**: aprovar restaurantes e motoboys, ver encomendas e reservas, definir taxa de entrega e comissões, relatórios.

## Configurar (uma vez)

1. Cria um projeto em supabase.com.
2. **SQL Editor → New query**: cola o conteúdo de `supabase/schema.sql` e carrega em **Run**. Depois faz o mesmo com `supabase/motoboy.sql` `supabase/admin.sql`, `supabase/pagamentos.sql` e, por fim, `supabase/mapa.sql`.
   Para seres administrador: cria conta em `admin.html` e corre no SQL Editor o comando que a página te mostra.
   Atenção: restaurantes e motoboys novos só ficam ativos depois de aprovados.
3. **Authentication → Providers → Email**: para testar, desativa “Confirm email”.
4. **Project Settings → API**: copia o *Project URL* e a chave *anon public* para o `config.js`.
5. Carrega os ficheiros para o GitHub e ativa **Settings → Pages** (ramo `main`, pasta `/ (root)`).

## Pagamentos M-Pesa

O navegador nunca vê as chaves: a cobrança é feita pela função `supabase/functions/pagar`.

1. Corre `supabase/pagamentos.sql` no SQL Editor (depois dos outros três).
2. No portal developer.mpesa.vm.co.mz, cria uma aplicação e copia a *API key*, a *public key* e o *service provider code*.
3. Com a Supabase CLI: `supabase secrets set MPESA_API_KEY=... MPESA_PUBLIC_KEY=... MPESA_SERVICE_CODE=... MPESA_HOST=api.sandbox.vm.co.mz`
4. `supabase functions deploy pagar`
5. Testa no sandbox. Para produção, muda `MPESA_HOST` para `api.vm.co.mz` depois da aprovação da Vodacom.

O pedido só avança para o restaurante depois de pago. O valor é calculado no servidor.
e-Mola (Movitel) fica desativado até haver contrato e acesso à API da Movitel.

## Mapa e taxa por distância

- O restaurante marca a localização no separador Perfil (toca no mapa ou usa o GPS).
- O cliente marca onde quer receber. A taxa é **base + valor por km** (distância em linha reta × 1,3, com teto e distância máxima), definidos pelo administrador. É calculada na base de dados, por isso não pode ser alterada no navegador.
- O motoboy vê a distância até à recolha e abre a navegação no Google Maps.
- O mapa usa o servidor gratuito do OpenStreetMap, que não é para uso intensivo: antes de lançar, troca `MAPA.tiles` em `geo.js` por um fornecedor com chave.

## Segurança

Cada restaurante só altera os seus dados; o cliente só vê os pedidos e reservas cujos códigos o seu telemóvel guardou; o motoboy só vê entregas pelas funções da base de dados, e só vê o nome e o telefone do cliente depois de aceitar.

## Ainda por fazer

Reembolsos e repasse do dinheiro aos restaurantes e motoboys, e-Mola, reclamações, rota real (hoje é uma estimativa), seguimento do motoboy em tempo real e pagamentos M-Pesa/e-Mola reais.
