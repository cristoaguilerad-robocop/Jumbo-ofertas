import { supabase, isConfigured } from '../supabase'
import { fetchSearch } from './jumboApi'
import { recordPrices } from './catalogDb'

const CONCURRENCY = 4

/**
 * Trae precios frescos de Jumbo para los productos de la lista.
 *
 * El catálogo indexado envejece entre sincronizaciones, así que las alertas de
 * bajada comparaban contra una foto vieja: si un producto bajaba hoy, la app se
 * enteraba recién al re-sincronizar. Los productos de la lista son pocos, así
 * que refrescarlos en vivo al abrir la app es barato y resuelve el desfase.
 *
 * Se busca cada producto por su nombre y se acepta solo si vuelve con el mismo
 * id, para no confundirlo con otro parecido.
 */
export async function refreshListPrices(items, { onUpdate, signal } = {}) {
  const targets = items.filter(i => String(i.productId).startsWith('jumbo_'))
  if (!targets.length) return {}

  const fresh = {}
  let cursor = 0

  async function worker() {
    while (cursor < targets.length) {
      if (signal?.aborted) return
      const item = targets[cursor++]
      try {
        const found = await fetchSearch(item.name, 1, signal)
        const match = found.find(p => p.id === item.productId)
        if (match) {
          fresh[item.productId] = match
          onUpdate?.(item.productId, match)
        }
      } catch { /* un producto que no se pudo refrescar no rompe el resto */ }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  // El precio recién traído también actualiza el catálogo, así la próxima
  // consulta ya lo tiene sin esperar a la siguiente sincronización, y queda
  // anotado en el historial: es la única fuente de datos reales para el gráfico
  // de la ficha, que antes dibujaba una curva inventada.
  const values = Object.values(fresh)
  if (isConfigured && values.length) {
    await Promise.all([
      ...values.map(p =>
        supabase.from('products').update({
          current_price: p.currentPrice,
          regular_price: p.regularPrice,
          is_on_sale: p.isOnSale,
          discount_percent: p.discountPercent,
          updated_at: new Date().toISOString(),
        }).eq('id', p.id)
      ),
      recordPrices(values),
    ]).catch(() => { /* el refresco en pantalla ya sirvió */ })
  }

  return fresh
}
