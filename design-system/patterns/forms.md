# Pattern: forms

The form recipe (join room, create room, settings). Cambio's forms are
small — the pattern keeps them boring and correct.

Composition:

- Every input inside a `field-scaffold` (label above, helper/error below).
- Fields stack vertically at `space.4`; related short fields may pair on
  one row at `regular`+ widths.
- One `button` primary at the end, right-aligned in a footer row with any
  secondary (ghost) beside it. The primary names the action ("Join room").
- The form sits on plain cream (`surface.page`) or in a `panel` — forms
  are functional surfaces: sentence case, no scene art behind the fields
  (CAM-13 scene map).

Validation:

- Validate on submit; re-validate a fixed field on blur. Never validate on
  first keystroke.
- Errors per field via the scaffold; a submit-level failure adds an `alert`
  above the footer. Error copy per voice.md: what went wrong, then the fix.

Room-code entry:

- `text-field` `code` variant, auto-uppercase, no paste restrictions.
