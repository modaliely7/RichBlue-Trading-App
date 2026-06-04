import type { ReactNode, ButtonHTMLAttributes } from 'react'

type Variant = 'default' | 'primary' | 'ghost' | 'danger' | 'success'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  iconOnly?: boolean
  loading?: boolean
  fullWidth?: boolean
  leftIcon?: ReactNode
  rightIcon?: ReactNode
}

export function Button({
  variant = 'default',
  size = 'md',
  iconOnly = false,
  loading = false,
  fullWidth = false,
  leftIcon,
  rightIcon,
  children,
  className = '',
  disabled,
  ...rest
}: ButtonProps) {
  const classes = [
    'btn',
    variant !== 'default' ? variant : '',
    size !== 'md' ? size : '',
    iconOnly ? 'icon-only' : '',
    fullWidth ? 'fullWidth' : '',
    loading ? 'loading' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button className={classes} disabled={disabled || loading} {...rest}>
      {loading ? <span className="loadingSpinner spinner-sm" /> : leftIcon}
      {!iconOnly && children}
      {rightIcon}
    </button>
  )
}
