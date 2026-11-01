import { useRef, useState, type KeyboardEvent } from 'react'
import { Plate } from './Brand'

/** Галерея страви: велике кругле фото, свайп на телефоні, стрілки й крапки на компʼютері. */
export default function Gallery({ photos, alt }: { photos: string[]; alt: string }) {
  const [i, setI] = useState(0)
  const [dir, setDir] = useState<'next' | 'prev'>('next')
  const startX = useRef<number | null>(null)
  const many = photos.length > 1

  const go = (n: number) => {
    if (!many) return
    setDir(n > i || (i === photos.length - 1 && n === 0) ? 'next' : 'prev')
    setI((n + photos.length) % photos.length)
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') go(i - 1)
    if (e.key === 'ArrowRight') go(i + 1)
  }

  return (
    <div className="gallery">
      <div
        className="plate-stage"
        tabIndex={many ? 0 : undefined}
        onKeyDown={onKey}
        onTouchStart={(e) => (startX.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (startX.current == null) return
          const dx = e.changedTouches[0].clientX - startX.current
          startX.current = null
          if (Math.abs(dx) > 40) go(dx < 0 ? i + 1 : i - 1)
        }}
      >
        <div key={i} className={`gallery-slide ${dir}`}>
          <Plate src={photos[i]} alt={many ? `${alt}, фото ${i + 1} з ${photos.length}` : alt} />
        </div>
        {many && (
          <>
            <button type="button" className="gallery-arrow prev" onClick={() => go(i - 1)} aria-label="Попереднє фото">
              ‹
            </button>
            <button type="button" className="gallery-arrow next" onClick={() => go(i + 1)} aria-label="Наступне фото">
              ›
            </button>
            <span className="gallery-count">
              {i + 1} / {photos.length}
            </span>
          </>
        )}
      </div>
      {many && (
        <div className="gallery-dots">
          {photos.map((u, n) => (
            <button key={u} type="button" className={n === i ? 'active' : ''} onClick={() => go(n)} aria-label={`Фото ${n + 1}`} />
          ))}
        </div>
      )}
    </div>
  )
}
