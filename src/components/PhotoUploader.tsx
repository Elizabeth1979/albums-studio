import { type ChangeEvent, type DragEvent, useId, useRef, useState } from 'react'
import { UNIVERSAL_FORMATS } from '../lib/imaging/formats'
import type { UploadItem } from '../lib/uploads'

type PhotoUploaderProps = {
  items: UploadItem[]
  busy: boolean
  onFiles: (files: File[]) => void
  onDismiss: () => void
}

const STATUS_LABELS: Record<UploadItem['status'], string> = {
  waiting: 'Waiting',
  processing: 'Preparing',
  uploading: 'Uploading',
  done: 'Added',
  failed: 'Failed',
}

export function PhotoUploader({ items, busy, onFiles, onDismiss }: PhotoUploaderProps) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  function take(files: FileList | null) {
    const chosen = Array.from(files ?? [])
    if (chosen.length > 0) onFiles(chosen)
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    take(event.target.files)
    // Clearing lets the same file be chosen again after a failure.
    event.target.value = ''
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    take(event.dataTransfer.files)
  }

  const finished = items.filter((item) => item.status === 'done').length
  const failed = items.filter((item) => item.status === 'failed')
  const settled = items.length > 0 && !busy

  return (
    <section className="uploader" aria-labelledby="uploader-title">
      <h2 id="uploader-title">Add photos</h2>

      {/* The button is the real control, so this works by tap on a phone where
          there is nothing to drag. The drop zone is an enhancement for desktop
          and is not the only way in. */}
      <div
        className={dragging ? 'drop-zone dragging' : 'drop-zone'}
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        {/* `accept="image/*"` is load-bearing, not decoration. It is what makes
            iOS convert a HEIC photo to JPEG as it hands the file over, which is
            why iPhone owners never meet the HEIC problem. Do not narrow it to a
            list, and in particular do not add `image/heic`: Safari 17 reads
            that as permission to convert *into* HEIC, which breaks the very
            case the attribute is here to handle. */}
        <input
          ref={inputRef}
          id={inputId}
          className="visually-hidden"
          type="file"
          accept="image/*"
          multiple
          onChange={handleChange}
        />
        <label className="primary-button choose-photos" htmlFor={inputId}>
          Choose photos
        </label>
        <p className="drop-hint">
          Photos are resized in your browser before they are uploaded, so only the
          smaller copy leaves your device.
        </p>
        <p className="drop-formats">
          {UNIVERSAL_FORMATS} work everywhere. iPhone photos convert as you add them.
        </p>
      </div>

      {items.length > 0 && (
        <div className="upload-progress">
          <p aria-live="polite">
            {busy
              ? `Adding ${finished} of ${items.length}…`
              : `Added ${finished} of ${items.length}.`}
          </p>

          <ul className="upload-list">
            {items.map((item) => (
              <li className={`upload-item status-${item.status}`} key={item.id}>
                <span className="upload-name">{item.fileName}</span>
                <span className="upload-status">{STATUS_LABELS[item.status]}</span>
                {item.error && <span className="upload-error">{item.error}</span>}
              </li>
            ))}
          </ul>

          {failed.length > 0 && (
            <p className="form-message error" role="alert">
              {failed.length === 1
                ? '1 photo could not be added.'
                : `${failed.length} photos could not be added.`}{' '}
              {failed.every((item) => item.permanent)
                ? 'Retrying will not help; see the reason above.'
                : 'Choosing them again will try once more.'}
            </p>
          )}

          {settled && (
            <button className="text-button" type="button" onClick={onDismiss}>
              Clear this list
            </button>
          )}
        </div>
      )}
    </section>
  )
}
