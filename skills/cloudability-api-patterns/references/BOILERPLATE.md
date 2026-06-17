# API Setup Boilerplate

Reference this file only when setting up or repairing shared API-boundary utilities for Cloudability Switchboard Extension repos. Normal API module work should use `SKILL.md` without loading this reference.

## Files to create/update

Required for `cloudability-core` API wrappers:

```txt
src/utils/cloudabilityCoreUtils.ts
```

Optional when the repo wants to normalize dubious `readonly` types exposed by `cloudability-core`:

```txt
src/utils/tsUtils.ts
src/utils/cloudabilityCoreUtils.ts
```

## `src/utils/cloudabilityCoreUtils.ts`

**IMPORTANT:** ask the user if they would prefer to strip dubious readonly types from `cloudability-core` before determining which version of boilerplate to write.

Use this boilerplate snippet as-is for standard `cloudability-core` unwrapping; do not rewrite it, inline it, or replace it with a different assertion pattern.

```ts
import { type CoreResponse } from "@apptio/cloudability-core";

import { t } from "@/lib/i18n/t";

export const unwrapCoreData = <T>(response: CoreResponse<T>): T => {
  if (response.status === "OK") {
    // Acceptable assertion: works around a limitation in cloudability-core type inference.
    return response.data as T;
  }

  if (response.error) {
    throw response.error;
  }

  throw new Error(t("app:status.server_error"));
};
```

Use it in every core-backed API method:

```ts
const data = unwrapCoreData(await core.v3.views.getViews());
return data.result;
```

## Optional readonly-stripping setup

Only add this setup if the project explicitly wants to normalize those types at the API boundary. Do not scatter readonly-removal assertions across API methods. Keep the workaround centralized in `unwrapCoreData`.

### `src/utils/tsUtils.ts`

Add this type to an existing `tsUtils.ts`, or create the file if the repo does not already have one.

```ts
export type StripReadonlies<T> = T extends (infer U)[]
  ? StripReadonlies<U>[]
  : T extends ReadonlyArray<infer U>
    ? StripReadonlies<U>[]
    : T extends object
      ? { -readonly [K in keyof T]: StripReadonlies<T[K]> }
      : T;
```

### `src/utils/cloudabilityCoreUtils.ts`

When using `StripReadonlies`, use this `unwrapCoreData` variant as-is.

```ts
import { type CoreResponse } from "@apptio/cloudability-core";

import { t } from "@/lib/i18n/t";

import { type StripReadonlies } from "./tsUtils";

export const unwrapCoreData = <T>(
  response: CoreResponse<T>,
): StripReadonlies<T> => {
  if (response.status === "OK") {
    // Acceptable assertion: works around a limitation in cloudability-core type inference and removes frustrating readonlies
    return response.data as StripReadonlies<T>;
  }

  if (response.error) {
    throw response.error;
  }

  throw new Error(t("app:status.server_error"));
};
```
