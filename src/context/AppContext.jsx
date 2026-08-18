import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase, isConfigured } from '../supabase'

const AppContext = createContext(null)

const LS_KEY = 'jumbo_list'

function loadLocalList() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveLocalList(list) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(list))
  } catch { /* ignore */ }
}

export function AppProvider({ children }) {
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [shoppingList, setShoppingList] = useState({})

  // Auth — anonymous session via Supabase
  useEffect(() => {
    if (!isConfigured) {
      setAuthLoading(false)
      setShoppingList(loadLocalList())
      return
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUser(session.user)
      } else {
        supabase.auth.signInAnonymously().then(({ data, error }) => {
          if (!error) setUser(data.user)
        })
      }
      setAuthLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Load list and subscribe to real-time changes
  useEffect(() => {
    if (!isConfigured || !user) return

    // Initial fetch
    supabase
      .from('shopping_list')
      .select('*')
      .eq('user_id', user.id)
      .then(({ data, error }) => {
        if (error) { console.error(error); return }
        const items = {}
        data.forEach(row => { items[row.product_id] = row })
        setShoppingList(items)
      })

    // Real-time subscription
    const channel = supabase
      .channel('shopping_list_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shopping_list', filter: `user_id=eq.${user.id}` },
        () => {
          // Re-fetch on any change
          supabase
            .from('shopping_list')
            .select('*')
            .eq('user_id', user.id)
            .then(({ data }) => {
              if (!data) return
              const items = {}
              data.forEach(row => { items[row.product_id] = row })
              setShoppingList(items)
            })
        }
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [user])

  const addToList = useCallback(async (product) => {
    const item = {
      product_id: product.id,
      name: product.name,
      category: product.category,
      barcode: product.barcode,
      regular_price: product.regularPrice,
      price_when_added: product.currentPrice,
      unit: product.unit,
      added_at: new Date().toISOString(),
    }

    if (isConfigured && user) {
      const { error } = await supabase
        .from('shopping_list')
        .upsert({ ...item, user_id: user.id }, { onConflict: 'user_id,product_id' })
      if (error) console.error(error)
    } else {
      const localItem = {
        productId: product.id,
        name: product.name,
        category: product.category,
        barcode: product.barcode,
        regularPrice: product.regularPrice,
        priceWhenAdded: product.currentPrice,
        unit: product.unit,
        addedAt: new Date().toISOString(),
      }
      const updated = { ...shoppingList, [product.id]: localItem }
      setShoppingList(updated)
      saveLocalList(updated)
    }
  }, [user, shoppingList])

  const removeFromList = useCallback(async (productId) => {
    if (isConfigured && user) {
      await supabase
        .from('shopping_list')
        .delete()
        .eq('user_id', user.id)
        .eq('product_id', productId)
    } else {
      const updated = { ...shoppingList }
      delete updated[productId]
      setShoppingList(updated)
      saveLocalList(updated)
    }
  }, [user, shoppingList])

  const isInList = useCallback((productId) => {
    return !!shoppingList[productId]
  }, [shoppingList])

  // Normalize Supabase rows to the same shape as local items
  const normalizedList = {}
  Object.values(shoppingList).forEach(item => {
    const id = item.product_id || item.productId
    normalizedList[id] = {
      productId: id,
      name: item.name,
      category: item.category,
      barcode: item.barcode,
      regularPrice: item.regular_price ?? item.regularPrice,
      priceWhenAdded: item.price_when_added ?? item.priceWhenAdded,
      unit: item.unit,
      addedAt: item.added_at ?? item.addedAt,
    }
  })

  return (
    <AppContext.Provider value={{
      user,
      authLoading,
      shoppingList: normalizedList,
      addToList,
      removeFromList,
      isInList,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
