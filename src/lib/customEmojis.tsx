import type { ReactNode } from 'react'

export const CUSTOM_EMOJIS = Array.from({ length: 85 }, (_, i) =>
  String(i + 1).padStart(3, '0')
)

export const GNOLICHKA_EMOJIS_SHORTCODES = CUSTOM_EMOJIS.map(name => `:${name}:`)

interface RenderOpts {
  /** Smaller custom-emoji <img> for compact contexts like the chat-list
   *  preview (`text-xs`, 16px line-height). Without this, 24px images blow
   *  up the row. */
  compact?: boolean
}

export function renderMessageContent(content: string, opts?: RenderOpts): ReactNode {
  if (!content) return content

  const sizeClass = opts?.compact ? 'w-4 h-4' : 'w-6 h-6'

  const parts = content.split(/(:[^:\n]+:)/g)

  return parts.map((part, i) => {
    if (part.startsWith(':') && part.endsWith(':')) {
      const name = part.slice(1, -1)
      if (CUSTOM_EMOJIS.includes(name)) {
        const src = `${import.meta.env.BASE_URL}gnolichka_emoji/${name}.png`
        return (
          <img
            key={i}
            src={src}
            alt={part}
            title={name}
            className={`inline-block ${sizeClass} mx-0.5 align-middle object-contain`}
          />
        )
      }
    }
    return part
  })
}
