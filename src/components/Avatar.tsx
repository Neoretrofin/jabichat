interface Props {
  src?: string | null
  size?: number
  className?: string
  fallback?: string
}

export default function Avatar({ src, size = 44, className = '', fallback = '🐸' }: Props) {
  const dimStyle = { width: size, height: size }
  const fontSize = Math.max(14, size * 0.45)

  if (src) {
    return (
      <img
        src={src}
        alt="avatar"
        style={dimStyle}
        className={`rounded-full object-cover border border-frog-skin/30 shrink-0 bg-frog-dark/30 ${className}`}
        onError={(e) => {
          // hide broken image — fall back to emoji
          ;(e.target as HTMLImageElement).style.display = 'none'
        }}
      />
    )
  }

  return (
    <div
      style={dimStyle}
      className={`rounded-full bg-frog-dark/30 border border-frog-skin/20 flex items-center justify-center shrink-0 ${className}`}
    >
      <span style={{ fontSize }}>{fallback}</span>
    </div>
  )
}
