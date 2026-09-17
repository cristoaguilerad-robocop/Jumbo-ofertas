import { Routes, Route } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import { ThemeProvider } from './context/ThemeContext'
import NavBar from './components/NavBar'
import BackendBanner from './components/BackendBanner'
import Home from './pages/Home'
import Search from './pages/Search'
import ShoppingList from './pages/ShoppingList'
import ProductDetail from './pages/ProductDetail'
import SyncCatalog from './pages/SyncCatalog'

export default function App() {
  return (
    <ThemeProvider>
      <AppProvider>
        <div className="min-h-screen bg-canvas">
          <BackendBanner />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/search" element={<Search />} />
            <Route path="/list" element={<ShoppingList />} />
            <Route path="/product/:id" element={<ProductDetail />} />
            <Route path="/sync" element={<SyncCatalog />} />
          </Routes>
          <NavBar />
        </div>
      </AppProvider>
    </ThemeProvider>
  )
}
