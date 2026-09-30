import { useLanguage } from '@/lib/i18n'
import { AlertCircle, Trash2 } from 'lucide-react'
import { useState } from 'react'

interface ConfirmDeleteModalProps {
  isOpen: boolean
  title: string
  description: string
  itemName?: string
  isLoading?: boolean
  onConfirm: () => void
  onCancel: () => void
  confirmText?: string
  cancelText?: string
  isDangerous?: boolean
}

export default function ConfirmDeleteModal({
  isOpen,
  title,
  description,
  itemName,
  isLoading = false,
  onConfirm,
  onCancel,
  confirmText,
  cancelText,
  isDangerous = true,
}: ConfirmDeleteModalProps) {
  const { tr } = useLanguage()
  const [isVisible, setIsVisible] = useState(false)

  // Adjusting state during render (React's documented pattern for deriving
  // state from props) rather than in an effect: it avoids the extra commit
  // that made the modal flash before its open transition ran. isVisible stays
  // true briefly after isOpen goes false so the exit animation can play.
  if (isOpen && !isVisible) {
    setIsVisible(true)
  }

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onCancel()
      setTimeout(() => setIsVisible(false), 300)
    }
  }

  if (!isVisible) return null

  return (
    <>
      {/* Blurred Backdrop */}
      <div
        className={`fixed inset-0 backdrop-blur-sm transition-opacity duration-300 z-40 ${
          isOpen ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={handleBackdropClick}
      />

      {/* Modal */}
      <div
        className={`fixed inset-0 flex items-center justify-center z-50 p-4 pointer-events-none ${
          isOpen ? 'pointer-events-auto' : ''
        }`}
        onClick={handleBackdropClick}
      >
        <div
          className={`bg-white rounded-xl shadow-2xl max-w-sm w-full transform transition-all duration-300 pointer-events-auto ${
            isOpen
              ? 'opacity-100 scale-100 translate-y-0'
              : 'opacity-0 scale-95 translate-y-4'
          }`}
        >
          {/* Header */}
          <div className="flex items-center gap-3 p-6 border-b border-gray-200 bg-gradient-to-r from-red-50 to-red-50 rounded-t-xl">
            <div className="flex-shrink-0">
              <AlertCircle className="w-6 h-6 text-red-600 animate-pulse" />
            </div>
            <h2 className="text-lg font-semibold text-red-900">{title}</h2>
          </div>

          {/* Body */}
          <div className="p-6 space-y-4">
            <p className="text-gray-700 leading-relaxed">{description}</p>
            {itemName && (
              <div className="p-4 bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg border border-gray-200 transform transition-all hover:shadow-md">
                <p className="text-sm text-gray-600 font-medium mb-1">{tr('Item:', 'Item:')}</p>
                <p className="text-gray-900 font-semibold break-words line-clamp-2">{itemName}</p>
              </div>
            )}
            <p className="text-sm text-gray-500 italic">
              {tr('This action cannot be undone.', 'Tindakan ini tidak dapat dibatalkan.')}
            </p>
          </div>

          {/* Footer */}
          <div className="flex gap-3 p-6 border-t border-gray-200 bg-gray-50 rounded-b-xl">
            <button
              onClick={() => {
                onCancel()
                setTimeout(() => setIsVisible(false), 300)
              }}
              disabled={isLoading}
              className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-100 active:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-105 active:scale-95"
            >
              {cancelText || tr('Cancel', 'Batal')}
            </button>
            <button
              onClick={() => {
                onConfirm()
                setTimeout(() => setIsVisible(false), 300)
              }}
              disabled={isLoading}
              className={`flex-1 px-4 py-2.5 rounded-lg font-medium text-white flex items-center justify-center gap-2 transition-all duration-200 transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
                isDangerous
                  ? 'bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 shadow-lg hover:shadow-red-200/50 active:from-red-800 active:to-red-900'
                  : 'bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 shadow-lg hover:shadow-gray-200/50 active:from-gray-800 active:to-gray-900'
              }`}
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>{tr('Deleting...', 'Menghapus...')}</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 flex-shrink-0" />
                  <span>{confirmText || tr('Delete', 'Hapus')}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
