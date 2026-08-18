import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { formatPrice } from '../data/mockProducts'
import OfferBadge from './OfferBadge'

const CATEGORY_EMOJIS = {
  'Lácteos': '🥛',
  'Carnes': '🥩',
  'Frutas y Verduras': '🥦',
  'Bebidas': '🥤',
  'Limpieza': '🧹',
  'Panadería': '🍞',
  'Snacks': '🍿',
  'Congelados': '🧊',
  'Despensa': '🥫',
  'Higiene': '🧴',
}

export default function ProductCard({ product, showAddButton = true, onSelect }) {
  const navigate = useNavigate()
  const { addToList, removeFromList, isInList } = useApp()
  const inList = isInList(product.id)

  const handleToggle = async (e) => {
    e.stopPropagation()
    if (inList) {
      await removeFromList(product.id)
    } else {
      await addToList(product)
    }
  }

  return (
    <div
      className="bg-gray-800 rounded-2xl p-4 flex items-center gap-3 cursor-pointer hover:bg-gray-750 active:scale-[0.98] transition-all"
      onClick={() => onSelect
        ? onSelect(product)
        : navigate(`/product/${product.id}`, { state: { product } })}
    >
      {/* Icon / Image */}
      {product.imageUrl ? (
        <img src={product.imageUrl} alt={product.name} className="w-12 h-12 rounded-xl object-contain shrink-0 bg-white p-1" />
      ) : (
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0 ${
          product.isOnSale ? 'bg-orange-500/10' : 'bg-gray-700'
        }`}>
          {CATEGORY_EMOJIS[product.category] || '🛒'}
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium leading-tight line-clamp-2">
          {product.name}
        </p>
        <p className="text-gray-400 text-xs mt-0.5">{product.category}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className={`text-sm font-bold ${product.isOnSale ? 'text-green-400' : 'text-white'}`}>
            {formatPrice(product.currentPrice)}
          </span>
          {product.isOnSale && (
            <span className="text-gray-500 text-xs line-through">
              {formatPrice(product.regularPrice)}
            </span>
          )}
          {product.isOnSale && <OfferBadge percent={product.discountPercent} />}
        </div>
      </div>

      {/* Add button */}
      {showAddButton && (
        <button
          onClick={handleToggle}
          className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all ${
            inList
              ? 'bg-green-500 text-white'
              : 'bg-gray-700 text-gray-400 hover:bg-green-500/20 hover:text-green-400'
          }`}
          aria-label={inList ? 'Quitar de lista' : 'Agregar a lista'}
        >
          {inList ? (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
            </svg>
          )}
        </button>
      )}
    </div>
  )
}
