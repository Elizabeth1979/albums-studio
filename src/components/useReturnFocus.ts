import { type RefCallback, useEffect, useRef } from 'react'

type Opened = string | boolean | null

/**
 * Gives focus back to the button that opened something in place, once it closes.
 *
 * A form or an "are you sure?" that takes the place of the button pressed takes
 * focus with it when it goes: the control focus was on is gone, focus falls to
 * the page itself, and a keyboard or screen-reader user is sent back to the
 * top. So on close, focus returns to whatever opened it, and only when focus
 * was lost: a close that happens while the person is elsewhere on the page,
 * such as ticking another photo, leaves them where they are.
 *
 * `open` is what is open: true, or the id of the one of several that is. Each
 * button that opens it takes `ref={opener(id)}`, or `ref={opener()}` for true.
 */
export function useReturnFocus(open: Opened) {
  const openers = useRef(new Map<string | boolean, HTMLElement>())
  const previous = useRef<Opened>(open)

  useEffect(() => {
    const closed = previous.current
    previous.current = open
    if (open || !closed) return

    const active = document.activeElement
    if (active === null || active === document.body) openers.current.get(closed)?.focus()
  }, [open])

  return (id: string | boolean = true): RefCallback<HTMLElement> =>
    (element) => {
      if (element) openers.current.set(id, element)
      else openers.current.delete(id)
    }
}
