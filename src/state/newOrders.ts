import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { addDays, todayIn } from '../lib/time'

/** Нові (ще не прийняті) замовлення кухаря на сьогодні й наперед: загальна кількість і по днях. Оновлюється кожні 30 с. */
export function useNewOrders(chefId: string | undefined, timezone: string) {
  const [byDate, setByDate] = useState<Record<string, number>>({})
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    if (!chefId) return
    const { data } = await supabase
      .from('orders')
      .select('delivery_date')
      .eq('chef_id', chefId)
      .eq('status', 'new')
      .gte('delivery_date', addDays(todayIn(timezone), -1))
    const counts: Record<string, number> = {}
    ;((data as { delivery_date: string }[]) ?? []).forEach((o) => (counts[o.delivery_date] = (counts[o.delivery_date] ?? 0) + 1))
    setByDate(counts)
    setLoaded(true)
  }, [chefId, timezone])

  useEffect(() => {
    void load()
    const timer = setInterval(load, 30_000)
    return () => clearInterval(timer)
  }, [load])

  const total = Object.values(byDate).reduce((a, b) => a + b, 0)
  return { byDate, total, loaded, reload: load }
}
