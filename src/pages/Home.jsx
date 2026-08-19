import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getOnSaleProducts } from '../data/mockProducts'
import { useApp } from '../context/AppContext'
import { useNotifications } from '../hooks/useNotifications'
import { getOffers } from '../lib/catalogDb'
import { countCatalog } from '../lib/catalogSync'
import ProductCard from '../components/ProductCard'
import Logo from '../components/Logo'

const mockOffers = getOnSaleProducts().slice(0, 6)

export default function Home() {
  const navigate = useNavigate()
  const { shoppingList } = useApp()
  const { requestPermission, checkPriceDrops } = useNotifications()
  const [offerProducts, setOfferProducts] = useState(mockOffers)
  const [catalogCount, setCatalogCount] = useState(null)

  useEffect(() => {
    countCatalog().then(setCatalogCount)
    getOffers(6).then(offers => { if (offers?.length) setOfferProducts(offers) })
  }, [])

  useEffect(() => {
    const listSize = Object.keys(shoppingList).length
    if (listSize > 0) {
      requestPermission().then(perm => {
        if (perm === 'granted') checkPriceDrops(shoppingList)
      })
    }
  }, [shoppingList]) // eslint-disable-line

  const listCount = Object.keys(shoppingList).length
  const listOfferCount = Object.values(shoppingList).filter(item => {
    const p = offerProducts.find(op => op.id === item.productId)
    return !!p
  }).length

  return (
    <div className="min-h-screen bg-gray-950 pb-nav">
      {/* Header */}
      <div className="bg-gray-900 px-4 pt-safe pt-6 pb-6">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-2.5 mb-1">
            <Logo className="w-9 h-9 shrink-0" />
            <h1 className="text-2xl font-bold text-white">Jumbo Ofertas</h1>
          </div>
          <p className="text-gray-400 text-sm">Encuentra las mejores ofertas del día</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-6 space-y-6">
        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => navigate('/search')}
            className="bg-green-500 hover:bg-green-600 active:scale-95 transition-all rounded-2xl p-4 text-left"
          >
            <div className="text-2xl mb-2">🔍</div>
            <p className="text-white font-semibold text-sm">Buscar producto</p>
            <p className="text-green-100 text-xs mt-0.5">Por nombre o código</p>
          </button>

          <button
            onClick={() => navigate('/search?scanner=1')}
            className="bg-gray-800 hover:bg-gray-700 active:scale-95 transition-all rounded-2xl p-4 text-left"
          >
            <div className="text-2xl mb-2">📷</div>
            <p className="text-white font-semibold text-sm">Escanear código</p>
            <p className="text-gray-400 text-xs mt-0.5">Usa la cámara</p>
          </button>
        </div>

        {/* Catálogo: siempre accesible, cambia el mensaje según si ya se sincronizó */}
        <button
          onClick={() => navigate('/sync')}
          className={`w-full rounded-2xl p-4 flex items-center gap-3 text-left active:scale-[0.98] transition-all ${
            catalogCount > 0
              ? 'bg-gray-800 hover:bg-gray-750'
              : 'bg-green-500/10 border border-green-500/20'
          }`}
        >
          <div className="w-12 h-12 bg-green-500/10 rounded-xl flex items-center justify-center text-2xl shrink-0">
            📦
          </div>
          <div className="flex-1">
            <p className="text-white font-medium text-sm">
              {catalogCount > 0 ? 'Mi catálogo Jumbo' : 'Descargar catálogo completo'}
            </p>
            <p className="text-gray-400 text-xs mt-0.5">
              {catalogCount > 0
                ? `${catalogCount.toLocaleString('es-CL')} productos · toca para actualizar`
                : 'Busca entre todos los productos de Jumbo al instante'}
            </p>
          </div>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-gray-400">
            <path fillRule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
          </svg>
        </button>

        {/* List summary */}
        {listCount > 0 && (
          <button
            onClick={() => navigate('/list')}
            className="w-full bg-gray-800 rounded-2xl p-4 flex items-center gap-3 hover:bg-gray-750 active:scale-[0.98] transition-all text-left"
          >
            <div className="w-12 h-12 bg-green-500/10 rounded-xl flex items-center justify-center text-2xl shrink-0">
              📋
            </div>
            <div className="flex-1">
              <p className="text-white font-medium text-sm">
                Mi lista de compras
              </p>
              <p className="text-gray-400 text-xs mt-0.5">
                {listCount} {listCount === 1 ? 'producto' : 'productos'}
                {listOfferCount > 0 && (
                  <span className="text-orange-400 font-medium"> · {listOfferCount} en oferta</span>
                )}
              </p>
            </div>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-gray-400">
              <path fillRule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
            </svg>
          </button>
        )}

        {/* Offers section */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-white font-semibold">Ofertas de hoy</h2>
            <button
              onClick={() => navigate('/search?offers=1')}
              className="text-green-400 text-sm font-medium"
            >
              Ver todo
            </button>
          </div>
          <div className="space-y-2">
            {offerProducts.map(product => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
