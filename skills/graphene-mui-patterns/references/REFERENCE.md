# Graphene MUI Reference

This reference describes the Graphene behavior this skill targets.

## Intent-to-prop matrix

### Button

| Intent               | Props                                             | Notes                                        |
| -------------------- | ------------------------------------------------- | -------------------------------------------- |
| Primary              | omit `variant`; usually omit `color`              | Defaults to `contained` in Apex and Carbon   |
| Secondary            | `color="secondary"`                               | Supported as contained                       |
| Tertiary             | `variant="outlined"`                              | Use primary color                            |
| Ghost / low emphasis | `variant="text"`                                  | Do not recreate link/ghost styling with `sx` |
| Danger               | `color="error"` with contained, outlined, or text | Pick emphasis semantically                   |

Avoid unsupported or ambiguous combinations such as secondary outlined/text buttons.

### IconButton

| Intent                  | Props                                   |
| ----------------------- | --------------------------------------- |
| Normal icon-only action | omit variant and color                  |
| Primary                 | `variant="contained" color="primary"`   |
| Secondary               | `variant="contained" color="secondary"` |
| Tertiary                | `variant="outlined" color="primary"`    |

Do not create danger icon-only buttons. Use a labeled `Button color="error"` because destructive actions require visible text in Carbon.

### TextField

- Both themes default to `size="small"`.
- With no explicit variant, Apex uses MUI's outlined field and Carbon uses Graphene's standard field.
- Carbon supports only `standard`; never pass `outlined` or `filled` unconditionally.
- Set read-only behavior through `slotProps={{ input: { readOnly: true } }}` (or the target repo's MUI-compatible equivalent), not disabled styling.
- If Apex alone needs a different variant, return `undefined` in Carbon so its default remains active.

### Select inputs

- Virtually always use `<TextField select>` with `MenuItem` children instead of standalone MUI `<Select>`.
- Graphene's complete field presentation—label, helper text, error state, sizing, read-only behavior, and theme-appropriate variant—is centered on `TextField`.
- Use standalone `<Select>` only when a concrete requirement cannot be expressed with `<TextField select>`; document the reason and verify every state in both Apex and Carbon.

```tsx
<TextField select label="Provider" value={provider} onChange={onProviderChange}>
  <MenuItem value="aws">AWS</MenuItem>
  <MenuItem value="azure">Azure</MenuItem>
</TextField>
```

## Typography

Use these Graphene-supported MUI variants:

- `h1`: large header
- `h2`: medium header
- `h3`: small header
- `h4`: extra-small header
- `h5`: micro/caption-like text
- `h6`: bold micro/caption-like text
- `body1`: normal body text

Do not invent `fontFamily`, `fontSize`, `fontWeight`, `lineHeight`, or `letterSpacing` for standard MUI content. Avoid unsupported variants, including `body2`.

## Colors and surfaces

Use values in this order:

1. Semantic component props (`color`, `error`, `disabled`, etc.).
2. `theme.cssVars` for contextual layers, fields, and borders.
3. `theme.tokens` for semantic text, icon, support/status, and data colors.
4. `theme.carbonTokens` only when Graphene exposes no mapped cross-theme token and the implementation deliberately accepts its Apex mapping behavior.

Common patterns:

```tsx
<Box sx={{ backgroundColor: theme => theme.cssVars.layer }} />
<Box sx={{ border: theme => `1px solid ${theme.cssVars.borderSubtle}` }} />
<WarningAltFilled sx={{ color: theme => theme.tokens.supportWarning }} />
```

Do not select tokens by visual resemblance. Select them by semantic role and Carbon component guidance.

## Layering

A surface that creates a new visual layer must also increment context for descendants:

```tsx
import { Layer } from "@cloudability/graphene/components";
import { Paper } from "@mui/material";

<Paper>
  <Layer sx={{ display: "contents" }}>{children}</Layer>
</Paper>;
```

Use contextual `cssVars` on custom surfaces. Do not pair static white backgrounds with Carbon fields.

## Theme branching

Good branches preserve a theme default:

```tsx
sx={theme => (theme.id === "carbon" ? { borderColor: theme.cssVars.borderSubtle } : {})}
```

```tsx
variant={theme.id === "apex" ? apexVariant : undefined}
```

Bad branches duplicate complete visual specifications for both themes or force one design system to imitate the other.

## Established source examples

When context is needed, useful local examples include:

- `~/Dev/data-explorer-ui/src/components/molecules/FilterSubheader.tsx`
- `~/Dev/data-explorer-ui/src/context/Providers.tsx`
- `~/Dev/costguard-ui/src/features/configuration/components/DeploymentDetails.tsx`
- `~/Dev/graphene/src/stories/getting-started/5-carbon-adoption-guide.mdx`
- `~/Dev/graphene/src/stories/elements/color-tokens.mdx`

Do not copy incidental product layout blindly; copy the default-first and semantic-theme patterns.
