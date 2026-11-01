/** Знак «миска під дахом» з брендбука Тарілки: дах, пара і миска. Колір береться з currentColor. */
export function Mark({ size = 32, steam }: { size?: number; steam?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <path d="M14 28 32 12 50 28" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M28 19.5c-2.6 2.4 2.6 4.4 0 7M36 19.5c-2.6 2.4 2.6 4.4 0 7"
        fill="none"
        stroke={steam ?? 'currentColor'}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path d="M8 33H56A24 19 0 0 1 8 33Z" fill="currentColor" />
      <path d="M24 57.5H40" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  )
}

export function Logo() {
  return (
    <span className="logo-lockup">
      <Mark size={34} />
      <span className="logo-text">
        <span className="logo-name">Тарілка</span>
        <span className="logo-tag">смачно, як удома</span>
      </span>
    </span>
  )
}

/** Смужка «скатертина в клітинку». */
export const Gingham = () => <div className="gingham" role="presentation" />

const icon = (children: React.ReactNode) => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
)

/** Іконки нижнього меню: лінія 2 px, як у брендбуку. */
export const NavIcons = {
  menu: icon(
    <>
      <path d="M3 11h18a9 9 0 0 1-18 0z" />
      <path d="M9 21h6" />
      <path d="M12 3c-1.5 2 1.5 3 0 5" />
    </>,
  ),
  cart: icon(
    <>
      <path d="M3 4h2l2.4 11h10.2L20 8H6.2" />
      <circle cx="9" cy="19.5" r="1.5" />
      <circle cx="17" cy="19.5" r="1.5" />
    </>,
  ),
  orders: icon(
    <>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </>,
  ),
  chef: icon(
    <>
      <path d="M7 14a4 4 0 1 1 2-7.5 4 4 0 0 1 6 0A4 4 0 1 1 17 14v6H7z" />
      <path d="M7 17h10" />
    </>,
  ),
  admin: icon(
    <>
      <path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z" />
      <path d="M9 12l2 2 4-4" />
    </>,
  ),
}

/** Кругле фото страви «на тарілці»; без фото показує миску на теплому тлі. */
export function Plate({ src, alt = '' }: { src?: string | null; alt?: string }) {
  return <span className="plate">{src ? <img src={src} alt={alt} loading="lazy" /> : NavIcons.menu}</span>
}
