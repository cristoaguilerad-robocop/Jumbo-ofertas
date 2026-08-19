/**
 * Constantes del catálogo.
 *
 * Aquí vivían ~50 productos ficticios de la fase de desarrollo («Leche
 * Loncoleche Entera 1L», «Palta Hass kg»…) con precios inventados. Servían
 * para levantar la app antes de tener datos reales, pero una vez conectada a
 * Jumbo se colaban entre los resultados sin imagen y con precios que no
 * existen. Se eliminaron: ahora la app muestra productos reales o dice que no
 * hay resultados.
 */

/** Categorías de arranque, hasta que el catálogo indexado devuelve las suyas. */
export const CATEGORIES = [
  'Todos',
  'Lácteos',
  'Carnes',
  'Frutas y Verduras',
  'Bebidas',
  'Limpieza',
  'Panadería',
  'Snacks',
  'Congelados',
  'Despensa',
  'Higiene',
]

export function formatPrice(price) {
  if (typeof price !== 'number' || Number.isNaN(price)) return '—'
  return `$${price.toLocaleString('es-CL')}`
}
