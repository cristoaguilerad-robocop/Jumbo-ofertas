import { useState } from 'react'
import { useApp } from '../context/AppContext'

const EMOJIS = ['🛒', '🎉', '🍿', '📅', '🥗', '🎂', '🍖', '🧹', '🏖️', '☕']

export default function ListSwitcher() {
  const {
    lists, activeList, activeListId,
    selectList, createList, renameList, deleteList, countsByList,
  } = useApp()

  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('🛒')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function submit(e) {
    e.preventDefault()
    if (!name.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      await createList(name, emoji)
      setName('')
      setEmoji('🛒')
      setCreating(false)
      setOpen(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(list) {
    const count = countsByList[list.id] || 0
    const message = count
      ? `¿Eliminar «${list.name}» y sus ${count} productos?`
      : `¿Eliminar «${list.name}»?`
    if (!window.confirm(message)) return
    await deleteList(list.id)
  }

  async function handleRename(list) {
    const next = window.prompt('Nuevo nombre para la lista', list.name)
    if (next?.trim()) await renameList(list.id, next)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 text-left w-full"
      >
        <span className="text-2xl shrink-0">{activeList?.emoji || '🛒'}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-xl font-bold text-white truncate">
            {activeList?.name || 'Mi lista'}
          </span>
        </span>
        <svg
          xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
          className={`w-5 h-5 text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        <>
          {/* Capa para cerrar tocando fuera, sin tapar la barra inferior. */}
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />

          <div className="absolute top-full left-0 right-0 mt-2 z-40 bg-gray-800 rounded-2xl shadow-xl border border-gray-700 overflow-hidden">
            <div className="max-h-64 overflow-y-auto">
              {lists.map(list => (
                <div
                  key={list.id}
                  className={`flex items-center gap-2 px-3 py-2.5 ${
                    list.id === activeListId ? 'bg-green-500/10' : ''
                  }`}
                >
                  <button
                    onClick={() => { selectList(list.id); setOpen(false) }}
                    className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                  >
                    <span className="text-lg shrink-0">{list.emoji || '🛒'}</span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm truncate ${
                        list.id === activeListId ? 'text-green-400 font-medium' : 'text-white'
                      }`}>
                        {list.name}
                      </span>
                      <span className="block text-gray-500 text-xs">
                        {countsByList[list.id] || 0} productos
                      </span>
                    </span>
                  </button>

                  <button
                    onClick={() => handleRename(list)}
                    className="shrink-0 w-8 h-8 rounded-lg text-gray-500 hover:text-gray-300 flex items-center justify-center"
                    aria-label={`Renombrar ${list.name}`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                      <path d="M2.695 14.763l-1.262 3.154a.5.5 0 0 0 .65.65l3.155-1.262a4 4 0 0 0 1.343-.885L17.5 5.5a2.121 2.121 0 0 0-3-3L3.58 13.42a4 4 0 0 0-.885 1.343Z" />
                    </svg>
                  </button>

                  {lists.length > 1 && (
                    <button
                      onClick={() => handleDelete(list)}
                      className="shrink-0 w-8 h-8 rounded-lg text-gray-500 hover:text-red-400 flex items-center justify-center"
                      aria-label={`Eliminar ${list.name}`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5Z" clipRule="evenodd" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="border-t border-gray-700">
              {creating ? (
                <form onSubmit={submit} className="p-3 space-y-2">
                  <div className="flex gap-1.5 flex-wrap">
                    {EMOJIS.map(e => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => setEmoji(e)}
                        className={`w-8 h-8 rounded-lg text-lg flex items-center justify-center ${
                          emoji === e ? 'bg-green-500/20 ring-1 ring-green-500' : 'bg-gray-700'
                        }`}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      autoFocus
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Ej: Carrete, Compra mensual"
                      maxLength={40}
                      className="flex-1 bg-gray-700 text-white rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500"
                    />
                    <button
                      type="submit"
                      disabled={!name.trim() || busy}
                      className="bg-green-500 disabled:opacity-40 text-white px-4 rounded-xl text-sm font-medium"
                    >
                      {busy ? '...' : 'Crear'}
                    </button>
                  </div>
                  {error && <p className="text-orange-400 text-xs">{error}</p>}
                  <button
                    type="button"
                    onClick={() => { setCreating(false); setError(null) }}
                    className="text-gray-400 text-xs underline"
                  >
                    Cancelar
                  </button>
                </form>
              ) : (
                <button
                  onClick={() => setCreating(true)}
                  className="w-full px-3 py-3 text-green-400 text-sm font-medium text-left hover:bg-gray-700/50"
                >
                  + Nueva lista
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
