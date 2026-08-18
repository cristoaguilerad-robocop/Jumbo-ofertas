const HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
}

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'es-CL,es;q=0.9',
  'Referer': 'https://www.jumbo.cl/',
  'Origin': 'https://www.jumbo.cl',
}

interface VtexItem {
  ean: string
  images: Array<{ imageUrl: string }>
  sellers: Array<{
    commertialOffer: {
      Price: number
      ListPrice: number
      IsAvailable: boolean
    }
  }>
}

interface VtexProduct {
  productId: string
  productName: string
  brand: string
  categories: string[]
  items: VtexItem[]
}

function normalizeVtex(p: VtexProduct) {
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
  const category = p.categories?.[0]?.split('/')?.filter(Boolean).pop() || 'General'
  return {
    id: `jumbo_${p.productId}`,
    name: p.productName,
    brand: p.brand || '',
    barcode: item.ean || '',
    category,
    imageUrl: item.images?.[0]?.imageUrl?.replace(/-\d+-\d+(\.\w+)$/, '-300-300$1') || null,
    currentPrice,
    regularPrice,
    isOnSale,
    discountPercent,
    isAvailable: offer.IsAvailable,
    unit: 'unidad',
    source: 'jumbo',
  }
}

// VTEX Intelligent Search (newer endpoint, better results)
async function searchIntelligent(query: string): Promise<VtexProduct[] | null> {
  const url = `https://www.jumbo.cl/api/io/_v/api/intelligent-search/product_search?query=${encodeURIComponent(query)}&page=1&count=12&sort=score_desc&fuzzy=auto&hideUnavailableItems=false`
  const res = await fetch(url, { headers: FETCH_HEADERS })
  if (!res.ok) return null
  const json = await res.json()
  return json.products || null
}

// VTEX Catalog Search (legacy, used as fallback)
async function searchCatalog(query: string): Promise<VtexProduct[] | null> {
  const url = `https://www.jumbo.cl/api/catalog_system/pub/products/search?_query=${encodeURIComponent(query)}&_from=0&_to=11`
  const res = await fetch(url, { headers: FETCH_HEADERS })
  if (!res.ok) return null
  return res.json()
}

async function searchByBarcode(barcode: string): Promise<VtexProduct[] | null> {
  const url = `https://www.jumbo.cl/api/catalog_system/pub/products/search?fq=alternateId:${encodeURIComponent(barcode)}`
  const res = await fetch(url, { headers: FETCH_HEADERS })
  if (!res.ok) return null
  return res.json()
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: HEADERS })
  }

  try {
    const url = new URL(req.url)
    const barcode = url.searchParams.get('barcode')
    const query = url.searchParams.get('query')

    if (!barcode && !query) {
      return new Response(
        JSON.stringify({ error: 'Requiere barcode o query' }),
        { status: 400, headers: HEADERS }
      )
    }

    let raw: VtexProduct[] | null = null

    if (barcode) {
      raw = await searchByBarcode(barcode)
    } else {
      // Try intelligent search first, fall back to catalog
      raw = await searchIntelligent(query!)
      if (!raw || raw.length === 0) {
        raw = await searchCatalog(query!)
      }
    }

    const products = (raw || []).map(normalizeVtex).filter(Boolean)
    return new Response(JSON.stringify({ products }), { headers: HEADERS })
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err), products: [] }),
      { status: 200, headers: HEADERS }
    )
  }
})
