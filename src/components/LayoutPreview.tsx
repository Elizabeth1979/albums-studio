/**
 * Placeholder tiles standing in for photographs that are not there yet.
 *
 * An empty album would otherwise be a heading over nothing, with no sense of
 * what it will become. The tiles are the arrangement the album will use, drawn
 * empty.
 */
export function LayoutPreview() {
  return (
    <div className="layout-preview" aria-hidden="true">
      {Array.from({ length: 9 }, (_, index) => (
        <span className="layout-tile" key={index} />
      ))}
    </div>
  )
}
