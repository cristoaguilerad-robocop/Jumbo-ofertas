import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth'
import {
  collection, doc, setDoc, deleteDoc, onSnapshot, serverTimestamp
} from 'firebase/firestore'
import { auth, db, isConfigured } from '../firebase'

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

  // Auth
  useEffect(() => {
    if (!isConfigured) {
      setAuthLoading(false)
      setShoppingList(loadLocalList())
      return
    }
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u)
      } else {
        try {
          await signInAnonymously(auth)
        } catch (err) {
          console.error('Auth error:', err)
        }
      }
      setAuthLoading(false)
    })
    return unsub
  }, [])

  // Firestore sync
  useEffect(() => {
    if (!isConfigured || !user) return

    const ref = collection(db, 'users', user.uid, 'shoppingList')
    const unsub = onSnapshot(ref, (snap) => {
      const items = {}
      snap.forEach(d => { items[d.id] = d.data() })
      setShoppingList(items)
    })
    return unsub
  }, [user])

  const addToList = useCallback(async (product) => {
    const item = {
      productId: product.id,
      name: product.name,
      category: product.category,
      barcode: product.barcode,
      regularPrice: product.regularPrice,
      priceWhenAdded: product.currentPrice,
      unit: product.unit,
      addedAt: new Date().toISOString(),
      targetPrice: null,
    }

    if (isConfigured && user) {
      await setDoc(doc(db, 'users', user.uid, 'shoppingList', product.id), {
        ...item,
        addedAt: serverTimestamp(),
      })
    } else {
      const updated = { ...shoppingList, [product.id]: item }
      setShoppingList(updated)
      saveLocalList(updated)
    }
  }, [user, shoppingList])

  const removeFromList = useCallback(async (productId) => {
    if (isConfigured && user) {
      await deleteDoc(doc(db, 'users', user.uid, 'shoppingList', productId))
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

  return (
    <AppContext.Provider value={{
      user,
      authLoading,
      shoppingList,
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
