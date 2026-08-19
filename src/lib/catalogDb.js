import { supabase, isConfigured } from '../supabase'

function fromRow(r) {
  return {
    id: r.id,
    name: r.name,
    brand: r.brand || '',
    barcode: r.barcode || '',
    category: r.category || 'General',
    categoryTop: r.category_top || '',
    categoryPath: r.category_path || '',
    imageUrl: r.image_url,
    currentPrice: r.current_price,
    regularPrice: r.regular_price,
    isOnSale: r.is_on_sale,
    discountPercent: r.discount_percent || 0,
    isAvailable: r.is_available,
    unit: 'unidad',
    source: 'catalog',
    updatedAt: r.updated_at,
  }
}

/** Busca en el catálogo indexado. Devuelve null si no hay catálogo disponible. */
export async function searchCatalog({ query, category, onlyOffers, from = 0, limit = 24 }) {
  if (!isConfigured) return null

  let q = supabase.from('products').select('*').eq('is_available', true)

  if (query) {
    // Cada palabra debe aparecer en el nombre, en cualquier orden.
    for (const word of query.split(/\s+/).filter(Boolean)) {
      q = q.ilike('name', `%${word}%`)
    }
  }
  if (category && category !== 'Todos') q = q.eq('category_top', category)
  if (onlyOffers) q = q.eq('is_on_sale', true)

  q = q.order('is_on_sale', { ascending: false })
    .order('name', { ascending: true })
    .range(from, from + limit - 1)

  const { data, error } = await q
  if (error) return null
  return data.map(fromRow)
}

export async function getCatalogProduct(id) {
  if (!isConfigured) return null
  const { data, error } = await supabase.from('products').select('*').eq('id', id).maybeSingle()
  if (error || !data) return null
  return fromRow(data)
}

export async function getCatalogByBarcode(barcode) {
  if (!isConfigured) return null
  const { data, error } = await supabase
    .from('products').select('*').eq('barcode', barcode).limit(1)
  if (error || !data?.length) return null
  return fromRow(data[0])
}

/**
 * Asocia un código de barras a un producto.
 *
 * Hace falta porque el payload RSC de Jumbo no trae el EAN: sin esto, ningún
 * escaneo encontraría nada. La primera vez que escaneas un producto lo eliges a
 * mano y queda vinculado; los escaneos siguientes lo resuelven solos.
 */
export async function linkBarcode(product, barcode) {
  if (!isConfigured) throw new Error('Supabase no está configurado')

  const row = {
    id: product.id,
    name: product.name,
    brand: product.brand || null,
    barcode,
    category: product.category || null,
    category_top: product.categoryTop || product.category || null,
    category_path: product.categoryPath || null,
    image_url: product.imageUrl || null,
    current_price: product.currentPrice,
    regular_price: product.regularPrice,
    is_on_sale: !!product.isOnSale,
    discount_percent: product.discountPercent || 0,
    is_available: product.isAvailable !== false,
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase.from('products').upsert(row, { onConflict: 'id' })
  if (error) throw new Error(error.message)
  return { ...product, barcode }
}

export async function getCatalogCategories() {
  if (!isConfigured) return null
  const { data, error } = await supabase.rpc('distinct_categories')
  if (error || !data) return null
  return data.map(r => r.category).filter(Boolean)
}

export async function getOffers(limit = 20) {
  if (!isConfigured) return null
  const { data, error } = await supabase
    .from('products').select('*')
    .eq('is_on_sale', true).eq('is_available', true)
    .order('discount_percent', { ascending: false })
    .limit(limit)
  if (error || !data) return null
  return data.map(fromRow)
}

/**
 * Precios del catálogo para los ids dados.
 *
 * Devuelve la forma completa del producto —incluidos regularPrice y
 * discountPercent— porque la lista los usa para mostrar el precio tachado y el
 * porcentaje; con solo el precio actual la insignia de oferta salía vacía.
 */
export async function getPricesForIds(ids) {
  if (!isConfigured || !ids.length) return {}
  const { data, error } = await supabase
    .from('products')
    .select('id, current_price, regular_price, is_on_sale, discount_percent')
    .in('id', ids)
  if (error || !data) return {}
  return Object.fromEntries(data.map(r => [r.id, {
    id: r.id,
    currentPrice: r.current_price,
    regularPrice: r.regular_price,
    isOnSale: r.is_on_sale,
    discountPercent: r.discount_percent || 0,
  }]))
}

/**
 * Historial real de precios de un producto, del más antiguo al más reciente.
 *
 * La ficha dibujaba antes una curva generada con Math.sin bajo el título
 * «Historial de precio»: mínimos y máximos inventados en una app cuyo propósito
 * es decidir cuándo comprar. Ahora se lee lo que la app fue registrando.
 */
export async function getPriceHistory(productId, days = 180) {
  if (!isConfigured || !productId) return []

  const since = new Date()
  since.setDate(since.getDate() - days)

  const { data, error } = await supabase
    .from('price_history')
    .select('recorded_on, price, list_price, is_on_sale')
    .eq('product_id', productId)
    .gte('recorded_on', since.toISOString().slice(0, 10))
    .order('recorded_on', { ascending: true })

  if (error || !data) return []
  return data.map(r => ({
    date: r.recorded_on,
    price: r.price,
    listPrice: r.list_price,
    isOnSale: !!r.is_on_sale,
  }))
}

/**
 * Guarda el precio observado hoy. Una fila por producto y día: refrescar varias
 * veces en la misma jornada actualiza la del día en vez de acumular ruido.
 */
export async function recordPrices(products) {
  if (!isConfigured || !products.length) return

  const today = new Date().toISOString().slice(0, 10)
  const rows = products
    .filter(p => Number.isFinite(p.currentPrice))
    .map(p => ({
      product_id: p.id,
      recorded_on: today,
      price: p.currentPrice,
      list_price: p.regularPrice ?? null,
      is_on_sale: !!p.isOnSale,
    }))
  if (!rows.length) return

  await supabase
    .from('price_history')
    .upsert(rows, { onConflict: 'product_id,recorded_on' })
}
