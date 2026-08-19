-- Limpieza y permiso de borrado.
-- Ejecutar en Supabase → SQL Editor. Es seguro correrlo más de una vez.

-- 1. Permitir borrar.
--
-- La tabla tenía políticas de lectura, inserción y actualización, pero ninguna
-- de borrado. Con RLS activo eso significa que todo DELETE se descartaba sin
-- error: por eso quedaron filas «preflight_*» de la comprobación de escritura,
-- y por eso la app no podía limpiar productos que Jumbo dejó de listar.
drop policy if exists "products deletable by auth" on products;
create policy "products deletable by auth"
  on products for delete to authenticated using (true);

-- 2. Borrar lo que quedó de la fase de desarrollo y de las comprobaciones.
--    Los productos reales tienen id con prefijo «jumbo_»; nada más lo tiene.
delete from products where id not like 'jumbo\_%';

-- 3. Ver qué quedó.
select
  count(*)                                        as total,
  count(*) filter (where is_on_sale)              as en_oferta,
  count(*) filter (where barcode is not null)     as con_codigo_vinculado,
  count(*) filter (where image_url is null)       as sin_imagen
from products;
