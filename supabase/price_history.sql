-- Historial real de precios.
-- Ejecutar en Supabase → SQL Editor.
--
-- La ficha de producto mostraba un gráfico generado con Math.sin: una curva
-- inventada bajo el título «Historial de precio», con mínimos y máximos que
-- parecían reales. En una app para decidir cuándo comprar, eso es peor que no
-- mostrar nada. Esta tabla guarda los precios que la app ya consulta.

create table if not exists price_history (
  product_id  text not null,
  recorded_on date not null default current_date,
  price       integer not null,
  list_price  integer,
  is_on_sale  boolean default false,
  primary key (product_id, recorded_on)
);

create index if not exists price_history_product_idx
  on price_history (product_id, recorded_on desc);

alter table price_history enable row level security;

drop policy if exists "history readable by all" on price_history;
drop policy if exists "history writable by auth" on price_history;

create policy "history readable by all"
  on price_history for select using (true);

-- Una fila por producto y día: al refrescar precios varias veces en la misma
-- jornada se actualiza la del día en vez de acumular ruido.
create policy "history writable by auth"
  on price_history for insert to authenticated with check (true);

drop policy if exists "history updatable by auth" on price_history;
create policy "history updatable by auth"
  on price_history for update to authenticated using (true) with check (true);

-- Sembrar con lo que ya está en el catálogo, para que el historial arranque
-- con un punto en vez de vacío.
insert into price_history (product_id, recorded_on, price, list_price, is_on_sale)
select id, current_date, current_price, regular_price, is_on_sale
from products
where current_price is not null
on conflict (product_id, recorded_on) do nothing;
