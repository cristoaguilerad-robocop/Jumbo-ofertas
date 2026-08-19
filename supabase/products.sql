-- Catálogo de productos de Jumbo.
-- Ejecutar en Supabase → SQL Editor.

create extension if not exists pg_trgm;

create table if not exists products (
  id               text primary key,
  name             text not null,
  brand            text,
  barcode          text,
  category         text,
  category_top     text,
  category_path    text,
  image_url        text,
  current_price    integer,
  regular_price    integer,
  is_on_sale       boolean default false,
  discount_percent integer default 0,
  is_available     boolean default true,
  updated_at       timestamptz default now()
);

-- Búsqueda por nombre con ILIKE '%texto%' sin escanear la tabla completa.
create index if not exists products_name_trgm_idx on products using gin (name gin_trgm_ops);
create index if not exists products_barcode_idx   on products (barcode);
create index if not exists products_cat_top_idx   on products (category_top);
create index if not exists products_sale_idx      on products (is_on_sale) where is_on_sale;

alter table products enable row level security;

drop policy if exists "products readable by all"   on products;
drop policy if exists "products writable by auth"  on products;
drop policy if exists "products updatable by auth" on products;
drop policy if exists "products deletable by auth" on products;

create policy "products readable by all"
  on products for select using (true);

create policy "products writable by auth"
  on products for insert to authenticated with check (true);

create policy "products updatable by auth"
  on products for update to authenticated using (true) with check (true);

-- Sin esta política, cualquier borrado se descartaba en silencio: la fila de
-- comprobación que escribe el preflight quedaba para siempre en la tabla, y la
-- limpieza posterior a una sincronización completa no eliminaba nada.
create policy "products deletable by auth"
  on products for delete to authenticated using (true);

-- Categorías de primer nivel presentes en el catálogo, para los chips de filtro.
create or replace function distinct_categories()
returns table (category text)
language sql
stable
as $$
  select distinct category_top
  from products
  where category_top is not null and category_top <> ''
  order by 1;
$$;
