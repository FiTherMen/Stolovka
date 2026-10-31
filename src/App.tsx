import { useEffect } from 'react'
import { BrowserRouter, Link, MemoryRouter, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Gingham, Logo, NavIcons } from './components/Brand'
import DemoBar from './demo/DemoBar'
import { isDemo } from './lib/demo'
import { money } from './lib/format'
import { isConfigured } from './lib/supabase'
import { inTelegram, tg } from './lib/telegram'
import Admin from './pages/admin/Admin'
import Cart from './pages/Cart'
import DishPage from './pages/DishPage'
import Kitchen from './pages/kitchen/Kitchen'
import Login from './pages/Login'
import Menu from './pages/Menu'
import Orders from './pages/Orders'
import Privacy from './pages/Privacy'
import { AuthProvider, useAuth } from './state/auth'
import { CartProvider, useCart } from './state/cart'
import { useNewOrders } from './state/newOrders'
import { SettingsProvider, useSettings } from './state/settings'

function TelegramBackButton() {
  const location = useLocation()
  const navigate = useNavigate()
  useEffect(() => {
    const back = tg?.BackButton
    if (!inTelegram || !back) return
    const onClick = () => navigate(-1)
    if (location.pathname === '/') back.hide()
    else back.show()
    back.onClick(onClick)
    return () => back.offClick(onClick)
  }, [location.pathname, navigate])
  return null
}

function Shell() {
  const cart = useCart()
  const { isAdmin, session, chef } = useAuth()
  const { settings } = useSettings()
  const newOrders = useNewOrders(chef?.status === 'approved' ? chef.id : undefined, settings.timezone)
  const location = useLocation()
  const showFab = cart.count > 0 && location.pathname === '/'
  return (
    <>
      {isDemo && <DemoBar />}
      <header className="topbar">
        <Link to="/" className="logo" aria-label="Тарілка, на головну">
          <Logo />
        </Link>
        <div className="topbar-links">
          {isAdmin && <NavLink to="/admin">Адмінка</NavLink>}
          {!session && <NavLink to="/login">Увійти</NavLink>}
        </div>
      </header>
      <Gingham />
      {!isConfigured && (
        <p className="notice warn page">
          Застосунок ще не підключено до бази. Додайте VITE_SUPABASE_URL і VITE_SUPABASE_ANON_KEY (див. README).
        </p>
      )}
      <main className={showFab ? 'has-fab' : undefined}>
        <Routes>
          <Route path="/" element={<Menu />} />
          <Route path="/dish/:id" element={<DishPage />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/login" element={<Login />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/kitchen/*" element={<Kitchen />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<Menu />} />
        </Routes>
      </main>
      {showFab && (
        <Link to="/cart" className="cart-fab">
          <span className="count">{cart.count}</span>
          До кошика
          <span className="sum">{money(cart.total)}</span>
        </Link>
      )}
      <nav className="bottom-nav">
        <NavLink end to="/">
          {NavIcons.menu}Меню
        </NavLink>
        <NavLink to="/cart">
          {NavIcons.cart}Кошик{cart.count > 0 && <em className="badge-count">{cart.count}</em>}
        </NavLink>
        <NavLink to="/orders">
          {NavIcons.orders}Замовлення
        </NavLink>
        <NavLink to="/kitchen">
          {NavIcons.chef}Кухня{newOrders.total > 0 && <em className="badge-count">{newOrders.total}</em>}
        </NavLink>
        {isAdmin && (
          <NavLink to="/admin">
            {NavIcons.admin}Адмінка
          </NavLink>
        )}
      </nav>
      <TelegramBackButton />
    </>
  )
}

// Демо відкривається всередині іншої сторінки, тому адресу не змінюємо.
const Router = isDemo ? MemoryRouter : BrowserRouter

export default function App() {
  return (
    <Router>
      <SettingsProvider>
        <AuthProvider>
          <CartProvider>
            <Shell />
          </CartProvider>
        </AuthProvider>
      </SettingsProvider>
    </Router>
  )
}
