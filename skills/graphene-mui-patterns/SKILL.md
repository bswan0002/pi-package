---
name: graphene-mui-patterns
description: Applies Cloudability Graphene-compatible MUI implementation and review conventions across Apex and Carbon themes. Use when adding, editing, or reviewing React UI, MUI components, sx/styled code, Graphene icons/tokens/layers, theme.id branches, or visual styling in Cloudability microfrontends using @cloudability/graphene.
---

# Graphene MUI Patterns

These rules are authoritative for MUI implementation in Cloudability applications using Graphene.

## Core rule: let Graphene style MUI

- Start with the standard MUI component whose semantics match the UI. Prefer MUI composition over custom HTML or bespoke controls.
- Treat Graphene's theme defaults as the design system. Do not restyle a MUI component to resemble a button, link, field, chip, tooltip, or other standard component.
- Use props such as `variant`, `color`, `size`, `disabled`, `readOnly`, `error`, and `loading` to express intent. Do not reproduce those props with CSS.
- Omit props when the theme default expresses the intent. Apex and Carbon are allowed to look different.
- Style layout and genuine product-specific behavior only. Do not duplicate theme-owned typography, colors, padding, borders, radii, shadows, hover/active/focus states, text casing, or minimum sizes.
- Before keeping a style override, remove it mentally: if Graphene already supplies the correct component appearance, delete the override.

## Current cross-theme defaults

- `Button` defaults to `variant="contained"`. Use `outlined` for tertiary and `text` for ghost/low-emphasis actions; do not manually skin one variant as another.
- `TextField` defaults to small and theme-appropriate variants: Apex is outlined; Carbon is standard. Carbon supports only `standard`.
- For select inputs, virtually always use `<TextField select>` rather than standalone MUI `<Select>`. Graphene's field styling and labeling support is centered on `TextField`; use `<Select>` only when an established requirement cannot be expressed with `<TextField select>`.
- `IconButton` should normally omit `variant`, color, size, and icon sizing so each theme applies its defaults.
- Supported `IconButton` combinations are default ghost, primary contained, secondary contained, and primary outlined. Carbon does not support danger icon-only buttons.
- Prefer default component variants and sizes. Specify them only for semantic hierarchy or a concrete composition need, such as a compact toolbar.
- When selecting component variants, colors, sizes, tokens, or theme branches, read [references/REFERENCE.md](references/REFERENCE.md) for the supported prop matrix and theme facilities.

## Styling conventions

- Use `sx` for styling. Prefer full CSS names and explicit CSS values: `padding: "16px"`, not `p: 4`.
- Prefer `<Box sx={{ display: "flex" }}>` over `Stack`.
- Keep `sx` at the layout owner. Extract a styled component only for genuinely reusable styling, never merely to rewrite Graphene.
- Use `Typography` with supported variants (`h1`–`h6`, `body1`) instead of custom font properties. Prefer a native Typography variant over spreading a type token.
- Use semantic component props before color tokens, e.g. `<Button color="error">` rather than custom danger colors.
- For custom styling, use `theme.tokens` for semantic text, icon, status, and data colors. Use contextual `theme.cssVars` for backgrounds, fields, and borders.
- Never hard-code hex/rgb colors or legacy Apex colors. Avoid `theme.palette.primary.main` when a component prop or Graphene semantic token already owns the color.
- Derive custom radii from `theme.shape.borderRadius`; use `Paper` for elevated surfaces so Carbon can remove shadows correctly.

## Apex/Carbon differences

- Do not force visual parity. First omit the prop or override and let each theme choose its valid default.
- Branch on `theme.id` only when product behavior requires a non-default Apex presentation that Carbon does not support, or when the two systems require materially different composition.
- Keep branches narrow and return `undefined`/`{}` for the theme that should retain its default.
- For TextFields that switch outlined while editing and standard while read-only in Apex, leave Carbon unspecified:

```tsx
const theme = useTheme()
const variant: TextFieldProps["variant"] =
  theme.id === "apex" ? (isEditing ? "outlined" : "standard") : undefined
```

## Graphene facilities

- Import icons from `@cloudability/graphene/icons`. Do not use MUI/Apex icons or custom SVGs when a Graphene equivalent exists.
- Let icon and parent component sizes inherit defaults. Override icon size only for a demonstrated composition requirement.
- When a surface creates a new Carbon layer, render `Layer` from `@cloudability/graphene/components` as its first child; use `sx={{ display: "contents" }}` when a wrapper would alter layout.
- Access theme values dynamically through `sx` callbacks, `useTheme`, or styled callbacks. Never import/create a fixed Apex or Carbon theme for component styling.
- Icon-only actions must have a visible `Tooltip` label. Do not add a redundant `aria-label` when the tooltip or another accessible label names the control.
- For charts and grids, use Graphene's dedicated theme hooks rather than manually copying design-system colors.

## Implementation and review workflow

1. Read the target repo's agent instructions and inspect nearby established Graphene patterns.
2. Identify the semantic MUI component and express intent with its props.
3. Remove appearance overrides already owned by Graphene; retain only layout or truly custom behavior.
4. Check every explicit variant/color/size combination against both themes; narrow `theme.id` branches when needed.
5. Check custom colors, surfaces, borders, icons, typography, and layers for semantic Graphene usage.
6. Exercise Apex and Carbon, preferably Carbon g100 for exposing static colors. Check default, hover, focus, active, disabled, error, loading, edit, and read-only states as applicable.
7. Run the target repo's type, lint, formatting, and test commands.

When rewriting or reviewing custom-styled MUI controls, read [references/EXAMPLES.md](references/EXAMPLES.md) for concrete corrections and review examples.
