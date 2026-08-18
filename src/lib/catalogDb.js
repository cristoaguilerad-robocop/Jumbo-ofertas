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

/** Precios actuales para los ids dados, desde el catálogo indexado. */
export async function getPricesForIds(ids) {
  if (!isConfigured || !ids.length) return {}
  const { data, error } = await supabase
    .from('products').select('id, current_price, is_on_sale').in('id', ids)
  if (error || !data) return {}
  return Object.fromEntries(data.map(r => [r.id, { currentPrice: r.current_price, isOnSale: r.is_on_sale }]))
}
