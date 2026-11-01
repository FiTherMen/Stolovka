import { useState } from 'react'
import { chefTelegramLink, chefUrl, copyText, shareLink } from '../lib/share'
import type { Chef } from '../types'

/** Кнопки «Поділитися» для сторінки кухаря. compact — одна кругла кнопка в шапці. */
export default function ShareChef({ chef, compact }: { chef: Pick<Chef, 'display_name' | 'slug'>; compact?: boolean }) {
  const [note, setNote] = useState<string | null>(null)
  const url = chefUrl(chef.slug)
  const tgLink = chefTelegramLink(chef.slug)
  const text = `${chef.display_name}: домашня їжа на замовлення в Тарілці`

  const share = async () => {
    const r = await shareLink(url, text)
    setNote(r === 'copied' ? 'Посилання скопійовано' : r === 'failed' ? url : null)
  }
  const copy = async (value: string) => setNote((await copyText(value)) ? 'Скопійовано' : value)

  if (compact) {
    return (
      <div className="share-compact">
        <button type="button" className="btn small ghost" onClick={share}>
          Поділитися
        </button>
        {note && <span className="small muted">{note}</span>}
      </div>
    )
  }

  return (
    <div className="share-box">
      <div className="share-url">{url}</div>
      <div className="actions">
        <button type="button" className="btn small" onClick={share}>
          Поділитися
        </button>
        <button type="button" className="btn small ghost" onClick={() => copy(url)}>
          Копіювати посилання
        </button>
        {tgLink && (
          <button type="button" className="btn small ghost" onClick={() => copy(tgLink)}>
            Посилання для Telegram
          </button>
        )}
      </div>
      {note && <p className="small muted">{note}</p>}
    </div>
  )
}
