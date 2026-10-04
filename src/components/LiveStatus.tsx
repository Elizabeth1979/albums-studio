import type { ReactNode } from 'react'

/**
 * Where a status message appears, so a screen reader says it. The live region stays on the page
 * and only what it holds changes: a region added together with its text is said by some screen
 * readers and not by others, which is how a message rendered only when there is something to say
 * goes unheard. Empty, it takes no space (see `.live-status` in index.css).
 */
export function LiveStatus({ children }: { children: ReactNode }) {
  return (
    <div className="live-status" role="status">
      {children}
    </div>
  )
}
