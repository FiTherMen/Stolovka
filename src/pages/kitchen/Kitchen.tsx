import { Link, NavLink, Route, Routes } from 'react-router-dom'
import { useAuth } from '../../state/auth'
import ChefRegister from './ChefRegister'
import KitchenDishes from './KitchenDishes'
import KitchenOrders from './KitchenOrders'
import KitchenProfile from './KitchenProfile'
import KitchenReviews from './KitchenReviews'
import DishForm from './DishForm'

export default function Kitchen() {
  const { session, chef, loading } = useAuth()

  if (loading) return <div className="page muted">Завантаження…</div>
  if (!session) {
    return (
      <div className="page center">
        <h1>Кабінет кухаря</h1>
        <p>Увійдіть, щоб продавати свої страви.</p>
        <Link className="btn" to="/login?next=/kitchen">
          Увійти
        </Link>
      </div>
    )
  }
  if (!chef) return <ChefRegister />

  return (
    <div className="page">
      <h1>Кухня · {chef.display_name}</h1>
      {chef.status === 'pending' && (
        <p className="notice warn">Ваша заявка чекає схвалення адміністратора. Поки що можна додати страви: клієнти побачать їх після схвалення.</p>
      )}
      {chef.status === 'rejected' && <p className="notice warn">Заявку відхилено. Напишіть адміністратору, якщо це помилка.</p>}
      {chef.status === 'suspended' && <p className="notice warn">Кабінет призупинено адміністратором, ваші страви приховані з меню.</p>}
      <nav className="tabs small">
        <NavLink end to="/kitchen" className="tab">
          Замовлення
        </NavLink>
        <NavLink to="/kitchen/dishes" className="tab">
          Страви
        </NavLink>
        <NavLink to="/kitchen/reviews" className="tab">
          Відгуки
        </NavLink>
        <NavLink to="/kitchen/profile" className="tab">
          Профіль
        </NavLink>
      </nav>
      <Routes>
        <Route index element={<KitchenOrders />} />
        <Route path="dishes" element={<KitchenDishes />} />
        <Route path="dishes/new" element={<DishForm />} />
        <Route path="dishes/:id" element={<DishForm />} />
        <Route path="reviews" element={<KitchenReviews />} />
        <Route path="profile" element={<KitchenProfile />} />
      </Routes>
    </div>
  )
}
