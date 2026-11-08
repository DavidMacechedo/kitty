// Touch swipes, without a library. Zones get `touch-action: pan-y pinch-zoom` (see
// styles.css [data-swipe], main) so the browser keeps vertical scrolling and zoom
// while we receive the horizontal movement as pointer events.
import { useEffect, useRef, type RefObject } from 'react'

export const SWIPE_MIN = 60 // px of horizontal travel
const SWIPE_RATIO = 1.5 // horizontal must dominate vertical by this much

/** 'left' = finger moved left. Null for taps, short drags and anything mostly vertical. */
export function classifySwipe(dx: number, dy: number): 'left' | 'right' | null {
  if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) <= SWIPE_RATIO * Math.abs(dy)) return null
  return dx < 0 ? 'left' : 'right'
}

interface SwipeOptions {
  onLeft?: () => void
  onRight?: () => void
  /** Gestures that start on an element matching this selector are left alone. */
  ignore?: string
}

/** Calls onLeft/onRight when a touch swipe ends on `ref`. */
export function useSwipe(ref: RefObject<HTMLElement | null>, options: SwipeOptions) {
  const latest = useRef(options)
  latest.current = options

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let start: { x: number; y: number; id: number } | null = null

    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return
      const { ignore } = latest.current
      if (ignore && (e.target as Element).closest(ignore)) return
      start = { x: e.clientX, y: e.clientY, id: e.pointerId }
    }
    const up = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return
      const dir = classifySwipe(e.clientX - start.x, e.clientY - start.y)
      start = null
      if (dir === 'left') latest.current.onLeft?.()
      if (dir === 'right') latest.current.onRight?.()
    }
    const cancel = () => (start = null)

    el.addEventListener('pointerdown', down)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', cancel)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', cancel)
    }
  }, [ref])
}
