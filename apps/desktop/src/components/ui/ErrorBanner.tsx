import { AlertCircle } from 'lucide-react'
import { Button } from './Button'

interface ErrorBannerProps {
  error: unknown
  onRetry?: () => void
}

function getMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'detail' in error) {
    return String((error as { detail: unknown }).detail)
  }
  return 'Something went wrong.'
}

export function ErrorBanner({ error, onRetry }: ErrorBannerProps) {
  return (
    <div className="errorBanner" role="alert">
      <AlertCircle size={18} className="icon" />
      <div className="message">{getMessage(error)}</div>
      {onRetry && (
        <Button variant="danger" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  )
}
