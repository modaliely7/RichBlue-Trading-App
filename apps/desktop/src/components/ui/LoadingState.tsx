interface LoadingStateProps {
  message?: string
  centered?: boolean
  size?: 'sm' | 'lg'
}

export function LoadingState({
  message = 'Loading…',
  centered = false,
  size = 'sm',
}: LoadingStateProps) {
  return (
    <div className={`loadingState ${centered ? 'centered' : ''}`}>
      <div className={`loadingSpinner ${size === 'lg' ? 'lg' : ''}`} />
      {message && <span>{message}</span>}
    </div>
  )
}
