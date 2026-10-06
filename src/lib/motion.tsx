'use client'

import { animate, stagger } from 'animejs'
import { useLayoutEffect, useRef, type DependencyList } from 'react'

/** Screens at least this wide show the login artwork and get the sign-in / sign-out transitions. */
export const isDesktop = () => window.matchMedia('(min-width: 768px)').matches

/**
 * Entrance animation: every `[data-reveal]` element under the returned ref fades and
 * lifts in, staggered in document order. Elements animate once; when `deps` change,
 * only elements added since (new rows, loaded cards) are animated.
 */
export function useReveal<T extends HTMLElement>(deps: DependencyList = []) {
  const ref = useRef<T>(null)

  useLayoutEffect(() => {
    const items = ref.current?.querySelectorAll<HTMLElement>('[data-reveal]:not([data-revealed])')
    if (!items?.length) return
    items.forEach((el) => el.setAttribute('data-revealed', ''))

    animate(items, {
      opacity: [0, 1],
      y: [14, 0],
      duration: 520,
      delay: stagger(40, { start: 30 }),
      ease: 'out(3)',
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return ref
}

/** Runs an entrance animation on the returned ref each time `active` becomes true. */
export function useEnter<T extends HTMLElement>(active: boolean, from: { y?: number; scale?: number } = {}) {
  const ref = useRef<T>(null)

  useLayoutEffect(() => {
    if (!active || !ref.current) return
    const animation = animate(ref.current, {
      opacity: [0, 1],
      y: [from.y ?? 0, 0],
      scale: [from.scale ?? 1, 1],
      duration: 320,
      ease: 'out(3)',
    })
    return () => {
      animation.pause()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  return ref
}

/** A number that counts up (or down) to its value whenever the value changes. */
export function AnimatedNumber({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const shown = useRef(0)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const state = { n: shown.current }
    el.textContent = String(Math.round(state.n))
    const animation = animate(state, {
      n: value,
      duration: 900,
      ease: 'out(4)',
      onUpdate: () => {
        shown.current = state.n
        el.textContent = String(Math.round(state.n))
      },
    })
    return () => {
      animation.pause()
    }
  }, [value])

  return <span ref={ref} aria-label={String(value)} />
}
