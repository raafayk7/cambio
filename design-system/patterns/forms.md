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
  are functional surfaces: sentence case, and bare scene art never sits
  directly behind the fields. On a pictorial scene ground the panel is
  the `wash` variant (panel.md r2): the painting may show through the
  paper at 90%, but the fields always sit on paper, never on artwork.
  (Amended in the CAM-17 review fix cycle; the original "no scene art
  behind the fields" predates the wash variant and read as banning it.)

Validation:

- Validate on submit; re-validate a fixed field on blur. Never validate on
  first keystroke.
- Errors per field via the scaffold; a submit-level failure adds an `alert`
  above the footer. Error copy per voice.md: what went wrong, then the fix.

Room-code entry:

- `text-field` `code` variant, auto-uppercase, no paste restrictions.
