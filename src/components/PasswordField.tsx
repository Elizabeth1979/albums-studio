import { useState } from 'react'

type PasswordFieldProps = {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  autoComplete: 'current-password' | 'new-password'
  /** Noun used in the toggle's accessible name, e.g. "Show new password". */
  revealLabel?: string
  hint?: string
}

export function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  revealLabel = 'password',
  hint,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false)
  const hintId = hint ? `${id}-hint` : undefined

  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <div className="password-field">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          name={id}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-describedby={hintId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required
        />
        <button
          className="password-toggle"
          type="button"
          aria-label={visible ? `Hide ${revealLabel}` : `Show ${revealLabel}`}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      </div>
      {hint && <small id={hintId}>{hint}</small>}
    </div>
  )
}
