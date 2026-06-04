interface LogoProps {
  size?: 'sm' | 'md' | 'lg'
  showText?: boolean
}

const SIZES = {
  sm: { box: 24, fontSize: 11, gap: 8 },
  md: { box: 32, fontSize: 13, gap: 10 },
  lg: { box: 40, fontSize: 15, gap: 12 },
} as const

export function Logo({ size = 'md', showText = true }: LogoProps) {
  const { box, fontSize, gap } = SIZES[size]

  return (
    <div className="logo" style={{ gap }}>
      <div
        className="logoMark"
        style={{ width: box, height: box, fontSize }}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <rect x="3" y="14" width="4" height="7" rx="1" opacity="0.95" />
          <rect x="10" y="9" width="4" height="12" rx="1" opacity="0.95" />
          <rect x="17" y="4" width="4" height="17" rx="1" opacity="0.95" />
        </svg>
      </div>
      {showText && (
        <div className="logoText">
          <div className="logoTitle">RichBlue</div>
          <div className="logoSub">Trading Journal</div>
        </div>
      )}
    </div>
  )
}
