interface Props {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmModal({
  title,
  description,
  confirmLabel = 'Подтвердить',
  cancelLabel = 'Отмена',
  destructive = false,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-swamp-darker border border-frog-dark/40 rounded-3xl w-full max-w-sm p-6"
      >
        <p className="text-lily-green font-semibold text-base mb-2">{title}</p>
        {description && <p className="text-lily-green/60 text-sm mb-5">{description}</p>}
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-5 py-2 rounded-full border border-frog-dark/40 text-lily-green/80 hover:bg-frog-dark/20 transition-colors text-sm"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`px-5 py-2 rounded-full text-sm transition-colors ${
              destructive
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-frog-skin hover:bg-frog-dark text-swamp-darker'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
