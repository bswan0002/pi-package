# Graphene MUI Examples

## Do not rebuild a Graphene Button

### Incorrect

```tsx
const AddFilterButton = styled(Button)(({ theme }) => ({
  fontFamily: theme.typography.fontFamily,
  fontWeight: 400,
  fontSize: "14px",
  lineHeight: "18px",
  letterSpacing: "0.16px",
  color: theme.palette.primary.main,
  textTransform: "none",
  padding: "3px 16px",
  minWidth: "auto",
  whiteSpace: "nowrap",
  "&:hover": {
    backgroundColor: "transparent",
    textDecoration: "underline",
  },
}))
```

This replaces Graphene's text-button typography, color, spacing, interaction, and cross-theme behavior. Most declarations describe the design system rather than product layout.

### Correct

```tsx
import { Add } from "@cloudability/graphene/icons"
import { Button } from "@mui/material"

<Button
  variant="text"
  size="small"
  onClick={onOpenFilterMenu}
  endIcon={<Add fontSize="inherit" />}
  sx={{ whiteSpace: "nowrap", minWidth: "fit-content" }}
>
  Add filter
</Button>
```

`variant="text"` communicates low emphasis, `size="small"` communicates the compact toolbar composition, and `sx` contains only layout constraints.

If no icon is needed, do not append a text `+`; use the Graphene icon or plain button label according to the design.

## Preserve TextField defaults in Carbon

### Incorrect

```tsx
<TextField variant={isEditing ? "outlined" : "standard"} />
```

Carbon does not support outlined TextFields.

### Correct

```tsx
import { TextField, type TextFieldProps, useTheme } from "@mui/material"

const theme = useTheme()
const variant: TextFieldProps["variant"] =
  theme.id === "apex" ? (isEditing ? "outlined" : "standard") : undefined

<TextField
  variant={variant}
  slotProps={{ input: { readOnly: !isEditing } }}
/>
```

If the field does not need the Apex read-only/edit distinction, omit `variant` entirely.

## Use TextField for select inputs

### Incorrect

```tsx
<FormControl>
  <InputLabel id="provider-label">Provider</InputLabel>
  <Select labelId="provider-label" value={provider} onChange={onProviderChange}>
    <MenuItem value="aws">AWS</MenuItem>
    <MenuItem value="azure">Azure</MenuItem>
  </Select>
</FormControl>
```

Standalone MUI `Select` does not receive Graphene's complete field treatment and requires extra label, error, helper-text, size, and variant coordination.

### Correct

```tsx
<TextField select label="Provider" value={provider} onChange={onProviderChange}>
  <MenuItem value="aws">AWS</MenuItem>
  <MenuItem value="azure">Azure</MenuItem>
</TextField>
```

Use standalone `Select` only when a demonstrated requirement cannot be implemented with `TextField select`, and verify the exception in both themes.

## Prefer semantic props to CSS

### Incorrect

```tsx
<Button
  sx={theme => ({
    color: theme.tokens.supportError,
    border: `1px solid ${theme.tokens.supportError}`,
  })}
>
  Delete
</Button>
```

### Correct

```tsx
<Button color="error" variant="outlined">
  Delete
</Button>
```

This preserves Graphene's danger hover, active, focus, and disabled states.

## Do not invent typography

### Incorrect

```tsx
<Box sx={{ fontFamily: "IBM Plex Sans", fontSize: "14px", fontWeight: 600 }}>
  Section title
</Box>
```

### Correct

```tsx
<Typography variant="h3">Section title</Typography>
```

Choose the semantic heading level and component element deliberately when they differ:

```tsx
<Typography variant="h5" component="span">
  Field label
</Typography>
```

## Use contextual tokens and Layer for a custom surface

```tsx
import { Layer } from "@cloudability/graphene/components"
import { Box } from "@mui/material"

<Box
  sx={theme => ({
    backgroundColor: theme.cssVars.layer,
    border: `1px solid ${theme.cssVars.borderSubtle}`,
    borderRadius: theme.shape.borderRadius + "px",
  })}
>
  <Layer sx={{ display: "contents" }}>
    <TextField label="Name" />
  </Layer>
</Box>
```

Without `Layer`, descendant fields may use the wrong contextual background in Carbon.

## Keep icon-only actions theme-aware and named

### Incorrect

```tsx
<IconButton size="small" sx={{ color: "#56697C" }} aria-label="Download">
  <CustomDownloadSvg width={16} height={16} />
</IconButton>
```

### Correct

```tsx
import { Export } from "@cloudability/graphene/icons"
import { IconButton, Tooltip } from "@mui/material"

<Tooltip title="Export">
  <IconButton onClick={onExport}>
    <Export />
  </IconButton>
</Tooltip>
```

The tooltip supplies the visible accessible name while Graphene owns iconography, sizing, color, and interaction states.

## Review test for suspicious styling

Given a styled MUI component, classify each declaration:

- **Semantic intent:** should usually become a component prop.
- **Theme appearance:** delete it and let Graphene own it.
- **Layout constraint:** keep it near the layout owner in `sx`.
- **Product-specific behavior:** keep only when requirements demonstrate it.
- **Cross-theme incompatibility:** use the smallest possible `theme.id` branch.

A block that sets typography, primary color, padding, radius, casing, and hover/focus styles on a standard MUI control is almost always a Graphene violation.
