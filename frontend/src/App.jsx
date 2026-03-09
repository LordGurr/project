import React, { useState, useEffect, createContext, useContext } from 'react';

// ============================================================================
// CONTEXT - Global State Management
// ============================================================================

const AppContext = createContext();

export const useApp = () => useContext(AppContext);

const API_BASE = '/flask/api';


// ============================================================================
// API Helper Functions
// ============================================================================

async function api(endpoint, options = {}) {
  const customerId = localStorage.getItem('customerId');
  
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...(customerId && { 'X-Customer-ID': customerId }),
      ...options.headers,
    },
    ...options,
  };
  
  if (options.body && typeof options.body === 'object') {
    config.body = JSON.stringify(options.body);
  }
  
  const res = await fetch(`${API_BASE}${endpoint}`, config);
  const data = await res.json();
  
  if (!res.ok) {
    throw new Error(data.error || 'API Error');
  }
  
  return data;
}

// ============================================================================
// COMPONENTS
// ============================================================================

// Header Component
function Header({ cartCount, currentPage, setCurrentPage, customer, onLogout, admin }) {
  return (
    <header style={styles.header}>
      <div style={styles.headerContent}>
        <h1 
          style={styles.logo} 
          onClick={() => setCurrentPage('products')}
        >
          🍫 Bosch
        </h1>
        
        <nav style={styles.nav}>
          <button 
            style={currentPage === 'products' ? styles.navButtonActive : styles.navButton}
            onClick={() => setCurrentPage('products')}
          >
            Products
          </button>
          
          {customer && (
            <button 
              style={currentPage === 'orders' ? styles.navButtonActive : styles.navButton}
              onClick={() => setCurrentPage('orders')}
            >
              My Orders
            </button>
          )}
          {customer && admin && (
            <button
              style={currentPage === 'admin' ? styles.navButtonActive : styles.navButton}
              onClick={() => setCurrentPage('admin')}
            >
              Admin
            </button>
          )}
          {customer && admin && (
            <button
              style={currentPage === 'admin_orders' ? styles.navButtonActive : styles.navButton}
              onClick={() => setCurrentPage('admin_orders')}
            >
              Edit Orders
            </button>
          )}
        </nav>
        
        <div style={styles.headerRight}>
          {customer ? (
            <div style={styles.userInfo}>
              <span style={styles.userName}>
                {customer.first_name || customer.email}
                {admin && <span style={styles.adminBadge}>ADMIN</span>}
              </span>
              <button style={styles.logoutButton} onClick={onLogout}>Logout</button>
            </div>
          ) : (
            <button 
              style={styles.loginButton}
              onClick={() => setCurrentPage('login')}
            >
              Login
            </button>
          )}
          
          <button 
            style={styles.cartButton}
            onClick={() => setCurrentPage('cart')}
          >
            🛒 {cartCount > 0 && <span style={styles.cartBadge}>{cartCount}</span>}
          </button>
        </div>
      </div>
    </header>
  );
}

// Product Card Component
function ProductCard({ product, onAddToCart, setCurrentPage, openProduct,loadCategories, loadProducts }) {
  const [adding, setAdding] = useState(false);

  //const[setSelectedProductId, setCurrentPage] = openProduct;

  const handleAdd = async () => {
    setAdding(true);
    await onAddToCart(product);
    await loadCategories();
    await loadProducts();
    setTimeout(() => setAdding(false), 500);
  };
  
  const priceKr = (product.price / 100).toFixed(2);
  const inStock = product.stock > 0;
  
  return (
    <div style={styles.productCard}>
      <div style={styles.productImage}>
        {product.category_name === 'Drinks' ? '🥤' : 
         product.category_name === 'Frozen Food' ? '🍕' :
         product.category_name === 'Ice Cream' ? '🍦' :
         product.category_name === 'MÄNNISKOR' ? '🧑' :
         product.category_name === 'Snacks' ? '🍿' : '🍫'}
      </div>
      
      <div style={styles.productInfo}>

        <button
          style={styles.productName}
          onClick={() => openProduct(product.id)}
        >
          {product.name}
        </button>

        <p style={styles.productCategory}>{product.category_name || 'Other'}</p>
        <p style={styles.productBarcode}>#{product.barcode}</p>
        
        <div style={styles.stockInfo}>
          <span style={inStock ? styles.inStock : styles.outOfStock}>
            {inStock ? `${product.stock} available` : 'Out of stock'}
          </span>
          {product.reserved_stock > 0 && (
            <span style={styles.reservedStock}> ({product.reserved_stock} reserved)</span>
          )}
        </div>
        
        <div style={styles.productFooter}>
          <span style={styles.productPrice}>{priceKr} kr</span>
          
          <button
            style={{
              ...styles.addButton,
              ...(adding && styles.addButtonAdding),
              ...(!inStock && styles.addButtonDisabled),
            }}
            onClick={handleAdd}
            disabled={!inStock || adding}
          >
            {adding ? '✓' : inStock ? 'Add' : 'Out of stock'}
          </button>
        </div>
        
        {product.stock > 0 && product.stock < 10 && (
          <p style={styles.lowStock}>Only {product.stock} left!</p>
        )}
        
        {product.average_rating && (
          <div style={styles.rating}>
            {[...Array(5)].map((_, i) => (
              <span
                key={i}
                style={{
                  color: i < Math.round(product.average_rating) ? "#f5c518" : "#d3d3d3"
                }}
              >
                ★
              </span>
            ))}
            <span style={styles.reviewCount}>
              ({product.review_count})
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// Products Page
function ProductsPage({ onAddToCart, openProduct }) {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  
  useEffect(() => {
    loadCategories();
  }, []);
  
  useEffect(() => {
    loadProducts();
  }, [search, categoryFilter, inStockOnly, page]);
  
  const loadCategories = async () => {
    try {
      const data = await api('/categories');
      setCategories(data.data);
    } catch (err) {
      console.error('Failed to load categories:', err);
    }
  };


  
  const loadProducts = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        per_page: '24',
        active: 'true',
      });
      
      if (search) params.append('search', search);
      if (categoryFilter) params.append('category_id', categoryFilter);
      if (inStockOnly) params.append('in_stock', 'true');
      
      const data = await api(`/products?${params}`);
      setProducts(data.data.products);
      setTotalPages(data.data.pages);
    } catch (err) {
      console.error('Failed to load products:', err);
    }
    setLoading(false);
  };
  
  return (
    <div style={styles.page}>
      {/* Filters */}
      <div style={styles.filters}>
        <input
          type="text"
          placeholder="Search products..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          style={styles.searchInput}
        />
        
        <select
          value={categoryFilter}
          onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
          style={styles.select}
        >
          <option value="">All Categories</option>
          {categories.map(cat => (
            <option key={cat.id} value={cat.id}>
              {cat.name} ({cat.product_count})
            </option>
          ))}
        </select>
        
        <label style={styles.checkbox}>
          <input
            type="checkbox"
            checked={inStockOnly}
            onChange={(e) => { setInStockOnly(e.target.checked); setPage(1); }}
          />
          In stock only
        </label>
      </div>
      
      {/* Products Grid */}
      {loading ? (
        <div style={styles.loading}>Loading...</div>
      ) : (
        <>
          <div style={styles.productsGrid}>
            {products.map(product => (
              <ProductCard
                key={product.id}
                product={product}
                onAddToCart={onAddToCart}
                openProduct={openProduct}
                loadCategories={loadCategories}
                loadProducts={loadProducts}
              />
            ))}
          </div>
          
          {products.length === 0 && (
            <div style={styles.empty}>No products found</div>
          )}
          
          {/* Pagination */}
          {totalPages > 1 && (
            <div style={styles.pagination}>
              <button
                style={styles.pageButton}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                ← Previous
              </button>
              <span style={styles.pageInfo}>Page {page} of {totalPages}</span>
              <button
                style={styles.pageButton}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function addHours (date = new Date(),hours) {  
  if (typeof hours !== 'number') {
    throw new Error('Invalid "hours" argument')
  }

  if (!(date instanceof Date)) {
    throw new Error('Invalid "date" argument')
  }

  date.setHours(date.getHours() + hours)

  return date
}

// Cart Page
function CartPage({ cart, onUpdateQuantity, onRemove, onCheckout, onExtendReservation, customer, setCurrentPage }) {
  const [checking, setChecking] = useState(false);
  
  if (!customer) {
    return (
      <div style={styles.page}>
        <div style={styles.emptyCart}>
          <h2>Please login to view your cart</h2>
          <button 
            style={styles.primaryButton}
            onClick={() => setCurrentPage('login')}
          >
            Login
          </button>
        </div>
      </div>
    );
  }
  
  if (!cart || cart.items.length === 0) {
    return (
      <div style={styles.page}>
        <div style={styles.emptyCart}>
          <h2>Your cart is empty</h2>
          <p>Add some snacks! 🍫</p>
          <button 
            style={styles.primaryButton}
            onClick={() => setCurrentPage('products')}
          >
            Browse Products
          </button>
        </div>
      </div>
    );
  }
  
  const handleCheckout = async () => {
    setChecking(true);
    const success = await onCheckout();
    setChecking(false);
    if (success) {
      setCurrentPage('orders');
    }
  };
  
  return (
    <div style={styles.page}>
      <h2 style={styles.pageTitle}>Shopping Cart</h2>
      <div style={styles.cartContainer}>
        <div style={styles.cartItems}>
          {cart.items.map(item => (
            <div key={item.id} style={styles.cartItem}>
              <div style={styles.cartItemInfo}>
                <h3 style={styles.cartItemName}>{item.product.name}</h3>
                <p style={styles.cartItemPrice}>
                  {(item.product.price / 100).toFixed(2)} kr each
                </p>
                {item.reserved_until && addHours(new Date(item.reserved_until), 1) > new Date() ? (
                  <p style={styles.reservedLabel}>
                    ✓ Reserved until {addHours(new Date(item.reserved_until), 1).toLocaleTimeString()}
                  </p>
                ) : (
                  <p style={styles.expiredLabel}>⚠️ Reservation expired {addHours(new Date(item.reserved_until), 1).toLocaleTimeString()}</p>
                )}
              </div>
              
              <div style={styles.cartItemControls}>
                <button
                  style={styles.qtyButton}
                  onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
                >
                  -
                </button>
                <span style={styles.qtyValue}>{item.quantity}</span>
                <button
                  style={styles.qtyButton}
                  onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                >
                  +
                </button>
              </div>
              
              <div style={styles.cartItemSubtotal}>
                {(item.subtotal / 100).toFixed(2)} kr
              </div>
              
              <button
                style={styles.removeButton}
                onClick={() => onRemove(item.id)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        
        <div style={styles.cartSummary}>
          <div style={styles.summaryRow}>
            <span>Items:</span>
            <span>{cart.item_count}</span>
          </div>
          <div style={styles.summaryTotal}>
            <span>Total:</span>
            <span>{cart.total_kr.toFixed(2)} kr</span>
          </div>
          
          <button
            style={styles.checkoutButton}
            onClick={handleCheckout}
            disabled={checking}
          >
            {checking ? 'Processing...' : 'Checkout'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Orders Page
function OrdersPage({ customer, setCurrentPage }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    if (customer) loadOrders();
  }, [customer]);
  
  const loadOrders = async () => {
    try {
      const data = await api('/orders');
      setOrders(data.data);
    } catch (err) {
      console.error('Failed to load orders:', err);
    }
    setLoading(false);
  };

  const statusColors = {
    confirmed: '#2196F3', // blue
    shipped: '#FF9800',   // orange
    delivered: '#4CAF50', // green
    cancelled: '#F44336', // red
  };
  
  if (!customer) {
    return (
      <div style={styles.page}>
        <div style={styles.emptyCart}>
          <h2>Please login to view orders</h2>
          <button 
            style={styles.primaryButton}
            onClick={() => setCurrentPage('login')}
          >
            Login
          </button>
        </div>
      </div>
    );
  }
  
  if (loading) {
    return <div style={styles.loading}>Loading orders...</div>;
  }
  
  return (
    <div style={styles.page}>
      <h2 style={styles.pageTitle}>My Orders</h2>
      
      {orders.length === 0 ? (
        <div style={styles.empty}>No orders yet</div>
      ) : (
        <div style={styles.ordersList}>
          {orders.map(order => (
            <div key={order.id} style={styles.orderCard}>
              <div style={styles.orderHeader}>
                <span style={styles.orderId}>Order #{order.id}</span>
                <span 
                  style={{
                    ...styles.orderStatus,
                    backgroundColor: statusColors[order.status] || '#999',
                  }}
                >
                  {order.status}
                </span>
              </div>
              
              <div style={styles.orderItems}>
                {order.items.map(item => (
                  <div key={item.id} style={styles.orderItem}>
                    <span>{item.quantity}x {item.product_name}</span>
                    <span>{item.subtotal_kr.toFixed(2)} kr</span>
                  </div>
                ))}
              </div>
              
              <div style={styles.orderFooter}>
                <span>{new Date(order.created_at).toLocaleDateString()}</span>
                <span style={styles.orderTotal}>{order.total_amount_kr.toFixed(2)} kr</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Admin Page - manage products and categories
function AdminPage({ setToast }) {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  const [categoryName, setCategoryName] = useState('');

  const emptyProduct = { id: null, name: '', barcode: '', price: '', stock: 0, category_id: '', active: true };
  const [productForm, setProductForm] = useState(emptyProduct);
  const [editingCategory, setEditingCategory] = useState(null);
  const [categoryEditName, setCategoryEditName] = useState('');
  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const c = await api('/categories');
      setCategories(c.data || []);
      const p = await api('/products?per_page=200');
      setProducts(p.data.products || []);
    } catch (err) {
      console.error('Admin load failed', err);
      setToast && setToast(err.message);
    }
    setLoading(false);
  };

  const handleCreateCategory = async (e) => {
    e.preventDefault();
    if (!categoryName) return;
    try {
      await api('/categories', { method: 'POST', body: { name: categoryName, description: 'Category' } });
      setCategoryName('');
      setToast('Category created');
      await loadAll();
    } catch (err) {
      setToast(err.message);
    }
  };

  const handleEditCategory = (cat) => {
    setEditingCategory(cat.id);
    setCategoryEditName(cat.name);
  };

  const handleSaveCategory = async (id) => {
    try {
      await api(`/categories/${id}`, {
        method: 'PUT',
        body: { name: categoryEditName }
      });

      setToast('Category updated');
      setEditingCategory(null);
      await loadAll();
    } catch (err) {
      setToast(err.message);
    }
  };

  const handleDeleteCategory = async (cat) => {
    if (!window.confirm(`Delete category "${cat.name}"?`)) return;

    try {
      await api(`/categories/${cat.id}`, { method: 'DELETE' });
      setToast('Category deleted');
      await loadAll();
    } catch (err) {
      setToast(err.message);
    }
  };

  const handleEditProduct = (p) => {
    setProductForm({
      id: p.id,
      name: p.name || '',
      barcode: p.barcode || '',
      price: (p.price / 100).toFixed(2),
      stock: p.stock || 0,
      category_id: p.category_id || '',
      active: !!p.active,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteProduct = async (p) => {
    if (!window.confirm(`Delete ${p.name}?`)) return;
    try {
      await api(`/products/${p.id}?hard=true`, { method: 'DELETE' });
      setToast('Product deleted');
      await loadAll();
    } catch (err) {
      setToast(err.message);
    }
  };

  const handleProductSubmit = async (e) => {
    e.preventDefault();
    try {
      const body = {
        name: productForm.name,
        barcode: productForm.barcode,
        price: Math.round(parseFloat(productForm.price || 0) * 100),
        stock: parseInt(productForm.stock || 0, 10),
        category_id: productForm.category_id || null,
        active: productForm.active,
      };

      if (productForm.id) {
        await api(`/products/${productForm.id}`, { method: 'PUT', body });
        setToast('Product updated');
      } else {
        await api('/products', { method: 'POST', body });
        setToast('Product created');
      }

      setProductForm(emptyProduct);
      await loadAll();
    } catch (err) {
      setToast(err.message);
    }
  };

  if (loading) return <div style={styles.loading}>Loading admin...</div>;

  return (
    <div style={styles.page}>
      <h2 style={styles.pageTitle}>Admin - Products & Categories</h2>

      <div style={{ display: 'flex', gap: '30px', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ marginBottom: 40 }}>
          <h3>Categories</h3>
          <form onSubmit={handleCreateCategory} style={{ display: 'flex', gap: '8px' }}>
            <input style={styles.input} placeholder="Category name" value={categoryName} onChange={(e) => setCategoryName(e.target.value)} />
            <button type="submit" style={styles.primaryButton}>Create</button>
          </form>
          {categories.map(cat => (
            <div key={cat.id} style={{
              display: 'flex',
              justifyContent: 'space-between',
              background: '#fff',
              padding: '10px',
              borderRadius: 8,
              marginBottom: 8
            }}>

              {editingCategory === cat.id ? (
                <>
                  <input
                    style={styles.input}
                    value={categoryEditName}
                    onChange={(e)=>setCategoryEditName(e.target.value)}
                  />

                  <div style={{display:'flex',gap:6}}>
                    <button
                      style={styles.pageButton}
                      onClick={()=>handleSaveCategory(cat.id)}
                    >
                      Save
                    </button>

                    <button
                      style={styles.pageButton}
                      onClick={()=>setEditingCategory(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <strong>{cat.name}</strong>
                    <div style={{fontSize:12,color:'#666'}}>
                      {cat.product_count} products
                    </div>
                  </div>

                  <div style={{display:'flex',gap:8}}>
                    <button
                      style={styles.pageButton}
                      onClick={()=>handleEditCategory(cat)}
                    >
                      Edit
                    </button>

                    <button
                      style={{...styles.pageButton,background:'#e94560'}}
                      onClick={()=>handleDeleteCategory(cat)}
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}

            </div>
          ))}
          </div>
          <h3>Products</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {products.map(p => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', background: '#fff', padding: '12px', borderRadius: 8, alignItems: 'center' }}>
                <div>
                  <strong>{p.name}</strong>
                  <div style={{ fontSize: 12, color: '#666' }}>{p.barcode} • {p.category_name || '—'} • {(p.price/100).toFixed(2)} kr • Stock: {p.stock}</div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button style={styles.pageButton} onClick={() => handleEditProduct(p)}>Edit</button>
                  <button style={{ ...styles.pageButton, backgroundColor: '#e94560' }} onClick={() => handleDeleteProduct(p)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ width: 380 }}>
          <h3 style={{ marginTop: 0 }}>{productForm.id ? 'Edit Product' : 'New Product'}</h3>
          <form onSubmit={handleProductSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: '#fff', padding: '20px', borderRadius: 8 }}>
            <input style={styles.input} placeholder="Name" value={productForm.name} onChange={(e) => setProductForm({...productForm, name: e.target.value})} required />
            <input style={styles.input} placeholder="Barcode" value={productForm.barcode} onChange={(e) => setProductForm({...productForm, barcode: e.target.value})} required />
            <input style={styles.input} placeholder="Price (kr)" type="number" step="0.01" value={productForm.price} onChange={(e) => setProductForm({...productForm, price: e.target.value})} required />
            <input style={styles.input} placeholder="Stock" type="number" value={productForm.stock} onChange={(e) => setProductForm({...productForm, stock: e.target.value})} />
            <select style={styles.select} value={productForm.category_id || ''} onChange={(e) => setProductForm({...productForm, category_id: e.target.value})}>
              <option value="">No category</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <label style={styles.checkbox}><input type="checkbox" checked={productForm.active} onChange={(e) => setProductForm({...productForm, active: e.target.checked})} /> Active</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="submit" style={styles.primaryButton}>{productForm.id ? 'Save' : 'Create'}</button>
              <button type="button" style={styles.pageButton} onClick={() => setProductForm(emptyProduct)}>Reset</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function AdminOrdersPage({ setToast }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const data = await api('/admin/orders');
      setOrders(data.data);
    } catch (err) {
      setToast(err.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const handleStatusChange = async (orderId, status) => {
    try {
      await api(`/admin/orders/${orderId}/status`, { 
        method: 'PUT', 
        body: { status } 
      });
      setToast('Order status updated');
      loadOrders();
    } catch (err) {
      setToast(err.message);
    }
  };

  if (loading) return <div style={styles.loading}>Loading orders...</div>;

  return (
    <div style={styles.page}>
      <h2 style={styles.pageTitle}>All Orders (Admin)</h2>

      {orders.length === 0 ? (
        <div>No orders yet</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {orders.map(order => (
            <div key={order.id} style={{ background: '#fff', padding: 12, borderRadius: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>Order #{order.id}</strong>
                <select 
                  value={order.status} 
                  onChange={(e) => handleStatusChange(order.id, e.target.value)}
                >
                  <option value="confirmed">Confirmed</option>
                  <option value="shipped">Shipped</option>
                  <option value="delivered">Delivered</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              <div style={{ marginTop: 6 }}>
                {order.items.map(item => (
                  <div key={item.id} style={{ fontSize: 14 }}>
                    {item.quantity}x {item.product_name} - {(item.subtotal_kr).toFixed(2)} kr
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 6, fontWeight: 'bold' }}>
                Total: {order.total_amount_kr.toFixed(2)} kr
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// Login/Register Page
function AuthPage({ onLogin, setCurrentPage }) {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      if (isRegister) {
        await api('/customers/register', {
          method: 'POST',
          body: { email, password, first_name: firstName, last_name: lastName },
        });
      }
      
      const data = await api('/customers/login', {
        method: 'POST',
        body: { email, password },
      });
      
      onLogin(data.data.customer, data.data.customer_id);
      setCurrentPage('products');
    } catch (err) {
      setError(err.message);
    }
    
    setLoading(false);
  };
  
  return (
    <div style={styles.page}>
      <div style={styles.authContainer}>
        <h2 style={styles.authTitle}>{isRegister ? 'Create Account' : 'Login'}</h2>
        
        <form onSubmit={handleSubmit} style={styles.authForm}>
          {isRegister && (
            <>
              <input
                type="text"
                placeholder="First Name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                style={styles.input}
              />
              <input
                type="text"
                placeholder="Last Name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                style={styles.input}
              />
            </>
          )}
          
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={styles.input}
            required
          />
          
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={styles.input}
            required
          />
          
          {error && <p style={styles.error}>{error}</p>}
          
          <button type="submit" style={styles.primaryButton} disabled={loading}>
            {loading ? 'Please wait...' : (isRegister ? 'Register' : 'Login')}
          </button>
        </form>
        
        <p style={styles.authSwitch}>
          {isRegister ? 'Already have an account? ' : "Don't have an account? "}
          <button
            style={styles.linkButton}
            onClick={() => setIsRegister(!isRegister)}
          >
            {isRegister ? 'Login' : 'Register'}
          </button>
        </p>
        
        <p style={styles.demoHint}>
          Demo: demo@example.com / password123
        </p>
      </div>
    </div>
  );
}

// Toast Notification
function Toast({ message, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);
  
  return (
    <div style={styles.toast}>
      {message}
    </div>
  );
}

// ============================================================================
// MAIN APP
// ============================================================================

export default function App() {
  const [currentPage, setCurrentPage] = useState('products');
  const [customer, setCustomer] = useState(null);
  const [cart, setCart] = useState({ items: [], total: 0, total_kr: 0, item_count: 0 });
  const [toast, setToast] = useState(null);
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [admin, setAdmin]= useState(false);

  const openProduct = (id) => {
    setSelectedProductId(id);
    setCurrentPage("product");
  };
  // Load saved session on mount
  useEffect(() => {
    const savedCustomerId = localStorage.getItem('customerId');
    const savedCustomer = localStorage.getItem('customer');
    
    if (savedCustomerId && savedCustomer) {
      setCustomer(JSON.parse(savedCustomer));
      loadCart();
      loadAdmin();
    }
  }, []);
  
  const loadAdmin = async () => {
    try {
      const data = await api('/customers/admin')
      setAdmin(data.data);
    } catch (err) {
      console.error('Failed to load admin:', err);
    }
  };

  const loadCart = async () => {
    
    try {
      await api('/cart/extend', {
        method: 'POST',
      });
      const data = await api('/cart');
      setCart(data.data);
    } catch (err) {
      console.error('Failed to load cart:', err);
    }
  };
  
  const handleLogin = (customerData, customerId) => {
    localStorage.setItem('customerId', customerId);
    localStorage.setItem('customer', JSON.stringify(customerData));
    setCustomer(customerData);
    loadCart();
    loadAdmin();
  };
  
  const handleLogout = () => {
    localStorage.removeItem('customerId');
    localStorage.removeItem('customer');
    setCustomer(null);
    setCart({ items: [], total: 0, total_kr: 0, item_count: 0 });
    setCurrentPage('products');
  };
  
  const handleAddToCart = async (product) => {
    if (!customer) {
      setCurrentPage('login');
      return;
    }
    
    try {
      await api('/cart', {
        method: 'POST',
        body: { product_id: product.id, quantity: 1 },
      });
      await api('/cart/extend', {
        method: 'POST',
      });
      await loadCart();
      setToast(`Added ${product.name} to cart!`);
    } catch (err) {
      setToast(err.message);
    }
  };
  
  const handleUpdateQuantity = async (itemId, quantity) => {
    try {
      if (quantity <= 0) {
        await api(`/cart/${itemId}`, { method: 'DELETE' });
      } else {
        await api(`/cart/${itemId}`, {
          method: 'PUT',
          body: { quantity },
        });
      }
      await loadCart();
    } catch (err) {
      setToast(err.message);
    }
  };
  
  const handleRemoveFromCart = async (itemId) => {
    try {
      await api(`/cart/${itemId}`, { method: 'DELETE' });
      await loadCart();
    } catch (err) {
      setToast(err.message);
    }
  };
  
  const handleCheckout = async () => {
    try {
      await api('/cart/checkout', { method: 'POST', body: {} });
      await loadCart();
      setToast('Order placed successfully! 🎉');
      return true;
    } catch (err) {
      setToast(err.message);
      return false;
    }
  };
  
  const handleExtendReservation = async () => {
    try {
      await api('/cart/extend', { method: 'POST' });
      await loadCart();
      setToast('Reservations extended! ⏱️');
    } catch (err) {
      setToast(err.message);
    }
  };

  return (
    <div style={styles.app}>
      <Header
        cartCount={cart.item_count}
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        customer={customer}
        onLogout={handleLogout}
        admin={admin}
      />
      
      <main style={styles.main}>
        {currentPage === 'products' && (
          <ProductsPage 
            onAddToCart={handleAddToCart}
            openProduct={openProduct}
          />
        )}
        
        {currentPage === 'cart' && (
          <CartPage
            cart={cart}
            onUpdateQuantity={handleUpdateQuantity}
            onRemove={handleRemoveFromCart}
            onCheckout={handleCheckout}
            onExtendReservation={handleExtendReservation}
            customer={customer}
            setCurrentPage={setCurrentPage}
          />
        )}
        
        {currentPage === 'orders' && (
          <OrdersPage customer={customer} setCurrentPage={setCurrentPage} />
        )}
        
        {currentPage === 'admin' && (
          <AdminPage setToast={setToast} />
        )}

        {currentPage === 'admin_orders' && (
          <AdminOrdersPage setToast={setToast} />
        )}

        {currentPage === 'login' && (
          <AuthPage onLogin={handleLogin} setCurrentPage={setCurrentPage} />
        )}

        {currentPage === 'product' && (
          <ProductPage
            productId={selectedProductId}
            onAddToCart={handleAddToCart}
            customer={customer}
            admin={admin}
          />
        )} 
      </main>
      
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}

function ProductPage({ productId, onAddToCart , customer, admin}) {
  const [product, setProduct] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');



  useEffect(() => {
    loadProduct();
    loadReviews();
  }, [productId]);


  

  const loadProduct = async () => {
    const data = await api(`/products/${productId}`);
    setProduct(data.data);
    setLoading(false);
  };

  const loadReviews = async () => {
    const data = await api(`/products/${productId}/reviews`);
    setReviews(data.data);
  };

  const submitReview = async () => {
    try {
      await api(`/products/${productId}/reviews`, {
        method: 'POST',
        body: {
          rating,
          title,
          comment
        }
      });

      setComment('');
      setTitle('');
      loadReviews();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDelete = async (review_id) => {
    if (!window.confirm('Delete this review?')) return;

    try {
      await api(`/reviews/${review_id}`, { method: 'DELETE' });
      loadReviews();
    } catch (err) {
      alert(err.message);
    }
  };

  if (loading || !product) return <div>Loading...</div>;

  return (
    <div style={styles.page}>
      <div style={styles.productPage}>
        <h2>{product.name}</h2>
        <div style={styles.productImage}>
          {product.category_name === 'Drinks' ? '🥤' : 
          product.category_name === 'Frozen Food' ? '🍕' :
          product.category_name === 'Ice Cream' ? '🍦' :
          product.category_name === 'Snacks' ? '🍿' : '🍫'}
        </div>
        <p>Barcode: {product.barcode}</p>
        <p>Price: {(product.price / 100).toFixed(2)} kr</p>
        <p>Stock: {product.stock}</p>

        <button
          style={styles.addButton}
          onClick={() => onAddToCart(product)}
        >
          Add to Cart
        </button>

        {product.average_rating && (
          <div style={styles.productRating}>
            <div style={styles.stars}>
              {[...Array(5)].map((_, i) => (
                <span
                  key={i}
                  style={{
                    color: i < Math.round(product.average_rating) ? "#f5c518" : "#d3d3d3"                  }}
                >
                  ★
                </span>
              ))}
            </div>
            <span style={styles.reviewCount}>
              ({product.review_count})
            </span>
          </div>
        )}
      </div>

      {/* Reviews */}
      <div style={styles.reviews}>
        <h3>Reviews</h3>

        {reviews.map(r => {
          const rating = r.rating;
          const maxStars = 5;

          return (
            <div key={r.id} style={styles.review}>
              <div style={styles.reviewHeader}>
                <h4 style={styles.reviewTitle}>{r.title}</h4>
                <span style={styles.reviewDate}>
                  {new Date(r.created_at).toLocaleDateString()}
                </span>
              </div>

              <div style={styles.reviewMeta}>
                <strong>{r.customer_name}</strong>

                <div style={styles.stars}>
                  {[...Array(maxStars)].map((_, i) => (
                    <span
                      key={i}
                      style={{
                        color: i < rating ? '#f5c518' : '#d3d3d3',
                        fontSize: '18px'
                      }}
                    >
                      ★
                    </span>
                  ))}
                </div>
              </div>

              <p style={styles.reviewComment}>{r.comment}</p>

              {customer && admin && (
                <button
                  style={styles.deleteReviewButton}
                  onClick={() => handleDelete(r.id)}
                >
                  Delete
                </button>
              )}
            </div>
          );
        })}

        {reviews.length === 0 && <p>No reviews yet.</p>}

        {/* Write Review */}
        <div style={styles.reviewForm}>
          <h4>Write Review</h4>

          <div style={styles.ratingContainer}>
            {[1, 2, 3, 4, 5].map((star) => (
              <span
                key={star}
                onClick={() => setRating(star)}
                style={{
                  ...styles.star,
                  color: star <= rating ? "#f5c518" : "#d3d3d3"
                }}
              >
                ★
              </span>
            ))}
          </div>

          <textarea
            placeholder="Write your title..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <textarea
            placeholder="Write your review..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />

          <button onClick={submitReview}>
            Submit Review
          </button>
        </div>
      </div>
    </div>
  );
}


// ============================================================================
// STYLES
// ============================================================================

const styles = {
  app: {
    minHeight: '100vh',
    backgroundColor: '#f5f5f5',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  
  // Header
  header: {
    backgroundColor: '#1a1a2e',
    color: 'white',
    padding: '0 20px',
    position: 'sticky',
    top: 0,
    zIndex: 100,
    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
  },
  headerContent: {
    maxWidth: '1200px',
    margin: '0 auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: '60px',
  },
  logo: {
    fontSize: '24px',
    fontWeight: 'bold',
    cursor: 'pointer',
    margin: 0,
  },
  nav: {
    display: 'flex',
    gap: '10px',
  },
  navButton: {
    background: 'transparent',
    border: 'none',
    color: '#aaa',
    fontSize: '14px',
    cursor: 'pointer',
    padding: '8px 16px',
    borderRadius: '4px',
  },
  navButtonActive: {
    background: 'rgba(255,255,255,0.1)',
    border: 'none',
    color: 'white',
    fontSize: '14px',
    cursor: 'pointer',
    padding: '8px 16px',
    borderRadius: '4px',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '15px',
  },
  userInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  userName: {
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  adminBadge: {
    backgroundColor: '#4CAF50',
    color: 'white',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '10px',
    fontWeight: 'bold',
  },
  loginButton: {
    background: '#4CAF50',
    border: 'none',
    color: 'white',
    padding: '8px 16px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  logoutButton: {
    background: 'transparent',
    border: '1px solid #666',
    color: '#aaa',
    padding: '4px 10px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
  },
  cartButton: {
    background: '#e94560',
    border: 'none',
    color: 'white',
    padding: '8px 16px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '16px',
    position: 'relative',
  },
  cartBadge: {
    position: 'absolute',
    top: '-5px',
    right: '-5px',
    background: '#fff',
    color: '#e94560',
    borderRadius: '50%',
    width: '20px',
    height: '20px',
    fontSize: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 'bold',
  },
  
  // Main Content
  main: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '20px',
  },
  page: {
    minHeight: 'calc(100vh - 100px)',
  },
  pageTitle: {
    fontSize: '28px',
    marginBottom: '20px',
    color: '#1a1a2e',
  },
  
  // Filters
  filters: {
    display: 'flex',
    gap: '15px',
    marginBottom: '20px',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    minWidth: '200px',
    padding: '10px 15px',
    border: '1px solid #ddd',
    borderRadius: '8px',
    fontSize: '14px',
  },
  select: {
    padding: '10px 15px',
    border: '1px solid #ddd',
    borderRadius: '8px',
    fontSize: '14px',
    backgroundColor: 'white',
  },
  checkbox: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    fontSize: '14px',
    color: '#666',
  },
  
  // Products Grid
  productsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
    gap: '20px',
  },
  productCard: {
    backgroundColor: 'white',
    borderRadius: '12px',
    overflow: 'hidden',
    boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
    transition: 'transform 0.2s, box-shadow 0.2s',
  },
  productImage: {
    height: '120px',
    backgroundColor: '#f8f8f8',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '48px',
  },
  productInfo: {
    padding: '15px',
  },
  productName: {
    fontSize: '16px',
    fontWeight: '600',
    margin: '0 0 5px 0',
    color: '#1a1a2e',
  },
  productCategory: {
    fontSize: '12px',
    color: '#888',
    margin: '0 0 5px 0',
  },
  productBarcode: {
    fontSize: '11px',
    color: '#aaa',
    margin: '0 0 10px 0',
  },
  stockInfo: {
    fontSize: '12px',
    marginBottom: '10px',
  },
  inStock: {
    color: '#4CAF50',
  },
  outOfStock: {
    color: '#f44336',
  },
  reservedStock: {
    color: '#ff9800',
  },
  productFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  productPrice: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#e94560',
  },
  addButton: {
    backgroundColor: '#4CAF50',
    color: 'white',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    transition: 'background 0.2s',
  },
  addButtonAdding: {
    backgroundColor: '#45a049',
  },
  addButtonDisabled: {
    backgroundColor: '#ccc',
    cursor: 'not-allowed',
  },
  lowStock: {
    fontSize: '12px',
    color: '#ff9800',
    margin: '8px 0 0 0',
  },
  rating: {
    fontSize: '12px',
    margin: '5px 0 0 0',
  },
  
  // Pagination
  pagination: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '15px',
    marginTop: '30px',
  },
  pageButton: {
    backgroundColor: '#1a1a2e',
    color: 'white',
    border: 'none',
    padding: '10px 20px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  pageInfo: {
    fontSize: '14px',
    color: '#666',
  },
  
  // Reservation
  reservationBanner: {
    backgroundColor: '#fff3e0',
    padding: '12px 20px',
    borderRadius: '8px',
    marginBottom: '20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  extendButton: {
    backgroundColor: '#ff9800',
    color: 'white',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  reservedLabel: {
    fontSize: '12px',
    color: '#4CAF50',
    margin: '5px 0 0 0',
  },
  expiredLabel: {
    fontSize: '12px',
    color: '#f44336',
    margin: '5px 0 0 0',
  },
  
  // Cart
  cartContainer: {
    display: 'grid',
    gridTemplateColumns: '1fr 300px',
    gap: '30px',
  },
  cartItems: {
    display: 'flex',
    flexDirection: 'column',
    gap: '15px',
  },
  cartItem: {
    backgroundColor: 'white',
    padding: '15px 20px',
    borderRadius: '10px',
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
    boxShadow: '0 2px 5px rgba(0,0,0,0.05)',
  },
  cartItemInfo: {
    flex: 1,
  },
  cartItemName: {
    fontSize: '16px',
    fontWeight: '600',
    margin: '0 0 5px 0',
  },
  cartItemPrice: {
    fontSize: '14px',
    color: '#666',
    margin: 0,
  },
  cartItemControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  qtyButton: {
    width: '30px',
    height: '30px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    backgroundColor: 'white',
    cursor: 'pointer',
    fontSize: '16px',
  },
  qtyValue: {
    fontSize: '16px',
    fontWeight: '600',
    minWidth: '30px',
    textAlign: 'center',
  },
  cartItemSubtotal: {
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#1a1a2e',
    minWidth: '80px',
    textAlign: 'right',
  },
  removeButton: {
    background: 'transparent',
    border: 'none',
    color: '#e94560',
    fontSize: '18px',
    cursor: 'pointer',
    padding: '5px',
  },
  cartSummary: {
    backgroundColor: 'white',
    padding: '20px',
    borderRadius: '10px',
    height: 'fit-content',
    position: 'sticky',
    top: '80px',
  },
  summaryRow: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '10px',
    color: '#666',
  },
  summaryTotal: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '20px',
    fontWeight: 'bold',
    borderTop: '1px solid #eee',
    paddingTop: '15px',
    marginTop: '15px',
    marginBottom: '20px',
  },
  checkoutButton: {
    width: '100%',
    backgroundColor: '#e94560',
    color: 'white',
    border: 'none',
    padding: '15px',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: 'bold',
    cursor: 'pointer',
  },
  emptyCart: {
    textAlign: 'center',
    padding: '60px 20px',
  },
  
  // Orders
  ordersList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  orderCard: {
    backgroundColor: 'white',
    borderRadius: '10px',
    overflow: 'hidden',
    boxShadow: '0 2px 5px rgba(0,0,0,0.05)',
  },
  orderHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '15px 20px',
    backgroundColor: '#f8f8f8',
    borderBottom: '1px solid #eee',
  },
  orderId: {
    fontWeight: 'bold',
  },
  orderStatus: {
    backgroundColor: '#4CAF50',
    color: 'white',
    padding: '3px 10px',
    borderRadius: '12px',
    fontSize: '12px',
    textTransform: 'capitalize',
  },
  orderItems: {
    padding: '15px 20px',
  },
  orderItem: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 0',
    borderBottom: '1px solid #f0f0f0',
  },
  orderFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '15px 20px',
    backgroundColor: '#fafafa',
  },
  orderTotal: {
    fontWeight: 'bold',
    fontSize: '18px',
  },
  
  // Auth
  authContainer: {
    maxWidth: '400px',
    margin: '40px auto',
    backgroundColor: 'white',
    padding: '40px',
    borderRadius: '12px',
    boxShadow: '0 2px 20px rgba(0,0,0,0.1)',
  },
  authTitle: {
    textAlign: 'center',
    marginBottom: '30px',
    color: '#1a1a2e',
  },
  authForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '15px',
  },
  input: {
    padding: '12px 15px',
    border: '1px solid #ddd',
    borderRadius: '8px',
    fontSize: '14px',
  },
  primaryButton: {
    backgroundColor: '#4CAF50',
    color: 'white',
    border: 'none',
    padding: '12px 20px',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    marginTop: '10px',
  },
  error: {
    color: '#e94560',
    fontSize: '14px',
    margin: 0,
  },
  authSwitch: {
    textAlign: 'center',
    marginTop: '20px',
    color: '#666',
  },
  linkButton: {
    background: 'none',
    border: 'none',
    color: '#4CAF50',
    cursor: 'pointer',
    textDecoration: 'underline',
  },
  demoHint: {
    textAlign: 'center',
    fontSize: '12px',
    color: '#999',
    marginTop: '15px',
  },
  
  // Toast
  toast: {
    position: 'fixed',
    bottom: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: '#1a1a2e',
    color: 'white',
    padding: '12px 24px',
    borderRadius: '8px',
    boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
    zIndex: 1000,
    animation: 'slideUp 0.3s ease',
  },
  
  // Utils
  loading: {
    textAlign: 'center',
    padding: '40px',
    color: '#666',
  },
  empty: {
    textAlign: 'center',
    padding: '40px',
    color: '#999',
  },
  productPage: {
  marginBottom: 40
  },
  reviews: {
    marginTop: 30
  },

  reviewForm: {
    marginTop: 20,
    display: "flex",
    flexDirection: "column",
    gap: 10
  },
  review: {
    border: "1px solid #e5e5e5",
    borderRadius: "10px",
    padding: "16px",
    marginBottom: "16px",
    backgroundColor: "#fff",
    boxShadow: "0 2px 6px rgba(0,0,0,0.05)"
  },

  reviewHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "6px"
  },

  reviewTitle: {
    margin: 0
  },

  reviewDate: {
    fontSize: "12px",
    color: "#888"
  },

  reviewMeta: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "8px"
  },

  stars: {
    letterSpacing: "2px"
  },

  reviewComment: {
    marginTop: "8px",
    lineHeight: "1.4"
  },
  ratingContainer: {
    display: "flex",
    gap: "4px",
    cursor: "pointer",
    fontSize: "24px",
    marginBottom: "10px"
  },

  star: {
    //transition: "color 0.2s",
  },

  productRating: {
  display: "flex",
  alignItems: "center",
  gap: "8px"
  },

  stars: {
    letterSpacing: "3px",
    fontSize: "26px",   // Bigger stars
    lineHeight: 1
  },

  reviewCount: {
    fontSize: "14px",
    color: "#666"
  },
  rating: {
    display: "flex",
    alignItems: "center",
    gap: "1px",
    fontSize: "26px",   // bigger stars
    letterSpacing: "1px"
  },

  reviewCount: {
    fontSize: "14px",
    color: "#666"
  },
  partialReservedLabel: {
    color: "#d97706",
    fontSize: "0.9rem"
  }
};
