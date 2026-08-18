const JUMBO_BASE = 'https://www.jumbo.cl/api/catalog_system/pub/products/search'
const HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
}

interface VtexProduct {
  productId: string
  productName: string
  brand: string
  categories: string[]
  items: Array<{
    ean: string
    images: Array<{ imageUrl: string }>
    sellers: Array<{
      commertialOffer: {
        Price: number
        ListPrice: number
        IsAvailable: boolean
      }
    }>
  }>
}

function normalize(p: VtexProduct) {
  const item = p.items?.[0]
  if (!item) return null
  const offer = item.sellers?.[0]?.commertialOffer
  if (!offer) return null
  const currentPrice = Math.round(offer.Price)
  const regularPrice = Math.round(offer.ListPrice)
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
    imageUrl: item.images?.[0]?.imageUrl?.replace('-55-55', '-300-300') || null,
    currentPrice,
    regularPrice,
    isOnSale,
    discountPercent,
    isAvailable: offer.IsAvailable,
    unit: 'unidad',
    source: 'jumbo',
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

    if (!barcode && !query) {
      return new Response(
        JSON.stringify({ error: 'Requiere barcode o query' }),
        { status: 400, headers: HEADERS }
      )
    }

    let vtexUrl: string
    if (barcode) {
      vtexUrl = `${JUMBO_BASE}?fq=alternateId:${encodeURIComponent(barcode)}`
    } else {
      vtexUrl = `${JUMBO_BASE}?_query=${encodeURIComponent(query!)}&_from=0&_to=11`
    }

    const res = await fetch(vtexUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
        'Accept': 'application/json',
        'Referer': 'https://www.jumbo.cl/',
      },
    })

    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: `Jumbo API error: ${res.status}`, products: [] }),
        { status: 200, headers: HEADERS }
      )
    }

    const data: VtexProduct[] = await res.json()
    const products = data.map(normalize).filter(Boolean)

    return new Response(JSON.stringify({ products }), { headers: HEADERS })
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err), products: [] }),
      { status: 200, headers: HEADERS }
    )
  }
})
