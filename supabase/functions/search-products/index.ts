const HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
}

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'es-CL,es;q=0.9,en;q=0.8',
  'Referer': 'https://www.jumbo.cl/busca/?q=leche',
  'Origin': 'https://www.jumbo.cl',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin',
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

async function tryFetch(url: string): Promise<{ ok: boolean; status: number; body: string }> {
  try {
    const res = await fetch(url, { headers: FETCH_HEADERS })
    const body = await res.text()
    return { ok: res.ok, status: res.status, body }
  } catch (e) {
    return { ok: false, status: 0, body: String(e) }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: HEADERS })
  }

  try {
    const url = new URL(req.url)
    const barcode = url.searchParams.get('barcode')
    const query = url.searchParams.get('query')
    const debug = url.searchParams.get('debug') === '1'

    if (!barcode && !query) {
      return new Response(
        JSON.stringify({ error: 'Requiere barcode o query' }),
        { status: 400, headers: HEADERS }
      )
    }

    const attempts: Record<string, { status: number; count?: number; error?: string }> = {}
    let products: ReturnType<typeof normalizeVtex>[] = []

    if (barcode) {
      const barcodeUrl = `https://www.jumbo.cl/api/catalog_system/pub/products/search?fq=alternateId:${encodeURIComponent(barcode)}`
      const r = await tryFetch(barcodeUrl)
      attempts['barcode_catalog'] = { status: r.status }
      if (r.ok) {
        try {
          const raw: VtexProduct[] = JSON.parse(r.body)
          products = raw.map(normalizeVtex).filter(Boolean) as ReturnType<typeof normalizeVtex>[]
          attempts['barcode_catalog'].count = products.length
        } catch (e) { attempts['barcode_catalog'].error = String(e) }
      } else {
        attempts['barcode_catalog'].error = r.body.slice(0, 200)
      }
    } else {
      // Attempt 1: Catalog API with sc=1
      const catalogUrl = `https://www.jumbo.cl/api/catalog_system/pub/products/search?_query=${encodeURIComponent(query!)}&_from=0&_to=11&sc=1`
      const r1 = await tryFetch(catalogUrl)
      attempts['catalog_sc1'] = { status: r1.status }
      if (r1.ok) {
        try {
          const raw: VtexProduct[] = JSON.parse(r1.body)
          if (raw.length > 0) {
            products = raw.map(normalizeVtex).filter(Boolean) as ReturnType<typeof normalizeVtex>[]
            attempts['catalog_sc1'].count = products.length
          }
        } catch (e) { attempts['catalog_sc1'].error = String(e) }
      } else {
        attempts['catalog_sc1'].error = r1.body.slice(0, 200)
      }

      // Attempt 2: Catalog API without sc
      if (products.length === 0) {
        const catalogUrl2 = `https://www.jumbo.cl/api/catalog_system/pub/products/search?_query=${encodeURIComponent(query!)}&_from=0&_to=11`
        const r2 = await tryFetch(catalogUrl2)
        attempts['catalog_plain'] = { status: r2.status }
        if (r2.ok) {
          try {
            const raw: VtexProduct[] = JSON.parse(r2.body)
            if (raw.length > 0) {
              products = raw.map(normalizeVtex).filter(Boolean) as ReturnType<typeof normalizeVtex>[]
              attempts['catalog_plain'].count = products.length
            }
          } catch (e) { attempts['catalog_plain'].error = String(e) }
        } else {
          attempts['catalog_plain'].error = r2.body.slice(0, 200)
        }
      }

      // Attempt 3: Intelligent Search
      if (products.length === 0) {
        const isUrl = `https://www.jumbo.cl/api/io/_v/api/intelligent-search/product_search?query=${encodeURIComponent(query!)}&page=1&count=12&sort=score_desc&fuzzy=auto&hideUnavailableItems=false`
        const r3 = await tryFetch(isUrl)
        attempts['intelligent_search'] = { status: r3.status }
        if (r3.ok) {
          try {
            const json = JSON.parse(r3.body)
            const raw: VtexProduct[] = json.products || []
            if (raw.length > 0) {
              products = raw.map(normalizeVtex).filter(Boolean) as ReturnType<typeof normalizeVtex>[]
              attempts['intelligent_search'].count = products.length
            } else {
              attempts['intelligent_search'].error = `Empty products array. Keys: ${Object.keys(json).join(', ')}`
            }
          } catch (e) { attempts['intelligent_search'].error = String(e) }
        } else {
          attempts['intelligent_search'].error = r3.body.slice(0, 200)
        }
      }
    }

    const responseBody: Record<string, unknown> = { products }
    if (debug || products.length === 0) responseBody['_debug'] = attempts

    return new Response(JSON.stringify(responseBody), { headers: HEADERS })
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err), products: [] }),
      { status: 200, headers: HEADERS }
    )
  }
})
