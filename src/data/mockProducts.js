export const CATEGORIES = [
  'Todos',
  'Lácteos',
  'Carnes',
  'Frutas y Verduras',
  'Bebidas',
  'Limpieza',
  'Panadería',
  'Snacks',
  'Congelados',
  'Despensa',
  'Higiene',
]

export const mockProducts = [
  // Lácteos
  { id: 'p001', name: 'Leche Loncoleche Entera 1L', barcode: '7806500001234', category: 'Lácteos', regularPrice: 1290, currentPrice: 990, isOnSale: true, discountPercent: 23, unit: 'unidad' },
  { id: 'p002', name: 'Yoghurt Soprole Frutilla 165g', barcode: '7801060002345', category: 'Lácteos', regularPrice: 690, currentPrice: 690, isOnSale: false, discountPercent: 0, unit: 'unidad' },
  { id: 'p003', name: 'Queso Gauda Colún 200g', barcode: '7804670003456', category: 'Lácteos', regularPrice: 2490, currentPrice: 1990, isOnSale: true, discountPercent: 20, unit: 'unidad' },
  { id: 'p004', name: 'Mantequilla Colún Sin Sal 250g', barcode: '7804670004567', category: 'Lácteos', regularPrice: 2890, currentPrice: 2890, isOnSale: false, discountPercent: 0, unit: 'unidad' },
  { id: 'p005', name: 'Crema Ácida Soprole 200ml', barcode: '7801060005678', category: 'Lácteos', regularPrice: 890, currentPrice: 690, isOnSale: true, discountPercent: 22, unit: 'unidad' },

  // Carnes
  { id: 'p006', name: 'Pechuga de Pollo kg', barcode: '2300000006789', category: 'Carnes', regularPrice: 4990, currentPrice: 3990, isOnSale: true, discountPercent: 20, unit: 'kg' },
  { id: 'p007', name: 'Lomo Vetado Vacuno kg', barcode: '2300000007890', category: 'Carnes', regularPrice: 12990, currentPrice: 12990, isOnSale: false, discountPercent: 0, unit: 'kg' },
  { id: 'p008', name: 'Salchicha Vienesa Súper 500g', barcode: '7802800008901', category: 'Carnes', regularPrice: 2490, currentPrice: 1890, isOnSale: true, discountPercent: 24, unit: 'unidad' },
  { id: 'p009', name: 'Filete de Merluza kg', barcode: '2300000009012', category: 'Carnes', regularPrice: 8990, currentPrice: 8990, isOnSale: false, discountPercent: 0, unit: 'kg' },
  { id: 'p010', name: 'Longaniza Alemana Don Pollo 500g', barcode: '7805220010123', category: 'Carnes', regularPrice: 3290, currentPrice: 2590, isOnSale: true, discountPercent: 21, unit: 'unidad' },

  // Frutas y Verduras
  { id: 'p011', name: 'Manzana Royal Gala kg', barcode: '2300000011234', category: 'Frutas y Verduras', regularPrice: 1490, currentPrice: 990, isOnSale: true, discountPercent: 34, unit: 'kg' },
  { id: 'p012', name: 'Tomate kg', barcode: '2300000012345', category: 'Frutas y Verduras', regularPrice: 1290, currentPrice: 1290, isOnSale: false, discountPercent: 0, unit: 'kg' },
  { id: 'p013', name: 'Palta Hass kg', barcode: '2300000013456', category: 'Frutas y Verduras', regularPrice: 3490, currentPrice: 2490, isOnSale: true, discountPercent: 29, unit: 'kg' },
  { id: 'p014', name: 'Lechuga Hidropónica un', barcode: '2300000014567', category: 'Frutas y Verduras', regularPrice: 990, currentPrice: 990, isOnSale: false, discountPercent: 0, unit: 'unidad' },
  { id: 'p015', name: 'Plátano kg', barcode: '2300000015678', category: 'Frutas y Verduras', regularPrice: 1190, currentPrice: 890, isOnSale: true, discountPercent: 25, unit: 'kg' },

  // Bebidas
  { id: 'p016', name: 'Coca-Cola 1.5L', barcode: '7501055300106', category: 'Bebidas', regularPrice: 1490, currentPrice: 1190, isOnSale: true, discountPercent: 20, unit: 'unidad' },
  { id: 'p017', name: 'Agua Vital 1.5L sin gas', barcode: '7804680017890', category: 'Bebidas', regularPrice: 690, currentPrice: 690, isOnSale: false, discountPercent: 0, unit: 'unidad' },
  { id: 'p018', name: 'Jugo Watt\'s Naranja 1L', barcode: '7803170018901', category: 'Bebidas', regularPrice: 1190, currentPrice: 890, isOnSale: true, discountPercent: 25, unit: 'unidad' },
  { id: 'p019', name: 'Cerveza Cristal 6-pack 350ml', barcode: '7804680019012', category: 'Bebidas', regularPrice: 4490, currentPrice: 3990, isOnSale: true, discountPercent: 11, unit: 'pack' },
  { id: 'p020', name: 'Néctar Livean Durazno 1L', barcode: '7803170020123', category: 'Bebidas', regularPrice: 990, currentPrice: 990, isOnSale: false, discountPercent: 0, unit: 'unidad' },

  // Limpieza
  { id: 'p021', name: 'Detergente Omo Líquido 3L', barcode: '7791290021234', category: 'Limpieza', regularPrice: 7990, currentPrice: 5990, isOnSale: true, discountPercent: 25, unit: 'unidad' },
  { id: 'p022', name: 'Limpiavidrios Procenex 500ml', barcode: '7809420022345', category: 'Limpieza', regularPrice: 1490, currentPrice: 1490, isOnSale: false, discountPercent: 0, unit: 'unidad' },
  { id: 'p023', name: 'Cloro Bro 1L', barcode: '7809420023456', category: 'Limpieza', regularPrice: 890, currentPrice: 690, isOnSale: true, discountPercent: 22, unit: 'unidad' },
  { id: 'p024', name: 'Esponja Scotch-Brite x2', barcode: '7500435024567', category: 'Limpieza', regularPrice: 1290, currentPrice: 1290, isOnSale: false, discountPercent: 0, unit: 'pack' },
  { id: 'p025', name: 'Suavizante Downy 1.5L', barcode: '7500435025678', category: 'Limpieza', regularPrice: 4990, currentPrice: 3490, isOnSale: true, discountPercent: 30, unit: 'unidad' },

  // Panadería
  { id: 'p026', name: 'Pan Molde Ideal Blanco 600g', barcode: '7806130026789', category: 'Panadería', regularPrice: 1890, currentPrice: 1590, isOnSale: true, discountPercent: 16, unit: 'unidad' },
  { id: 'p027', name: 'Marraqueta kg', barcode: '2300000027890', category: 'Panadería', regularPrice: 1590, currentPrice: 1590, isOnSale: false, discountPercent: 0, unit: 'kg' },
  { id: 'p028', name: 'Hallulla kg', barcode: '2300000028901', category: 'Panadería', regularPrice: 1590, currentPrice: 1190, isOnSale: true, discountPercent: 25, unit: 'kg' },

  // Snacks
  { id: 'p029', name: 'Papas Fritas Lays Classic 180g', barcode: '7501015929028', category: 'Snacks', regularPrice: 1990, currentPrice: 1490, isOnSale: true, discountPercent: 25, unit: 'unidad' },
  { id: 'p030', name: 'Galletas Oreo 176g', barcode: '7622210030140', category: 'Snacks', regularPrice: 1590, currentPrice: 1590, isOnSale: false, discountPercent: 0, unit: 'unidad' },
  { id: 'p031', name: 'Maní Sin Sal 200g', barcode: '7804680031253', category: 'Snacks', regularPrice: 1290, currentPrice: 990, isOnSale: true, discountPercent: 23, unit: 'unidad' },
  { id: 'p032', name: 'Chocolate Sublime 170g', barcode: '7613035032366', category: 'Snacks', regularPrice: 2490, currentPrice: 2490, isOnSale: false, discountPercent: 0, unit: 'unidad' },

  // Congelados
  { id: 'p033', name: 'Pizza Digiorno Queso 400g', barcode: '7806130033479', category: 'Congelados', regularPrice: 4990, currentPrice: 3990, isOnSale: true, discountPercent: 20, unit: 'unidad' },
  { id: 'p034', name: 'Papas Bastón McCain 750g', barcode: '7804680034592', category: 'Congelados', regularPrice: 2990, currentPrice: 2290, isOnSale: true, discountPercent: 23, unit: 'unidad' },
  { id: 'p035', name: 'Helado Savory Frutilla 1L', barcode: '7804680035605', category: 'Congelados', regularPrice: 3490, currentPrice: 3490, isOnSale: false, discountPercent: 0, unit: 'unidad' },

  // Despensa
  { id: 'p036', name: 'Arroz Tucapel 1kg', barcode: '7806500036718', category: 'Despensa', regularPrice: 1490, currentPrice: 1190, isOnSale: true, discountPercent: 20, unit: 'unidad' },
  { id: 'p037', name: 'Fideos Carozzi Spaghetti 400g', barcode: '7802900037831', category: 'Despensa', regularPrice: 890, currentPrice: 890, isOnSale: false, discountPercent: 0, unit: 'unidad' },
  { id: 'p038', name: 'Aceite Lirio 1L', barcode: '7804680038944', category: 'Despensa', regularPrice: 2990, currentPrice: 2490, isOnSale: true, discountPercent: 17, unit: 'unidad' },
  { id: 'p039', name: 'Atún Calvo Aceite 160g', barcode: '8410100039057', category: 'Despensa', regularPrice: 1290, currentPrice: 990, isOnSale: true, discountPercent: 23, unit: 'unidad' },
  { id: 'p040', name: 'Tomate Triturado Ñam 400g', barcode: '7806500040170', category: 'Despensa', regularPrice: 890, currentPrice: 890, isOnSale: false, discountPercent: 0, unit: 'unidad' },
  { id: 'p041', name: 'Lentejas El Olivar 500g', barcode: '7806500041283', category: 'Despensa', regularPrice: 1190, currentPrice: 890, isOnSale: true, discountPercent: 25, unit: 'unidad' },
  { id: 'p042', name: 'Azúcar Iansa 1kg', barcode: '7802900042396', category: 'Despensa', regularPrice: 1190, currentPrice: 1190, isOnSale: false, discountPercent: 0, unit: 'unidad' },
  { id: 'p043', name: 'Harina Selecta 1kg', barcode: '7806500043409', category: 'Despensa', regularPrice: 990, currentPrice: 790, isOnSale: true, discountPercent: 20, unit: 'unidad' },

  // Higiene
  { id: 'p044', name: 'Papel Higiénico Elite Doble Hoja x12', barcode: '7802900044512', category: 'Higiene', regularPrice: 5990, currentPrice: 4490, isOnSale: true, discountPercent: 25, unit: 'pack' },
  { id: 'p045', name: 'Shampoo Head & Shoulders 400ml', barcode: '7500435045625', category: 'Higiene', regularPrice: 4490, currentPrice: 4490, isOnSale: false, discountPercent: 0, unit: 'unidad' },
  { id: 'p046', name: 'Jabón Dove 90g x3', barcode: '7791290046738', category: 'Higiene', regularPrice: 2490, currentPrice: 1890, isOnSale: true, discountPercent: 24, unit: 'pack' },
  { id: 'p047', name: 'Pasta Dental Colgate Triple 90g', barcode: '7500435047851', category: 'Higiene', regularPrice: 2190, currentPrice: 1690, isOnSale: true, discountPercent: 23, unit: 'unidad' },
  { id: 'p048', name: 'Desodorante Rexona Men 150ml', barcode: '7791290048964', category: 'Higiene', regularPrice: 3490, currentPrice: 3490, isOnSale: false, discountPercent: 0, unit: 'unidad' },
  { id: 'p049', name: 'Toallitas Húmedas WC x40', barcode: '7806500049077', category: 'Higiene', regularPrice: 1490, currentPrice: 1190, isOnSale: true, discountPercent: 20, unit: 'pack' },
  { id: 'p050', name: 'Cepillo Dientes Oral-B Suave', barcode: '7500435050190', category: 'Higiene', regularPrice: 1990, currentPrice: 1990, isOnSale: false, discountPercent: 0, unit: 'unidad' },
]

export function searchProducts(query) {
  if (!query || query.trim() === '') return mockProducts
  const q = query.toLowerCase().trim()
  return mockProducts.filter(p =>
    p.name.toLowerCase().includes(q) ||
    p.category.toLowerCase().includes(q) ||
    p.barcode.includes(q)
  )
}

export function getProductByBarcode(barcode) {
  return mockProducts.find(p => p.barcode === barcode) || null
}

export function getProductById(id) {
  return mockProducts.find(p => p.id === id) || null
}

export function getOnSaleProducts() {
  return mockProducts.filter(p => p.isOnSale)
}

export function getProductsByCategory(category) {
  if (!category || category === 'Todos') return mockProducts
  return mockProducts.filter(p => p.category === category)
}

export function formatPrice(price) {
  return `$${price.toLocaleString('es-CL')}`
}
