import { Routes, Route } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import NavBar from './components/NavBar'
import Home from './pages/Home'
import Search from './pages/Search'
import ShoppingList from './pages/ShoppingList'
import ProductDetail from './pages/ProductDetail'

export default function App() {
  return (
    <AppProvider>
      <div className="min-h-screen bg-gray-950">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/search" element={<Search />} />
          <Route path="/list" element={<ShoppingList />} />
          <Route path="/product/:id" element={<ProductDetail />} />
        </Routes>
        <NavBar />
      </div>
    </AppProvider>
  )
}
