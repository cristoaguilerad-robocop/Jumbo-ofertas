import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase, isConfigured } from '../supabase'

const AppContext = createContext(null)
const LS_KEY = 'jumbo_list'

function loadLocalList() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') } catch { return {} }
}
function saveLocalList(list) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(list)) } catch { /* ignore */ }
}

export function AppProvider({ children }) {
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [rawList, setRawList] = useState({})

  useEffect(() => {
    if (!isConfigured) {
      setAuthLoading(false)
      setRawList(loadLocalList())
      return
    }
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUser(session.user)
        setAuthLoading(false)
        return
      }
      supabase.auth.signInAnonymously().then(({ data, error }) => {
        if (error) {
          // Sin esto el fallo era invisible y la app quedaba sin permisos de
          // escritura sin decir por qué.
          console.error(
            'No se pudo iniciar sesión anónima en Supabase:', error.message,
            '— revisa «Allow anonymous sign-ins» en Authentication.'
          )
        } else if (data?.user) {
          setUser(data.user)
        }
        setAuthLoading(false)
      })
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null))
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!isConfigured || !user) return
    supabase.from('shopping_list').select('*').eq('user_id', user.id).then(({ data }) => {
      if (!data) return
      const items = {}
      data.forEach(row => { items[row.product_id] = row })
      setRawList(items)
    })
    const channel = supabase.channel('list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_list', filter: `user_id=eq.${user.id}` }, () => {
        supabase.from('shopping_list').select('*').eq('user_id', user.id).then(({ data }) => {
          if (!data) return
          const items = {}
          data.forEach(row => { items[row.product_id] = row })
          setRawList(items)
        })
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [user])

  const addToList = useCallback(async (product) => {
    const item = {
      product_id: product.id,
      name: product.name,
      category: product.category,
      barcode: product.barcode || null,
      regular_price: product.regularPrice,
      price_when_added: product.currentPrice,
      unit: product.unit || 'unidad',
      added_at: new Date().toISOString(),
      target_price: null,
      image_url: product.imageUrl || null,
    }
    if (isConfigured && user) {
      await supabase.from('shopping_list').upsert({ ...item, user_id: user.id }, { onConflict: 'user_id,product_id' })
    } else {
      const updated = { ...rawList, [product.id]: item }
      setRawList(updated)
      saveLocalList(updated)
    }
  }, [user, rawList])

  const removeFromList = useCallback(async (productId) => {
    if (isConfigured && user) {
      await supabase.from('shopping_list').delete().eq('user_id', user.id).eq('product_id', productId)
    } else {
      const updated = { ...rawList }
      delete updated[productId]
      setRawList(updated)
      saveLocalList(updated)
    }
  }, [user, rawList])

  const setTargetPrice = useCallback(async (productId, price) => {
    if (isConfigured && user) {
      await supabase.from('shopping_list').update({ target_price: price }).eq('user_id', user.id).eq('product_id', productId)
    } else {
      const updated = { ...rawList, [productId]: { ...rawList[productId], target_price: price } }
      setRawList(updated)
      saveLocalList(updated)
    }
  }, [user, rawList])

  const isInList = useCallback((productId) => !!rawList[productId], [rawList])

  // Normalize Supabase rows to consistent shape
  const shoppingList = {}
  Object.values(rawList).forEach(item => {
    const id = item.product_id || item.productId
    shoppingList[id] = {
      productId: id,
      name: item.name,
      category: item.category,
      barcode: item.barcode,
      regularPrice: item.regular_price ?? item.regularPrice,
      priceWhenAdded: item.price_when_added ?? item.priceWhenAdded,
      unit: item.unit,
      addedAt: item.added_at ?? item.addedAt,
      targetPrice: item.target_price ?? item.targetPrice ?? null,
      imageUrl: item.image_url ?? item.imageUrl ?? null,
    }
  })

  return (
    <AppContext.Provider value={{ user, authLoading, shoppingList, addToList, removeFromList, setTargetPrice, isInList }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
