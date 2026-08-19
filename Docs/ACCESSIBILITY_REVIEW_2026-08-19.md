# Accessibility review — 2026-08-19

## Scope and result

This is a source-level review of the public web checkout and admin interface
against relevant WCAG 2.2 AA concerns. It is not a conformance claim. The
session's in-app browser runtime reported no available browser, so keyboard,
screen-reader, reflow and rendered-colour testing remains manual.

The review confirmed that the shared dialog already moves focus into the
dialog, traps Tab/Shift+Tab, closes on Escape when safe, and restores focus to
the opener. The following source issues were corrected:

- product cards and admin navigation now expose visible keyboard focus and a
  programmatic name/current section;
- language buttons expose their language and pressed state;
- the city selector has an associated label;
- toast messages use status/alert semantics and a real dismiss button;
- error toasts persist until dismissed instead of disappearing on a timer;
- the admin error dismiss control has a name, and audio activation is owned by
  a keyboard-operable button rather than a pointer-only container.

The TypeScript build stage passed after these changes. The complete repository
check is recorded separately in the checklist/final verification.

Reference standard: [WCAG 2.2](https://www.w3.org/TR/WCAG22/), particularly
keyboard operation, headings and labels, visible focus, error identification
and status messages.

## Required rendered tests

Run these against the exact production candidate and retain screenshots or a
short signed test record without customer data:

1. Use only Tab, Shift+Tab, Enter, Space, arrow keys and Escape through `/`,
   `/menu`, product dialog, `/cart`, `/privacy`, `/terms`, admin login, order
   handling, food-information editing and both refund flows.
2. Confirm every focus indicator is visible and is not hidden by sticky UI at
   desktop and mobile widths. Confirm dialogs keep focus inside and return it
   to the exact opener.
3. Test NVDA with current Firefox or Chrome on Windows. Also test VoiceOver on
   Safari/iOS or TalkBack on Android for the customer checkout.
4. Verify browser zoom at 200% and text/reflow behavior at 400% without lost
   content, overlapping controls or two-dimensional scrolling except where
   intrinsically necessary.
5. Measure text, control-boundary and focus-indicator contrast in rendered
   normal, hover, focus, disabled, error and out-of-stock states. Source colour
   inspection alone is insufficient because backgrounds and overlays combine.
6. Check target size and spacing on a physical phone/tablet, including quantity
   controls, language buttons, dialog close buttons and admin order actions.
7. Trigger validation, payment failure, network failure, toast, payment alert
   and refund reconciliation states; confirm they are announced once, remain
   understandable, and do not move focus unexpectedly.
8. Repeat with Swedish, English and Arabic, checking reading order, accessible
   names and RTL layout.

Do not mark the master accessibility item complete until the rendered tests
pass and any remaining issues are fixed and retested.
