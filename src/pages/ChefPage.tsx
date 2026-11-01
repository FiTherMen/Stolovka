import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Mark } from '../components/Brand'
import ShareChef from '../components/ShareChef'
import { supabase } from '../lib/supabase'
import { useAuth } from '../state/auth'
import type { Chef } from '../types'
import Menu from './Menu'

/** Публічна сторінка кухаря: /chef/<slug>. Лише його страви, замовляти можна прямо звідси. */
export default function ChefPage() {
  const { slug } = useParams()
  const { chef: me } = useAuth()
  const [chef, setChef] = useState<Chef | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!slug) return
    setLoading(true)
    supabase
      .from('chefs')
      .select('id, display_name, bio, photo_url, slug, status')
      .eq('slug', slug)
      .maybeSingle()
      .then(({ data }) => {
        setChef(data as Chef | null)
        setLoading(false)
        if (data) document.title = `${(data as Chef).display_name} · Тарілка`
      })
    return () => {
      document.title = 'Тарілка'
    }
  }, [slug])

  if (loading) return <div className="page muted">Завантаження…</div>
  if (!chef) {
    return (
      <div className="page center">
        <p>Такого кухаря не знайдено.</p>
        <Link className="btn" to="/">
          До меню
        </Link>
      </div>
    )
  }

  const header = (
    <div className="chef-hero">
      <div className="chef-avatar">{chef.photo_url ? <img src={chef.photo_url} alt="" /> : <Mark />}</div>
      <div className="grow">
        <h1>{chef.display_name}</h1>
        <p className="hand">готую з любовʼю, як для своїх</p>
        {chef.bio && <p className="small">{chef.bio}</p>}
        <ShareChef chef={chef} compact />
        {chef.status !== 'approved' && me?.id === chef.id && (
          <p className="notice warn small">Сторінку бачите лише ви: кабінет ще чекає схвалення адміністратора.</p>
        )}
      </div>
    </div>
  )

  return <Menu chefId={chef.id} header={header} />
}
