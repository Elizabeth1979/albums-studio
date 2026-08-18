import { type RefObject, useEffect, useRef } from 'react'

/**
 * Drives a native <dialog> from a boolean.
 *
 * showModal is what gives a focus trap, Escape, content behind made inert, and
 * focus returned to whatever opened it. All of that is the platform's to get
 * right, and laborious to reproduce with a div — so both modals here are real
 * dialogs, and this is the one place that opens and closes them.
 */
export function useModalDialog(open: boolean): RefObject<HTMLDialogElement | null> {
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const element = dialog.current
    if (!element) return

    // Guarded both ways: showModal on an open dialog throws, and close on a
    // closed one fires a stray cancel.
    if (open && !element.open) element.showModal()
    if (!open && element.open) element.close()
  }, [open])

  return dialog
}
