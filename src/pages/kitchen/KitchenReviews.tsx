import { useCallback, useEffect, useState } from 'react'
import { stars } from '../../lib/format'
import { errorText, supabase } from '../../lib/supabase'
import { useAuth } from '../../state/auth'
import type { Review } from '../../types'

export default function KitchenReviews() {
  const { chef } = useAuth()
  const [reviews, setReviews] = useState<Review[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!chef) return
    const { data } = await supabase.from('reviews').select('*, dishes(name)').eq('chef_id', chef.id).order('created_at', { ascending: false })
    setReviews((data as Review[]) ?? [])
  }, [chef])

  useEffect(() => {
    void load()
  }, [load])

  const reply = async (r: Review) => {
    const { error } = await supabase.rpc('reply_to_review', { p_review_id: r.id, p_reply: drafts[r.id] ?? '' })
    if (error) setError(errorText(error))
    void load()
  }

  const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0

  return (
    <div>
      {reviews.length > 0 && (
        <p>
          Середня оцінка: <span className="rating">{stars(avg)}</span> <b>{avg.toFixed(1)}</b> ({reviews.length})
        </p>
      )}
      {reviews.length === 0 && <p className="muted">Відгуків ще немає. Клієнти зможуть оцінити страву після статусу «Видано».</p>}
      {error && <p className="error">{error}</p>}
      {reviews.map((r) => (
        <div key={r.id} className={`card ${r.is_hidden ? 'dim' : ''}`}>
          <div>
            <span className="rating">{stars(r.rating)}</span> <b>{r.dishes?.name}</b>{' '}
            <span className="small muted">
              {r.author_name || 'Клієнт'}, {new Date(r.created_at).toLocaleDateString('uk-UA')}
              {r.is_hidden ? ' · приховано адміністратором' : ''}
            </span>
          </div>
          {r.body && <p>{r.body}</p>}
          {r.chef_reply ? (
            <p className="reply">Ваша відповідь: {r.chef_reply}</p>
          ) : (
            <div className="row">
              <input
                className="grow"
                placeholder="Відповісти клієнту"
                value={drafts[r.id] ?? ''}
                onChange={(e) => setDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
              />
              <button className="btn small" disabled={!drafts[r.id]} onClick={() => reply(r)}>
                Надіслати
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
