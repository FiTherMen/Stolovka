import { useNavigate } from 'react-router-dom'
import { useAuth } from '../state/auth'
import { DEMO_USERS } from './demoData'
import { demoSignIn, resetDemo } from './mockClient'

const ROLES: [string, string, string][] = [
  [DEMO_USERS.customer, 'Клієнт', '/'],
  [DEMO_USERS.chef, 'Кухар', '/kitchen'],
  [DEMO_USERS.admin, 'Адмін', '/admin'],
]

/** Панель демо: перемикання ролей і скидання тестових даних. */
export default function DemoBar() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const current = session?.user.id

  return (
    <div className="demo-bar">
      <span className="demo-label">Демо як:</span>
      <div className="demo-roles">
        {ROLES.map(([id, label, path]) => (
          <button
            key={id}
            className={current === id ? 'active' : ''}
            onClick={() => {
              demoSignIn(id)
              navigate(path)
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <button
        className="demo-reset"
        onClick={() => {
          resetDemo()
          demoSignIn(DEMO_USERS.customer)
          window.location.reload()
        }}
      >
        Скинути
      </button>
    </div>
  )
}
