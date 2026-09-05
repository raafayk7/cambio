import { Alert, Button, FieldScaffold, TextField } from "@cambio/ui"
import * as React from "react"

/**
 * NameForm (CAM-17 W2) — the first-use identity moment, presentational per
 * forms.md: field-scaffold label/error, one primary in a right-aligned
 * footer row, submit failure as an alert above the footer. Validation is
 * 1–32 chars (trimmed) on submit, re-validated on blur once a field has
 * erred — never on first keystroke. Copy per voice.md: sentence case,
 * errors say what went wrong then the fix; `Deal me in` is voice.md's own
 * verb-phrase example for this button.
 */
export interface NameFormProps {
  onSubmit: (name: string) => void
  submitting?: boolean
  /** A server-side submit failure, already turned into voice.md copy. */
  submitError?: string | undefined
}

function validate(raw: string): string | undefined {
  const name = raw.trim()
  if (name.length === 0) return "Enter a name so the table knows who you are."
  if (name.length > 32) return "That name is too long. 32 characters is the most."
  return undefined
}

export function NameForm({ onSubmit, submitting = false, submitError }: NameFormProps) {
  const [name, setName] = React.useState("")
  const [error, setError] = React.useState<string | undefined>(undefined)
  const touched = error !== undefined

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const failure = validate(name)
    setError(failure)
    if (failure === undefined) onSubmit(name.trim())
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <FieldScaffold
        label="Your name"
        helper="What the table will call you."
        {...(error !== undefined ? { error } : {})}
      >
        <TextField
          name="name"
          autoComplete="off"
          placeholder="e.g. Nadia"
          value={name}
          onChange={(event) => setName(event.target.value)}
          // Re-validate on blur only after an error exists (forms.md).
          onBlur={() => {
            if (touched) setError(validate(name))
          }}
        />
      </FieldScaffold>
      {submitError !== undefined ? <Alert variant="alarm">{submitError}</Alert> : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={submitting}>
          Deal me in
        </Button>
      </div>
    </form>
  )
}
