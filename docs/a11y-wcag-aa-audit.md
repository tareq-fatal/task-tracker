# WCAG 2.1 AA Deep Accessibility Audit

**Scope:** Screen-reader simulation (accessibility-tree inspection), full keyboard navigation, color contrast on critical screens, modal focus management, skip links, ARIA completeness, semantic HTML.
**Method:** Live app testing (accessibility-tree snapshots via automated browser, login/dashboard flows) + full source review of all interactive components. Automated axe-core is not currently wired into the test suite (see [Gap: no automated a11y regression test](#gap-no-automated-a11y-regression-test)) — this audit goes beyond what an axe-core pass would catch (structural/semantic issues, keyboard operability, focus order) rather than duplicating simple rule violations.
**Branch:** `a11y/wcag-aa-deep` (pushed, not merged — see commit history for the exact diff).

## Summary

| # | Finding | WCAG SC | Severity | Status |
|---|---|---|---|---|
| 1 | No skip-to-content link | 2.4.1 | High | **Fixed** |
| 2 | Section titles (`CardTitle`) rendered as `<div>`, not headings | 1.3.1, 2.4.6 | Medium | **Fixed** |
| 3 | Default/destructive button text fails 4.5:1 contrast | 1.4.3 | High | **Fixed** |
| 4 | Missing accessible names on form inputs (comment, subtask, search, team-member select, filter selects) | 1.3.1, 4.1.2 | High | **Fixed** |
| 5 | Icon-only buttons without `aria-label` (subtask add, mobile "new task" FAB) | 4.1.2, 2.4.4 | Medium | **Fixed** |
| 6 | Task-card links expose one unstructured run-on accessible name | 2.4.4, 1.3.1 | High | Documented — needs design input |
| 7 | Kanban board: no keyboard sensor, no drag-state ARIA announcements | 2.1.1, 4.1.3 | High | Documented — needs UX design |
| 8 | `--primary`/`--ring` token (sky-500) borderline-fails 3:1 non-text contrast for focus rings/borders | 1.4.11 | Medium | Documented — needs design decision |
| 9 | Radix `Dialog` focus trap / return-focus / Escape-to-close | 2.4.3, 2.1.2 | — | **Pass** (verified by construction) |
| 10 | Landmarks (`header`/`nav`/`main`), `lang`/`dir` per locale | 1.3.1, 3.1.1 | — | **Pass** |
| 11 | No automated a11y regression test (axe-core) in CI/e2e | — | Medium | Documented — recommend adding |

---

## Fixed in this branch

### 1. Skip link (`src/components/app-shell.tsx`)
No "skip to main content" link existed anywhere in the app, forcing keyboard users to tab through the full sidebar/header nav on every single page load. Added a skip link as the first focusable element, targeting a new `id="main-content"` on the `<main>` landmark. Visible on focus only (`sr-only focus:not-sr-only`). Verified live: it is now the first node in the accessibility tree.

### 2. Section headings (`src/components/ui/card.tsx`, `src/app/login/page.tsx`)
`CardTitle` rendered a plain `<div>` — used for the app name on `/login` and every settings sub-section heading on `/settings`. Screen-reader users navigating by heading (a primary technique, e.g. NVDA's `H` key) got no landmark at all on these screens. Changed `CardTitle` to render `<h2>`. Added a visually-hidden `<h1>` on the login page (its `CardTitle` there is the page's true top-level heading, while on `/settings` the same component is correctly a sub-section `h2` under the page's existing `h1`).

### 3. Color contrast (`src/components/ui/button.tsx`, `src/app/globals.css`, avatar/tab-nav usages)
Computed via WCAG relative-luminance formula against the actual CSS custom properties:

| Combination | Contrast | Needs | Result |
|---|---|---|---|
| white text on `sky-500`→`teal-500` gradient (default button, most-used button style app-wide) | 2.49–2.77:1 | 4.5:1 | **Fail** |
| white text on `--destructive` (rose-500, delete/error actions) | 3.67:1 | 4.5:1 | **Fail** |
| `--muted-foreground` (gray-500) on `--background` | 4.67:1 | 4.5:1 | Pass (narrow margin) |

Fixed by darkening the text-bearing surfaces only (decorative-only gradients — e.g. the active-nav indicator bar, dashed drop-zone dots — were left untouched to keep the diff minimal and low-risk):
- Button default variant: `sky-500→teal-500` → `sky-700→teal-700` (now ≈5.5–5.9:1)
- `--destructive`: rose-500 (`#F43F5E`) → rose-600 (`#E11D48`) (now ≈4.70:1)
- All avatar-initials badges and the active `tab-nav` pill using the same white-on-gradient combo (`app-shell.tsx`, `admin/users/page.tsx`, `team-members.tsx`, `user-detail-header.tsx`, `tab-nav.tsx`)

### 4. Missing form labels
Several inputs relied on `placeholder` alone, which is not an accessible name and disappears once text is entered:
- `comment-form.tsx` — comment textarea → added `aria-label`
- `subtask-list.tsx` — "add subtask" input → added `aria-label`; its icon-only submit button had **no** `aria-label` at all → added
- `filter-bar.tsx` — search input, and all 5 bare `<select>` filters (project/team/status/priority/date) → added `aria-label` to each
- `team-members.tsx` — "add member" `<select>` → added `aria-label`

### 5. Icon-only buttons without a name
- `subtask-list.tsx` add-subtask button (Plus icon only)
- `app-shell.tsx` mobile bottom-nav "new task" FAB (Plus icon only, previously announced as an unnamed link)

## Documented, not fixed (needs product/design input)

### 6. Task-card accessible names are one flat run-on string
`src/components/task-card.tsx` wraps the entire card (project, title, priority badge, status badge, "waiting on" note, progress %, subtask count, comment/attachment counts, assignee avatar initial) in a single `<Link>`. A screen-reader user tabbing through the dashboard (currently ~125 items with **no pagination**) hears one continuous sentence per card, e.g.:

> "Coast Shield / درع الساحل Furuno-Radar-Hardware bestellen (~300-450€) حرجة للتنفيذ متبقٍ 5 يوم 2 ا"

The trailing single letter is the assignee's avatar initial leaking into the link name with no context. This is legal (has *a* name) but a serious usability problem, and the sheer number of un-paginated cards compounds it (2.4.3 Focus Order / practical keyboard fatigue). Recommend: either restructure the card into distinct labelled regions, or keep the single-link pattern but build an explicit, well-ordered `aria-label` summary sentence, and hide the decorative avatar-initial text from assistive tech (`aria-hidden`). Also recommend pagination/virtualization for the "assigned to me" list independent of accessibility.

### 7. Kanban board has no keyboard path and no drag announcements
`src/components/kanban-board.tsx` configures `useSensors(MouseSensor, TouchSensor)` only — dnd-kit's `KeyboardSensor` is never registered, and `DndContext` has no `announcements` prop. Consequence:
- `useDraggable` still applies `role="button" tabIndex={0}` by default, so every card is keyboard-focusable and announced as "draggable" — but pressing Enter/Space/arrows does nothing. This is a false affordance, worse than not being focusable at all.
- A screen-reader user gets zero feedback during a mouse-driven drag (no live region).
- Mitigating factor: the task edit form (`task-form.tsx`) has a real, labelled `<select id="status">`, so changing a task's status *is* possible via keyboard — just not from the board view itself.

Recommend as the primary fix: add an explicit "Move to…" action (menu or button) per card, independent of drag-and-drop, as the keyboard/AT equivalent path. Secondarily, register dnd-kit's `KeyboardSensor` with a droppable-aware `coordinateGetter` and a proper `announcements` config for parity — but do this in addition to, not instead of, the explicit action, since default keyboard-sensor pixel-based movement is a poor fit for column-based board.

### 8. Brand primary/ring color borderline-fails non-text contrast
`--primary`/`--ring` (sky-500, `#0EA5E9`) is used for focus rings and input/button borders. Contrast against the off-white background computes to ≈2.68:1, under the 3:1 required by SC 1.4.11 (Non-text Contrast) for focus indicators and UI component boundaries. Not fixed here because `--primary` is the app's core brand color, used broadly (rings, "solid"/badge variants, accents) — darkening it is a visual-identity decision that should be made deliberately with design sign-off, not folded into a mechanical accessibility pass. Recommend evaluating `sky-600`/`sky-700` as the token value, or a dedicated `--ring` override if the brand blue itself must stay light.

### Gap: no automated a11y regression test
`package.json`/`playwright.config.ts` show no `axe-core`/`@axe-core/playwright`/`jest-axe` dependency anywhere in the repo. The existing `e2e/*.spec.ts` suite has no accessibility assertions. Recommend adding `@axe-core/playwright` and running it against the flows already covered in `e2e/flows.spec.ts` / `e2e/happy-path.spec.ts` to catch regressions on the fixes above.

## Verified passing (no changes needed)

- **Radix `Dialog` (all 4 usages)**: focus moves into the dialog on open, Tab/Shift+Tab cycle within it, Escape closes and returns focus to the trigger — guaranteed by `@radix-ui/react-dialog`'s `FocusScope` + `aria-modal`, confirmed by source review of `src/components/ui/dialog.tsx` and its 4 call sites (`new-project-dialog.tsx`, `new-team-dialog.tsx`, `new-user-dialog.tsx`, `filter-bar.tsx`'s mobile filter modal). No custom (non-Radix) modal implementations exist in the codebase.
- **Landmarks**: `<aside>` sidebar, `<header>`, `<main>`, desktop + mobile `<nav>` all present and correctly structured (`app-shell.tsx`).
- **Language/direction**: `<html lang={locale} dir={dir}>` set correctly per active locale (`ar`→`rtl`, `en`/`de`→`ltr`) in `src/app/layout.tsx`, driven by `src/lib/enums.ts`.
- **Decorative images**: logo `<Image>` instances correctly use `alt=""`.
- **No `<div onClick>` / `<span onClick>` anti-patterns**: every interactive element found in the codebase is a real `<button>`, `<a>`, or native form control.

## Not covered in this pass

- Live keyboard tab-order walkthrough of `/board` and the dashboard could not be completed interactively — the local dev environment was under heavy CPU contention from several other parallel worktree sessions on this machine, and the browser tab repeatedly became unresponsive on the ~125-task dashboard and the kanban board. These two findings (#6 and #7) are based on full source review instead, which is sufficient to establish them with high confidence, but a live screen-reader (NVDA) pass on those two specific screens is recommended as a follow-up once the environment is free.
- Admin pages (`/admin/users`, `/admin/teams`, `/admin/tasks`, `/admin/import`) were reviewed for the contrast/label patterns above but not individually walked keyboard-by-keyboard.
