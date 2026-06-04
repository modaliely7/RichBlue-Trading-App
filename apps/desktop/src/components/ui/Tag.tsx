import type { ReactNode } from 'react'

type Tone = 'default' | 'accent' | 'success' | 'danger' | 'warn' | 'muted'

interface TagProps {
  children: ReactNode
  tone?: Tone
  clickable?: boolean
  onClick?: () => void
  leftIcon?: ReactNode
  rightIcon?: ReactNode
}

export function Tag({
  children,
  tone = 'default',
  clickable = false,
  onClick,
  leftIcon,
  rightIcon,
}: TagProps) {
  const classes = [
    'tag',
    tone !== 'default' ? `tone-${tone}` : '',
    clickable ? 'clickable' : '',
  ]
    .filter(Boolean)
    .join(' ')

  if (clickable) {
    return (
      <button className={classes} onClick={onClick} type="button">
        {leftIcon}
        {children}
        {rightIcon}
      </button>
    )
  }

  return (
    <span className={classes}>
      {leftIcon}
      {children}
      {rightIcon}
    </span>
  )
}
