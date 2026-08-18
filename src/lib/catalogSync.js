import { supabase, isConfigured } from '../supabase'
import {
  fetchCategoryTree,
  flattenLeafCategories,
  fetchCategoryPage,
  MAX_WINDOW,
} from './jumboApi'

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

/**
 * Recorre el catálogo completo de Jumbo categoría por categoría y lo guarda en
 * Supabase. Reanudable: si se corta, la siguiente corrida retoma donde quedó.
 *
 * @param {object} opts
 * @param {(s: object) => void} opts.onProgress
 * @param {AbortSignal} opts.signal
 * @param {boolean} opts.restart  ignora el progreso guardado y parte de cero
 */
export async function syncCatalog({ onProgress, signal, restart = false } = {}) {
  if (!isConfigured) throw new Error('Supabase no está configurado')

  const report = patch => onProgress?.(patch)

  report({ phase: 'categories', message: 'Obteniendo árbol de categorías...' })
  const tree = await fetchCategoryTree(3, signal)
  const categories = flattenLeafCategories(tree)
  if (!categories.length) throw new Error('No se pudieron leer las categorías de Jumbo')

  const saved = restart ? null : loadProgress()
  const done = new Set(saved?.doneCategories || [])
  let totalSaved = saved?.totalSaved || 0
  let failed = saved?.failed || 0

  report({
    phase: 'crawling',
    totalCategories: categories.length,
    doneCategories: done.size,
    totalSaved,
    failed,
  })

  for (const cat of categories) {
    if (signal?.aborted) throw new DOMException('Sincronización cancelada', 'AbortError')
    if (done.has(cat.id)) continue

    report({
      phase: 'crawling',
      currentCategory: cat.path,
      totalCategories: categories.length,
      doneCategories: done.size,
      totalSaved,
      failed,
    })

    try {
      let from = 0
      while (from < MAX_WINDOW) {
        if (signal?.aborted) throw new DOMException('Sincronización cancelada', 'AbortError')

        const to = Math.min(from + PAGE_SIZE - 1, MAX_WINDOW - 1)
        const products = await fetchCategoryPage(cat.id, from, to, signal)
        if (!products.length) break

        await upsertProducts(products)
        totalSaved += products.length

        report({
          phase: 'crawling',
          currentCategory: cat.path,
          totalCategories: categories.length,
          doneCategories: done.size,
          totalSaved,
          failed,
        })

        if (products.length < PAGE_SIZE) break
        from += PAGE_SIZE
        await sleep(THROTTLE_MS)
      }
    } catch (err) {
      if (err.name === 'AbortError') throw err
      // Una categoría rota no debe abortar el crawl completo.
      failed += 1
    }

    done.add(cat.id)
    saveProgress({ doneCategories: [...done], totalSaved, failed })
    await sleep(THROTTLE_MS)
  }

  report({
    phase: 'done',
    totalCategories: categories.length,
    doneCategories: done.size,
    totalSaved,
    failed,
  })

  return { totalSaved, failed, categories: categories.length }
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
