import { describe, expect, it } from 'vitest'
import { classifySwipe } from './gestures'

describe('classifySwipe', () => {
  it('recognises clear horizontal swipes', () => {
    expect(classifySwipe(-120, 10)).toBe('left')
    expect(classifySwipe(90, -20)).toBe('right')
  })

  it('ignores taps and short drags', () => {
    expect(classifySwipe(0, 0)).toBeNull()
    expect(classifySwipe(-40, 0)).toBeNull()
  })

  it('ignores vertical scrolling and steep diagonals', () => {
    expect(classifySwipe(10, 300)).toBeNull()
    expect(classifySwipe(-80, 70)).toBeNull() // 80 <= 1.5 × 70
    expect(classifySwipe(-120, 70)).toBe('left') // 120 > 105
  })
})
