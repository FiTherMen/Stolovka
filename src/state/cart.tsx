import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Dish, Slot } from '../types'

export interface CartLine {
  dish_id: string
  name: string
  price_cents: number
  chef_id: string
  chef_name: string
  qty: number
}

interface CartData {
  date: string | null
  slot: Slot | null
  lines: CartLine[]
}

interface CartState extends CartData {
  count: number
  total: number
  add: (dish: Dish, qty?: number) => void
  setQty: (dishId: string, qty: number) => void
  qtyOf: (dishId: string) => number
  setTarget: (date: string, slot: Slot) => void
  clear: () => void
}

const KEY = 'stolovka.cart.v1'
const CartContext = createContext<CartState | null>(null)

function load(): CartData {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as CartData
  } catch {
    /* порожній кошик */
  }
  return { date: null, slot: null, lines: [] }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<CartData>(load)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(data))
    } catch {
      /* приватний режим браузера */
    }
  }, [data])

  const value = useMemo<CartState>(() => {
    const setQty = (dishId: string, qty: number) =>
      setData((d) => ({
        ...d,
        lines: qty <= 0 ? d.lines.filter((l) => l.dish_id !== dishId) : d.lines.map((l) => (l.dish_id === dishId ? { ...l, qty } : l)),
      }))
    return {
      ...data,
      count: data.lines.reduce((s, l) => s + l.qty, 0),
      total: data.lines.reduce((s, l) => s + l.qty * l.price_cents, 0),
      qtyOf: (id) => data.lines.find((l) => l.dish_id === id)?.qty ?? 0,
      add: (dish, qty = 1) =>
        setData((d) => {
          const existing = d.lines.find((l) => l.dish_id === dish.id)
          if (existing) return { ...d, lines: d.lines.map((l) => (l.dish_id === dish.id ? { ...l, qty: l.qty + qty } : l)) }
          const line: CartLine = {
            dish_id: dish.id,
            name: dish.name,
            price_cents: dish.price_cents,
            chef_id: dish.chef_id,
            chef_name: dish.chefs?.display_name ?? '',
            qty,
          }
          return { ...d, lines: [...d.lines, line] }
        }),
      setQty,
      setTarget: (date, slot) => setData((d) => (d.date === date && d.slot === slot ? d : { ...d, date, slot })),
      clear: () => setData((d) => ({ ...d, lines: [] })),
    }
  }, [data])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart outside CartProvider')
  return ctx
}
