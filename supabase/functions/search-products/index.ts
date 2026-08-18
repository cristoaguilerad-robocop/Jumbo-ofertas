import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const JUMBO_BASE = 'https://www.jumbo.cl/api/catalog_system/pub/products/search'
const HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
        discountHighlights: Array<{ name: string }>
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
  const isOnSale = currentPrice < regularPrice
  const discountPercent = isOnSale
    ? Math.round(((regularPrice - currentPrice) / regularPrice) * 100)
    : 0

  const category = p.categories?.[0]?.split('/')?.filter(Boolean).pop() || 'General'
  const imageUrl = item.images?.[0]?.imageUrl || null

  return {
    id: p.productId,
    name: p.productName,
    brand: p.brand,
    barcode: item.ean,
    category,
    imageUrl,
    currentPrice,
    regularPrice,
    isOnSale,
    discountPercent,
    isAvailable: offer.IsAvailable,
    source: 'jumbo',
  }
}

serve(async (req) => {
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
      vtexUrl = `${JUMBO_BASE}?fq=alternateId:${encodeURIComponent(barcode)}&sc=1`
    } else {
      vtexUrl = `${JUMBO_BASE}?_query=${encodeURIComponent(query!)}&_from=0&_to=11&sc=1`
    }

    const res = await fetch(vtexUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json',
      },
    })

    if (!res.ok) {
      throw new Error(`Jumbo API error: ${res.status}`)
    }

    const data: VtexProduct[] = await res.json()
    const products = data.map(normalize).filter(Boolean)

    return new Response(JSON.stringify({ products }), { headers: HEADERS })
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: HEADERS }
    )
  }
})
