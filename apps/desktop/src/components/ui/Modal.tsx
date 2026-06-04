import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { Button } from './Button'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
}

export function Modal({ open, onClose, title, children, footer, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const maxWidth = size === 'sm' ? 380 : size === 'lg' ? 720 : 520

  return (
    <div
      className="modalOverlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="modal" style={{ maxWidth }} role="dialog" aria-modal="true">
        {title && (
          <div className="cardHeader" style={{ padding: '0 0 16px', borderBottom: 'none' }}>
            <h2 className="h3" style={{ flex: 1 }}>{title}</h2>
            <Button variant="ghost" size="sm" iconOnly onClick={onClose} aria-label="Close">
              <X size={16} />
            </Button>
          </div>
        )}
        <div>{children}</div>
        {footer && (
          <div className="cardFooter" style={{ marginTop: 20, padding: '12px 0 0' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
