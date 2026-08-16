import type { AlbumLayout } from '../lib/albums'

/**
 * Placeholder tiles standing in for photos that do not exist yet. An album
 * shell would otherwise look identical in both layouts, leaving the owner's
 * layout choice invisible until Phase 3 adds uploads.
 */
export function LayoutPreview({ layout }: { layout: AlbumLayout }) {
  return (
    <div className={`layout-preview layout-${layout}`} aria-hidden="true">
      {Array.from({ length: 9 }, (_, index) => (
        <span className={`layout-tile tile-${index % 3}`} key={index} />
      ))}
    </div>
  )
}
