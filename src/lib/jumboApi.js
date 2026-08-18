// Cliente de la API pública VTEX de jumbo.cl.
//
// Importante: Jumbo bloquea con 403 las peticiones que vienen de IPs de
// datacenter, así que todo esto tiene que ejecutarse en el navegador del
// usuario. Un Edge Function o un runner de CI reciben 403.

const BASE = 'https://www.jumbo.cl/api/catalog_system/pub'

// VTEX no permite paginar más allá del resultado 2500 en una misma consulta.
export const MAX_WINDOW = 2500

export function normalizeProduct(p) {
  const item = p.items?.[0]
  if (!item) return null
  const offer = item.sellers?.[0]?.commertialOffer
  if (!offer) return null

  const currentPrice = Math.round(offer.Price)
  const regularPrice = Math.round(offer.ListPrice)
  if (currentPrice <= 0) return null

  const isOnSale = regularPrice > 0 && currentPrice < regularPrice
  const discountPercent = isOnSale
    ? Math.round(((regularPrice - currentPrice) / regularPrice) * 100)
    : 0

  // categories[0] viene como "/Lácteos/Leches/Leche Líquida/"
  const categoryPath = p.categories?.[0] || ''
  const segments = categoryPath.split('/').filter(Boolean)
  const category = segments[segments.length - 1] || 'General'
  const categoryTop = segments[0] || 'General'

  return {
    id: `jumbo_${p.productId}`,
    name: p.productName,
    brand: p.brand || '',
    barcode: item.ean || '',
    category,
    categoryTop,
    categoryPath,
    imageUrl: item.images?.[0]?.imageUrl?.replace(/-\d+-\d+(\.\w+)$/, '-500-500$1') || null,
    currentPrice,
    regularPrice,
    isOnSale,
    discountPercent,
    isAvailable: !!offer.IsAvailable,
    unit: 'unidad',
    source: 'jumbo',
  }
}

async function getJson(url, signal) {
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal })
  if (!res.ok) throw new Error(`Jumbo respondió ${res.status}`)
  return res.json()
}

/** Árbol de categorías hasta `depth` niveles. */
export async function fetchCategoryTree(depth = 3, signal) {
  return getJson(`${BASE}/category/tree/${depth}`, signal)
}

/** Aplana el árbol a la lista de categorías hoja (las que tienen productos). */
export function flattenLeafCategories(tree, trail = []) {
  const leaves = []
  for (const node of tree || []) {
    const path = [...trail, node.name]
    if (node.hasChildren && node.children?.length) {
      leaves.push(...flattenLeafCategories(node.children, path))
    } else {
      leaves.push({ id: node.id, name: node.name, path: path.join(' / ') })
    }
  }
  return leaves
}

/** Una página de productos de una categoría. */
export async function fetchCategoryPage(categoryId, from, to, signal) {
  const url = `${BASE}/products/search?fq=C:/${categoryId}/&_from=${from}&_to=${to}`
  const raw = await getJson(url, signal)
  return Array.isArray(raw) ? raw.map(normalizeProduct).filter(Boolean) : []
}

/** Búsqueda por texto libre. */
export async function fetchSearch(query, from, to, signal) {
  const url = `${BASE}/products/search?_query=${encodeURIComponent(query)}&_from=${from}&_to=${to}`
  const raw = await getJson(url, signal)
  return Array.isArray(raw) ? raw.map(normalizeProduct).filter(Boolean) : []
}

/** Búsqueda por código de barras (EAN). */
export async function fetchByBarcode(barcode, signal) {
  const url = `${BASE}/products/search?fq=alternateId:${encodeURIComponent(barcode)}`
  const raw = await getJson(url, signal)
  return Array.isArray(raw) ? raw.map(normalizeProduct).filter(Boolean) : []
}

/** Precios frescos para un conjunto de productos ya conocidos. */
export async function fetchPricesByIds(productIds, signal) {
  if (!productIds.length) return []
  // VTEX acepta varios fq=productId: en la misma consulta (OR).
  const fq = productIds
    .map(id => `fq=productId:${encodeURIComponent(String(id).replace(/^jumbo_/, ''))}`)
    .join('&')
  const url = `${BASE}/products/search?${fq}&_from=0&_to=${productIds.length - 1}`
  const raw = await getJson(url, signal)
  return Array.isArray(raw) ? raw.map(normalizeProduct).filter(Boolean) : []
}
