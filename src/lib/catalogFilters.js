// Qué secciones de Jumbo entran al catálogo.
//
// La app es para la compra de supermercado, así que se excluyen ropa,
// mascotas, hogar y juguetería. La exclusión se evalúa SOLO contra el primer
// segmento de la ruta, para no arrastrar subcategorías legítimas: "hogar"
// descarta /hogar/..., pero deja pasar /limpieza/limpieza-hogar.

export const EXCLUDED_SECTIONS = {
  ropa: ['vestuario', 'ropa', 'moda', 'calzado', 'zapatos', 'indumentaria', 'accesorios-moda'],
  mascotas: ['mascotas', 'petshop', 'pet-shop', 'mundo-mascotas'],
  hogar: ['hogar', 'electrohogar', 'bazar', 'muebles', 'decoracion', 'deco', 'linea-blanca'],
  jugueteria: ['jugueteria', 'juguetes', 'juguete', 'mundo-juguete'],
}

const EXCLUDED_PREFIXES = Object.values(EXCLUDED_SECTIONS).flat()

/** Nombre de la sección excluida que descarta esta ruta, o null si entra. */
export function excludedBy(categoryPath) {
  const top = categoryPath.split('/')[0].toLowerCase()
  for (const [section, prefixes] of Object.entries(EXCLUDED_SECTIONS)) {
    if (prefixes.some(p => top === p || top.startsWith(`${p}-`))) return section
  }
  return null
}

export function isExcluded(categoryPath) {
  return excludedBy(categoryPath) !== null
}

export { EXCLUDED_PREFIXES }

/** "frutas-y-verduras" -> "Frutas Y Verduras" */
export function prettifySlug(slug) {
  return slug
    .split('-')
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
