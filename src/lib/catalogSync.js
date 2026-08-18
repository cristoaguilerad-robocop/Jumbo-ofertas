import { supabase, isConfigured } from '../supabase'

const PAGE_SIZE = 50
const UPSERT_BATCH = 400
const THROTTLE_MS = 250
const PROGRESS_KEY = 'jumbo_sync_progress'

const sleep = ms => new Promise(r => setTimeout(r, ms))

function toRow(p) {
  return {
    id: p.id,
    name: p.name,
    brand: p.brand,
    barcode: p.barcode || null,
    category: p.category,
    category_top: p.categoryTop,
    category_path: p.categoryPath,
    image_url: p.imageUrl,
    current_price: p.currentPrice,
    regular_price: p.regularPrice,
    is_on_sale: p.isOnSale,
    discount_percent: p.discountPercent,
    is_available: p.isAvailable,
    updated_at: new Date().toISOString(),
  }
}

export function loadProgress() {
  try { return JSON.parse(localStorage.getItem(PROGRESS_KEY) || 'null') } catch { return null }
}
export function clearProgress() {
  try { localStorage.removeItem(PROGRESS_KEY) } catch { /* ignore */ }
}
function saveProgress(p) {
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(p)) } catch { /* ignore */ }
}

async function upsertProducts(products) {
  const rows = products.map(toRow)
  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const batch = rows.slice(i, i + UPSERT_BATCH)
    const { error } = await supabase.from('products').upsert(batch, { onConflict: 'id' })
    if (error) throw new Error(`Supabase: ${error.message}`)
  }
}

/** Descarga el catálogo completo a Supabase. Pendiente: ver dentro. */
export async function syncCatalog() {
  // El crawl completo se apoyaba en el árbol de categorías de VTEX, que jumbo.cl
  // no expone (404). Las rutas de categoría reales salen del sitemap; hasta
  // tenerlas, este paso queda pendiente en vez de fallar a medias.
  throw new Error(
    'El crawl del catálogo completo aún no está implementado para la estructura ' +
    'real de jumbo.cl. Usa "Descubrir API de Jumbo" para obtener las rutas del sitemap. ' +
    'Mientras tanto, la búsqueda ya trae precios reales en vivo.'
  )
}

/** Cantidad de productos indexados, o null si la tabla no es legible. */
export async function countCatalog() {
  if (!isConfigured) return null
  const { count, error } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
  if (error) {
    console.warn('No se pudo contar el catálogo:', error.message)
    return null
  }
  return count
}
