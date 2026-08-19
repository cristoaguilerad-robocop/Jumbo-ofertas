import { supabase, isConfigured } from '../supabase'
import { fetchCategories, fetchCategory } from './jumboApi'
import { excludedBy, isPromoLanding, prettifySlug } from './catalogFilters'

const UPSERT_BATCH = 400
const THROTTLE_MS = 60
// Cuántas categorías se recorren a la vez. El tiempo se va casi todo esperando
// la red, así que varias en paralelo multiplican el rendimiento sin castigar a
// jumbo.cl.
const CONCURRENCY = 8
// Tope por categoría: acota el tiempo total y evita quedarse pegado si la
// paginación de Jumbo nunca deja de responder.
const MAX_PAGES_PER_CATEGORY = 40
// Presupuesto de tiempo. Al agotarse, el crawl se detiene de forma ordenada y
// deja el progreso guardado, en vez de correr indefinidamente.
const TIME_BUDGET_MS = 10 * 60 * 1000
const PROGRESS_KEY = 'jumbo_sync_progress'

const sleep = ms => new Promise(r => setTimeout(r, ms))

/**
 * Fila para `products`.
 *
 * Deliberadamente NO incluye `barcode`: el payload de Jumbo nunca trae el EAN,
 * así que enviarlo como null hacía que cada re-sincronización borrara los
 * códigos que el usuario había vinculado a mano escaneando. Al omitir la
 * columna, el upsert no la toca y los vínculos sobreviven.
 */
function toRow(p, categoryPath) {
  const segments = categoryPath.split('/')
  return {
    id: p.id,
    name: p.name,
    brand: p.brand,
    category: prettifySlug(segments[segments.length - 1]),
    category_top: prettifySlug(segments[0]),
    category_path: categoryPath,
    image_url: p.imageUrl,
    current_price: p.currentPrice,
    regular_price: p.regularPrice,
    is_on_sale: p.isOnSale,
    discount_percent: p.discountPercent,
    is_available: p.isAvailable,
    updated_at: new Date().toISOString(),
  }
}

/**
 * Cuál de dos rutas describe mejor a un producto.
 *
 * Un producto aparece en varias categorías, y hasta ahora la etiqueta la
 * decidía cuál escribiera última: primero por azar, después por orden de
 * fases. Ordenar hacía la etiqueta *probable*, no correcta — y quedaban
 * productos bajo «Experiencias Jumbo» sin saber si era su categoría real o el
 * resultado de una carrera perdida. Aquí se decide por la ruta misma, así el
 * resultado no depende de en qué orden se recorra nada.
 *
 * Gana la categoría real sobre la vitrina; entre dos iguales, la más
 * específica; y a igualdad, la primera alfabéticamente, para que dos
 * sincronizaciones den el mismo resultado.
 */
function betterPath(a, b) {
  if (!a) return b
  if (!b) return a
  const aPromo = isPromoLanding(a)
  const bPromo = isPromoLanding(b)
  if (aPromo !== bPromo) return aPromo ? b : a
  const depth = b.split('/').length - a.split('/').length
  if (depth !== 0) return depth > 0 ? b : a
  return a < b ? a : b
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

/**
 * Verifica que se pueda escribir en `products` antes de empezar.
 *
 * Sin esto, un fallo de permisos se manifestaba como un crawl de cinco
 * minutos que terminaba con la tabla vacía: el error se perdía en el catch
 * por categoría, que solo contaba fallas sin mostrar el motivo.
 */
async function preflight() {
  let { data: { user } } = await supabase.auth.getUser()

  // No se depende de que AppProvider ya haya iniciado sesión: puede no haber
  // alcanzado a terminar, o haber fallado sin que nadie reintente.
  if (!user) {
    const { data, error } = await supabase.auth.signInAnonymously()
    if (error) {
      throw new Error(
        `No se pudo iniciar sesión anónima: ${error.message}. Habilita ` +
        '«Allow anonymous sign-ins» en Authentication → Sign In / Providers.'
      )
    }
    user = data?.user ?? null
  }

  if (!user) {
    throw new Error('No hay sesión activa en Supabase y no se pudo crear una.')
  }

  const probeId = `preflight_${Date.now()}`
  const { error: writeError } = await supabase.from('products').upsert({
    id: probeId,
    name: 'Comprobación de escritura',
    current_price: 1,
    regular_price: 1,
  }, { onConflict: 'id' })

  if (writeError) {
    throw new Error(
      `No se puede escribir en la tabla products: ${writeError.message}. ` +
      'Revisa que hayas ejecutado supabase/products.sql completo, incluidas ' +
      'las políticas de RLS.'
    )
  }

  await supabase.from('products').delete().eq('id', probeId)
  return user
}

async function upsertProducts(products, categoryPath) {
  const rows = products.map(p => toRow(p, categoryPath))
  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const { error } = await supabase
      .from('products')
      .upsert(rows.slice(i, i + UPSERT_BATCH), { onConflict: 'id' })
    if (error) throw new Error(`Supabase: ${error.message}`)
  }
}

/**
 * Reescribe solo las columnas de categoría de los productos mal etiquetados.
 *
 * No toca precios ni nombres: son los mismos que ya se guardaron, y volver a
 * enviarlos solo agregaría peso y riesgo de pisar un dato más fresco.
 */
async function relabelProducts(fixes, signal) {
  let updated = 0
  for (let i = 0; i < fixes.length; i += UPSERT_BATCH) {
    if (signal?.aborted) break
    const batch = fixes.slice(i, i + UPSERT_BATCH).map(({ id, path }) => {
      const segments = path.split('/')
      return {
        id,
        category: prettifySlug(segments[segments.length - 1]),
        category_top: prettifySlug(segments[0]),
        category_path: path,
      }
    })
    const { error } = await supabase.from('products').upsert(batch, { onConflict: 'id' })
    if (error) throw new Error(`Supabase: ${error.message}`)
    updated += batch.length
    await sleep(THROTTLE_MS)
  }
  return updated
}

/**
 * Deja fuera las categorías que tienen subcategorías: sus productos ya salen
 * al recorrer las hojas, y el padre además tope antes por MAX_PAGES.
 */
function leafCategories(paths) {
  const set = new Set(paths)
  return paths.filter(p => {
    for (const other of set) {
      if (other !== p && other.startsWith(`${p}/`)) return false
    }
    return true
  })
}

/**
 * Borra lo que quedó fuera de una sincronización completa desde cero:
 *
 *   - productos que Jumbo ya no lista (su `updated_at` quedó viejo)
 *   - artículos de la fase de desarrollo, cuyos ids no tienen el prefijo
 *     `jumbo_` porque nunca vinieron del sitio real
 *
 * Se respetan las filas con `barcode`: son las que el usuario vinculó
 * escaneando, y perderlas obligaría a repetir ese trabajo.
 */
async function purgeStale(startedAtIso) {
  let removed = 0

  // Artículos de la fase de desarrollo y filas de comprobación del preflight.
  const dev = await supabase
    .from('products')
    .delete({ count: 'exact' })
    .not('id', 'like', 'jumbo\\_%')
  if (dev.error) return { removed: 0, error: dev.error.message }
  removed += dev.count || 0

  // Productos que Jumbo ya no lista: no los tocó esta pasada.
  const stale = await supabase
    .from('products')
    .delete({ count: 'exact' })
    .lt('updated_at', startedAtIso)
    .is('barcode', null)
  if (stale.error) return { removed, error: stale.error.message }
  removed += stale.count || 0

  return { removed, error: null }
}

export async function syncCatalog({ onProgress, signal, restart = false } = {}) {
  if (!isConfigured) throw new Error('Supabase no está configurado')

  const report = patch => onProgress?.(patch)

  report({ phase: 'categories', message: 'Verificando acceso a Supabase...' })
  await preflight()

  report({ phase: 'categories', message: 'Buscando categorías...' })
  const { categories: allCategories, stats } = await fetchCategories()
  if (!allCategories?.length) {
    throw new Error('No se encontraron categorías en el sitemap de Jumbo')
  }

  const excluded = []
  const included = []
  for (const path of allCategories) {
    const section = excludedBy(path)
    if (section) excluded.push({ path, section })
    else included.push(path)
  }
  // Las vitrinas promocionales agrupan productos que también viven en su
  // categoría real, y como el upsert sobrescribe, la última en escribir decide
  // la etiqueta. Ordenar por profundidad no bastaba: con 8 workers en paralelo
  // el orden es solo aproximado y la vitrina podía ganarle la carrera a la
  // categoría real. Se recorren en dos fases que no se solapan, así la
  // categoría real siempre escribe después.
  const leaves = leafCategories(included)
  const promoLandings = leaves.filter(isPromoLanding)
  const realCategories = leaves.filter(p => !isPromoLanding(p))
  const categories = [...promoLandings, ...realCategories]

  const saved = restart ? null : loadProgress()
  const done = new Set(saved?.doneCategories || [])
  // Un producto se escribe una vez por cada categoría donde aparece, así que
  // contar escrituras exagera el catálogo: 31.000 escrituras eran 17.500
  // productos. Se lleva aparte el conteo de ids distintos, que es el real.
  const uniqueIds = new Set()
  // Mejor ruta vista por producto, y la que efectivamente quedó escrita. La
  // diferencia entre ambas es lo que hay que corregir al final.
  const bestPath = new Map()
  const writtenPath = new Map()
  let totalSaved = saved?.totalSaved || 0
  let failed = saved?.failed || 0
  let lastError = null

  const startedAt = Date.now()
  const startedAtIso = new Date().toISOString()
  const alreadyDone = done.size
  let phaseLabel = 'vitrinas'

  const base = {
    phase: 'crawling',
    totalCategories: categories.length,
    excludedCount: excluded.length,
    excludedSections: [...new Set(excluded.map(e => e.section))],
    skippedParents: included.length - categories.length,
    promoLandings: promoLandings.length,
    discovery: stats,
  }

  const snapshot = extra => {
    const elapsedMin = (Date.now() - startedAt) / 60000
    const progressed = done.size - alreadyDone
    const perMin = elapsedMin > 0.2 ? progressed / elapsedMin : 0
    return {
      ...base,
      doneCategories: done.size,
      totalSaved,
      uniqueProducts: uniqueIds.size,
      phaseLabel,
      failed,
      lastError,
      productsPerMin: elapsedMin > 0.2 ? Math.round(totalSaved / elapsedMin) : null,
      etaMin: perMin > 0 ? Math.round((categories.length - done.size) / perMin) : null,
      ...extra,
    }
  }

  report(snapshot())

  const active = new Set()
  let cursor = 0
  let outOfTime = false

  const budgetSpent = () => Date.now() - startedAt >= TIME_BUDGET_MS

  async function crawlOne(categoryPath) {
    const seen = new Set()
    for (let page = 1; page <= MAX_PAGES_PER_CATEGORY; page++) {
      if (signal?.aborted) throw new DOMException('Sincronización cancelada', 'AbortError')

      if (budgetSpent()) { outOfTime = true; break }

      const products = await fetchCategory(categoryPath, page, signal)
      if (!products.length) break

      // Si la página no aporta nada nuevo, la paginación ya dio la vuelta.
      const fresh = products.filter(p => !seen.has(p.id))
      if (!fresh.length) break
      fresh.forEach(p => seen.add(p.id))

      await upsertProducts(fresh, categoryPath)
      totalSaved += fresh.length
      for (const p of fresh) {
        uniqueIds.add(p.id)
        bestPath.set(p.id, betterPath(bestPath.get(p.id), categoryPath))
        writtenPath.set(p.id, categoryPath)
      }
      report(snapshot({ currentCategory: [...active][0], currentPage: page }))

      await sleep(THROTTLE_MS)
    }
  }

  async function worker(end) {
    while (cursor < end) {
      if (signal?.aborted) throw new DOMException('Sincronización cancelada', 'AbortError')

      if (budgetSpent()) { outOfTime = true; return }

      const categoryPath = categories[cursor++]
      if (done.has(categoryPath)) continue

      active.add(categoryPath)
      report(snapshot({ currentCategory: categoryPath }))
      try {
        await crawlOne(categoryPath)
      } catch (err) {
        if (err.name === 'AbortError') throw err
        failed += 1
        lastError = err.message
        // Si todo falla, no tiene sentido seguir cinco minutos en vano.
        if (failed >= 5 && totalSaved === 0) {
          throw new Error(`El crawl no logró guardar nada. Primer error: ${err.message}`)
        }
      } finally {
        active.delete(categoryPath)
      }

      done.add(categoryPath)
      saveProgress({ doneCategories: [...done], totalSaved, failed })
      await sleep(THROTTLE_MS)
    }
  }

  // Fase 1: las vitrinas. Fase 2: las categorías reales, que sobrescriben la
  // etiqueta de todo producto que aparezca en ambas. Esperar a que la fase 1
  // termine por completo es lo que garantiza el orden; sin esa barrera, la
  // concurrencia lo deshacía.
  phaseLabel = 'vitrinas'
  cursor = 0
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(promoLandings.length)))

  phaseLabel = 'categorias'
  cursor = promoLandings.length
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(categories.length)))

  // Corrige las etiquetas que quedaron mal por orden de escritura. Solo tras un
  // recorrido completo: a medias, la mejor ruta de un producto puede estar en
  // una categoría todavía no visitada.
  let relabeled = 0
  let relabelError = null
  let pendingFixes = 0
  let promoOnly = 0
  const completeRun = restart && !outOfTime && done.size === categories.length
  if (completeRun) {
    report(snapshot({ phase: 'relabeling' }))
    const fixes = []
    for (const [id, best] of bestPath) {
      if (isPromoLanding(best)) promoOnly += 1
      if (writtenPath.get(id) !== best) fixes.push({ id, path: best })
    }
    pendingFixes = fixes.length
    // Sin esto, un fallo de Supabase se reportaba como «0 corregidos», idéntico
    // a no haber tenido nada que corregir. Son dos cosas muy distintas y la
    // pantalla debe poder decir cuál ocurrió.
    try {
      relabeled = await relabelProducts(fixes, signal)
    } catch (err) {
      relabelError = err.message
    }
  }

  // Solo tiene sentido purgar tras un recorrido completo desde cero: si quedó
  // a medias, lo no visitado todavía tiene `updated_at` viejo y se borraría
  // catálogo bueno.
  let purged = 0
  let purgeError = null
  const complete = completeRun
  if (complete) {
    report(snapshot({ phase: 'purging' }))
    const result = await purgeStale(startedAtIso)
      .catch(err => ({ removed: 0, error: err.message }))
    purged = result.removed
    purgeError = result.error
  }

  report(snapshot({ phase: 'done', outOfTime, purged, purgeError, complete, relabeled, relabelError, pendingFixes, promoOnly }))
  return {
    totalSaved,
    uniqueProducts: uniqueIds.size,
    relabeled,
    relabelError,
    pendingFixes,
    promoOnly,
    failed,
    lastError,
    outOfTime,
    purged,
    purgeError,
    complete,
    categories: categories.length,
    promoLandings: promoLandings.length,
    excluded: excluded.length,
  }
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
