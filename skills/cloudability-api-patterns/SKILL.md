---
name: cloudability-api-patterns
description: Apply Cloudability Switchboard Extension API module conventions for axios and cloudability-core wrappers. Use when adding, editing, or reviewing src/api/*Api.ts, src/features/*/api/*Api.ts, *ApiUtils.ts, or API boundary code in repos like example-feature-ui and data-explorer-ui.
---

# Cloudability API Patterns

These rules are authoritative for API boundary code in Cloudability Switchboard Extension repos.

## Scope and shape

- Put app-wide/shared API modules in `src/api`; put feature-only API modules in `src/features/<feature>/api`.
- Prefer one API file per backend resource/collection, e.g. `dashboardsApi.ts`, `widgetsApi.ts`, `tabsApi.ts`.
- Name files `[domainOrCollection]Api.ts`; export one object named after the file, e.g. `dashboardsApi`.
- Method names include the domain/entity: `getDashboard`, `getDashboards`, `createWidget`, `updateWidget`, `deleteWidget`.
- Use `getFoo` for one entity and `getFoos` for a collection.
- Write methods as `async` functions with `const response = await ...; return ...`.
- Methods with arguments take exactly one object argument. No positional IDs. No empty params types for no-arg methods.
- Keep query/cache concerns out of API modules: query keys, stale time, `enabled`, `meta`, optimistic updates, invalidation, cache writes, and `select` belong in queries.

## Types

- Define API shapes with `type`, not `interface`; do not add `readonly`.
- Avoid generic names like `Params`, `Payload`, `Response`, or `RequestBody`; names must include method/domain.
- Use `Params` for GET/read argument objects, including path IDs and query params: `GetDashboardParams`.
- Use `Payload` for mutation argument objects, including path IDs needed to build URLs: `DeleteWidgetPayload`.
- Use `ApiParams`, `ApiPayload`, or `Api*` entity names only when backend-bound shape differs from public/UI shape.
- Do not create aliases that only rename existing types, e.g. avoid `type UpdateDashboardPayload = Dashboard`; use `Dashboard` directly.
- Export types only when needed outside the file. Keep backend-only transform types private unless needed by a sibling `*ApiUtils.ts`.

## Params, payloads, responses, transforms

- Public API method args should be UI-friendly and reusable by query hooks.
- If backend params/payloads differ, define a distinct backend shape and transform at the API boundary, e.g. `GetRecommendationsParams` -> `GetRecommendationsApiParams`.
- Put non-trivial transforms beside the API file in `[domainOrCollection]ApiUtils.ts`.
- Name transforms by method/direction, e.g. `transformGetDashboardResponse`, `dashboardToApiDashboard`, `transformCreateWidgetPayload`.
- Do not create `*ApiUtils.ts` for simple property access like `response.data.result`.
- Avoid type assertions. If a low-level library has imperfect types, centralize the workaround in a helper instead of scattering assertions.
- Default to returning the most ergonomic useful value, usually `response.data.result`.
- Return the whole envelope only when current consumers need fields like `meta`, pagination, aggregates, or generated IDs.
- Unwrapping an envelope is not a transform. Do not introduce `ApiResponse` solely because a method returns `response.data.result`.
- Use `Api*` response/entity names only when distinguishing a backend shape from a different public/UI shape.
- Add explicit return types for transformed methods, mutation methods returning `void`, cloudability-core wrappers, and methods where the endpoint envelope differs from the returned value.

## Axios

Import local axios client with:

```ts
import { axios } from "@/lib/axios/axios";
```

Type mutation payloads with Axios response/body generics:

```ts
import { type AxiosResponse } from "axios";

const response = await axios.put<
  ApiDashboard,
  AxiosResponse<ApiDashboard>,
  ApiDashboard
>(url, payload);
```

Keep constant backend defaults near the API module, e.g. `const DASHBOARDS_QUERY = { ... } as const`.

## cloudability-core

- Use `cloudability-core` when it already provides the endpoint, especially for shared core cache/invalidation behavior.
- Never call `core.v3.*` data-fetching or mutation methods directly from query modules or components. Wrap them in a local API module.
- Cache side-effect calls like `core.v3.user.invalidate.getUserSettings()` may remain in query modules.
- Create `src/utils/cloudabilityCoreUtils.ts` if it does not exist:

```ts
import { type CoreResponse } from "@apptio/cloudability-core";

import { t } from "@/lib/i18n/t";

export const unwrapCoreData = <T>(response: CoreResponse<T>): T => {
  if (response.status === "OK") {
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

## Query handoff checklist

- API methods should support `queryFn: () => api.getFoo(params)` and `mutationFn: api.updateFoo`.
- Export API params/payload types when query modules need them.
- Before finishing, check: correct scope, one exported API object, specific names, one object arg, `type` not `interface`, no `readonly`, no pointless aliases, `Api*` only for different backend shapes, non-trivial transforms in sibling `*ApiUtils.ts`, axios from `@/lib/axios/axios`, core calls wrapped with `unwrapCoreData`, ergonomic return values.
