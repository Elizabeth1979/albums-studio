import { useId } from 'react'

/**
 * Wires an "are you sure?" that opens in place of the button that asked.
 *
 * Focus goes to the safe choice, and that choice is described by the warning,
 * so a screen reader says both at once: "Keep it, button. Deleting this cannot
 * be undone." Left where it was, focus sits on a button that has just vanished,
 * and nothing tells a screen-reader user that a warning and two new buttons
 * are waiting. The safe choice rather than the destructive one, so a second
 * press of Enter keeps the thing instead of losing it.
 */
export function useConfirmation() {
  const warningId = useId()

  return {
    warning: { id: warningId },
    keep: { autoFocus: true, 'aria-describedby': warningId },
  }
}
