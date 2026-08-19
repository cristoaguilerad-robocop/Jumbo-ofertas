import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { supabase, isConfigured } from '../supabase'

const AppContext = createContext(null)
const LS_LISTS = 'jumbo_lists'
const LS_ITEMS = 'jumbo_list_items'
const LS_ACTIVE = 'jumbo_active_list'

const DEFAULT_LIST = { id: 'local-default', name: 'Mi lista', emoji: '🛒' }

function loadLocal(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback }
}
function saveLocal(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* ignore */ }
}

/** Normaliza una fila de Supabase (snake_case) al formato de la app. */
function toItem(row) {
  const id = row.product_id ?? row.productId
  return {
    productId: id,
    listId: row.list_id ?? row.listId ?? null,
    name: row.name,
    category: row.category,
    barcode: row.barcode,
    regularPrice: row.regular_price ?? row.regularPrice,
    priceWhenAdded: row.price_when_added ?? row.priceWhenAdded,
    unit: row.unit,
    addedAt: row.added_at ?? row.addedAt,
    targetPrice: row.target_price ?? row.targetPrice ?? null,
    imageUrl: row.image_url ?? row.imageUrl ?? null,
  }
}

export function AppProvider({ children }) {
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [lists, setLists] = useState([DEFAULT_LIST])
  const [activeListId, setActiveListId] = useState(null)
  // Todos los productos de todas las listas, indexados por `${listId}:${productId}`.
  const [items, setItems] = useState({})

  // --- Sesión ---
  useEffect(() => {
    if (!isConfigured) {
      setAuthLoading(false)
      const storedLists = loadLocal(LS_LISTS, [DEFAULT_LIST])
      setLists(storedLists)
      setItems(loadLocal(LS_ITEMS, {}))
      setActiveListId(loadLocal(LS_ACTIVE, null) || storedLists[0]?.id || DEFAULT_LIST.id)
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

  const reload = useCallback(async (uid) => {
    const [listsRes, itemsRes] = await Promise.all([
      supabase.from('lists').select('*').eq('user_id', uid).order('created_at'),
      supabase.from('shopping_list').select('*').eq('user_id', uid),
    ])

    let rows = listsRes.data ?? []
    if (!rows.length) {
      const { data } = await supabase
        .from('lists')
        .insert({ user_id: uid, name: 'Mi lista', emoji: '🛒' })
        .select()
      rows = data ?? []
    }
    setLists(rows.length ? rows : [DEFAULT_LIST])
    setActiveListId(prev => (prev && rows.some(l => l.id === prev)) ? prev : rows[0]?.id ?? null)

    const next = {}
    for (const row of itemsRes.data ?? []) {
      const item = toItem(row)
      next[`${item.listId}:${item.productId}`] = item
    }
    setItems(next)
  }, [])

  // --- Carga y sincronización ---
  useEffect(() => {
    if (!isConfigured || !user) return
    reload(user.id)

    // Realtime es un extra: la interfaz ya se actualiza sola de forma
    // optimista, así que si la tabla no lo tiene habilitado no se nota.
    const channel = supabase.channel('listas')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'shopping_list', filter: `user_id=eq.${user.id}` },
        () => reload(user.id))
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [user, reload])

  const persistLocal = useCallback((nextItems, nextLists, nextActive) => {
    if (nextItems) saveLocal(LS_ITEMS, nextItems)
    if (nextLists) saveLocal(LS_LISTS, nextLists)
    if (nextActive) saveLocal(LS_ACTIVE, nextActive)
  }, [])

  // --- Listas ---
  const createList = useCallback(async (name, emoji = '🛒') => {
    const clean = name.trim()
    if (!clean) return null

    if (isConfigured && user) {
      const { data, error } = await supabase
        .from('lists')
        .insert({ user_id: user.id, name: clean, emoji })
        .select()
        .single()
      if (error) throw new Error(error.message)
      setLists(prev => [...prev, data])
      setActiveListId(data.id)
      return data
    }

    const local = { id: `local-${Date.now()}`, name: clean, emoji }
    setLists(prev => {
      const next = [...prev, local]
      persistLocal(null, next, local.id)
      return next
    })
    setActiveListId(local.id)
    return local
  }, [user, persistLocal])

  const renameList = useCallback(async (listId, name, emoji) => {
    const patch = {}
    if (name?.trim()) patch.name = name.trim()
    if (emoji) patch.emoji = emoji
    if (!Object.keys(patch).length) return

    setLists(prev => {
      const next = prev.map(l => (l.id === listId ? { ...l, ...patch } : l))
      if (!isConfigured || !user) persistLocal(null, next, null)
      return next
    })

    if (isConfigured && user) {
      await supabase.from('lists').update(patch).eq('id', listId).eq('user_id', user.id)
    }
  }, [user, persistLocal])

  const deleteList = useCallback(async (listId) => {
    setItems(prev => {
      const next = { ...prev }
      for (const key of Object.keys(next)) {
        if (next[key].listId === listId) delete next[key]
      }
      if (!isConfigured || !user) persistLocal(next, null, null)
      return next
    })

    setLists(prev => {
      const next = prev.filter(l => l.id !== listId)
      const safe = next.length ? next : [DEFAULT_LIST]
      if (!isConfigured || !user) persistLocal(null, safe, safe[0].id)
      setActiveListId(current => (current === listId ? safe[0].id : current))
      return safe
    })

    if (isConfigured && user) {
      await supabase.from('lists').delete().eq('id', listId).eq('user_id', user.id)
    }
  }, [user, persistLocal])

  const selectList = useCallback((listId) => {
    setActiveListId(listId)
    if (!isConfigured || !user) persistLocal(null, null, listId)
  }, [user, persistLocal])

  // --- Productos ---
  const addToList = useCallback(async (product, listId = activeListId) => {
    if (!listId) return

    const item = {
      productId: product.id,
      listId,
      name: product.name,
      category: product.category,
      barcode: product.barcode || null,
      regularPrice: product.regularPrice,
      priceWhenAdded: product.currentPrice,
      unit: product.unit || 'unidad',
      addedAt: new Date().toISOString(),
      targetPrice: null,
      imageUrl: product.imageUrl || null,
    }

    // Se refleja en pantalla de inmediato: esperar a que Supabase confirme (o
    // peor, a un evento de Realtime que puede no estar habilitado) obligaba a
    // recargar la página para ver el cambio.
    setItems(prev => {
      const next = { ...prev, [`${listId}:${product.id}`]: item }
      if (!isConfigured || !user) persistLocal(next, null, null)
      return next
    })

    if (isConfigured && user) {
      await supabase.from('shopping_list').upsert({
        user_id: user.id,
        list_id: listId,
        product_id: item.productId,
        name: item.name,
        category: item.category,
        barcode: item.barcode,
        regular_price: item.regularPrice,
        price_when_added: item.priceWhenAdded,
        unit: item.unit,
        added_at: item.addedAt,
        target_price: null,
        image_url: item.imageUrl,
      }, { onConflict: 'user_id,list_id,product_id' })
    }
  }, [user, activeListId, persistLocal])

  const removeFromList = useCallback(async (productId, listId = activeListId) => {
    setItems(prev => {
      const next = { ...prev }
      delete next[`${listId}:${productId}`]
      if (!isConfigured || !user) persistLocal(next, null, null)
      return next
    })

    if (isConfigured && user) {
      await supabase.from('shopping_list').delete()
        .eq('user_id', user.id).eq('list_id', listId).eq('product_id', productId)
    }
  }, [user, activeListId, persistLocal])

  const setTargetPrice = useCallback(async (productId, price, listId = activeListId) => {
    setItems(prev => {
      const key = `${listId}:${productId}`
      if (!prev[key]) return prev
      const next = { ...prev, [key]: { ...prev[key], targetPrice: price } }
      if (!isConfigured || !user) persistLocal(next, null, null)
      return next
    })

    if (isConfigured && user) {
      await supabase.from('shopping_list').update({ target_price: price })
        .eq('user_id', user.id).eq('list_id', listId).eq('product_id', productId)
    }
  }, [user, activeListId, persistLocal])

  // --- Derivados ---
  const shoppingList = useMemo(() => {
    const out = {}
    for (const item of Object.values(items)) {
      if (item.listId === activeListId) out[item.productId] = item
    }
    return out
  }, [items, activeListId])

  const countsByList = useMemo(() => {
    const counts = {}
    for (const item of Object.values(items)) {
      counts[item.listId] = (counts[item.listId] || 0) + 1
    }
    return counts
  }, [items])

  const isInList = useCallback(
    (productId, listId = activeListId) => !!items[`${listId}:${productId}`],
    [items, activeListId]
  )

  const activeList = lists.find(l => l.id === activeListId) || lists[0] || DEFAULT_LIST

  return (
    <AppContext.Provider value={{
      user, authLoading,
      lists, activeList, activeListId,
      selectList, createList, renameList, deleteList,
      countsByList,
      shoppingList, addToList, removeFromList, setTargetPrice, isInList,
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
