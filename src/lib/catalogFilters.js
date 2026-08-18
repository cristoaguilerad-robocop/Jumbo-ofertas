// Qué secciones de Jumbo entran al catálogo.
//
// La app es para la compra de supermercado, así que se excluyen las secciones
// que no lo son. Excluir bien importa por tiempo: cada categoría que entra
// cuesta varias peticiones.

export const EXCLUDED_SECTIONS = {
  ropa: ['vestuario', 'ropa', 'moda', 'calzado', 'zapatos', 'indumentaria', 'accesorios-moda'],
  mascotas: ['mascotas', 'petshop', 'pet-shop', 'mundo-mascotas', 'mascota'],
  hogar: ['hogar', 'electrohogar', 'bazar', 'muebles', 'decoracion', 'deco', 'linea-blanca', 'menaje'],
  jugueteria: ['jugueteria', 'juguetes', 'juguete', 'mundo-juguete'],
  farmacia: ['farmacia', 'salud', 'medicamentos'],
  libreria: ['libreria', 'libros', 'escolar', 'utiles-escolares', 'papeleria'],
}

/**
 * Coincide si CUALQUIER segmento de la ruta es exactamente un slug excluido, o
 * si el primer segmento empieza con uno seguido de guion.
 *
 * La coincidencia es por segmento exacto y no por substring a propósito:
 * "limpieza/limpieza-hogar" debe entrar al catálogo pese a contener "hogar",
 * porque ninguno de sus segmentos es exactamente "hogar". Un substring habría
 * dejado la app sin productos de limpieza.
 *
 * Se miran todos los segmentos, no solo el primero, porque Jumbo anida
 * categorías bajo secciones (ej. "supermercado/mascotas/perros") y filtrar solo
 * el primero dejaba pasar justamente lo que se quería excluir.
 */
export function excludedBy(categoryPath) {
  const segments = categoryPath.toLowerCase().split('/').filter(Boolean)
  for (const [section, slugs] of Object.entries(EXCLUDED_SECTIONS)) {
    for (const slug of slugs) {
      if (segments.includes(slug)) return section
      if (segments[0]?.startsWith(`${slug}-`)) return section
    }
  }
  return null
}

export function isExcluded(categoryPath) {
  return excludedBy(categoryPath) !== null
}

/** "frutas-y-verduras" -> "Frutas Y Verduras" */
export function prettifySlug(slug) {
  return slug
    .split('-')
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
