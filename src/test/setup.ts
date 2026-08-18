import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(cleanup)

/**
 * jsdom ships <dialog> without showModal or close, so a component that opens
 * one throws here while working perfectly in a browser.
 *
 * This is enough of the real thing for these tests: the open attribute follows
 * the calls, and closing fires the event React listens for. What it cannot
 * reproduce — the focus trap, Escape, and inert content behind — is exactly
 * what the browser provides, and is covered end to end instead.
 */
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true
  }

  HTMLDialogElement.prototype.close = function close(returnValue?: string) {
    if (!this.open) return

    this.open = false
    if (returnValue !== undefined) this.returnValue = returnValue
    this.dispatchEvent(new Event('close'))
  }
}
