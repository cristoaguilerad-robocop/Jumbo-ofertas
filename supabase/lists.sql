-- Listas múltiples: "Compra mensual", "Carrete", "Para picar", etc.
-- Ejecutar en Supabase → SQL Editor, después de products.sql.
--
-- Migra los productos que ya tengas a una lista por defecto, así no se pierde
-- nada de lo que hayas guardado.

create extension if not exists "pgcrypto";

-- 1. Tabla de listas
create table if not exists lists (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  name       text not null,
  emoji      text default '🛒',
  created_at timestamptz default now()
);

create index if not exists lists_user_idx on lists (user_id);

alter table lists enable row level security;

drop policy if exists "own lists" on lists;
create policy "own lists" on lists
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 2. Vincular los productos a una lista
alter table shopping_list add column if not exists list_id uuid references lists(id) on delete cascade;

-- 3. Lista por defecto para lo que ya estaba guardado
insert into lists (user_id, name, emoji)
select distinct user_id, 'Mi lista', '🛒'
from shopping_list
where list_id is null
  and not exists (
    select 1 from lists l where l.user_id = shopping_list.user_id and l.name = 'Mi lista'
  );

update shopping_list sl
set list_id = l.id
from lists l
where sl.list_id is null
  and l.user_id = sl.user_id
  and l.name = 'Mi lista';

-- 4. La unicidad pasa a ser por lista: el mismo producto puede estar en varias.
--    Se quita la restricción anterior sin depender de su nombre.
do $$
declare c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'shopping_list'::regclass
      and contype in ('p', 'u')
  loop
    execute format('alter table shopping_list drop constraint %I', c.conname);
  end loop;
end $$;

alter table shopping_list
  add constraint shopping_list_list_product_key unique (user_id, list_id, product_id);

create index if not exists shopping_list_list_idx on shopping_list (list_id);
