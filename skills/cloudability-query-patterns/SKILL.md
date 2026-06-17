---
name: cloudability-query-patterns
description: Apply Cloudability Switchboard Extension TanStack Query conventions. Use when adding, editing, or reviewing src/queries/*Queries.ts, src/features/*/queries/*Queries.ts, query key factories, useQuery/useMutation hooks, cache updates, invalidation, query options, or global query error handling.
---

# Cloudability Query Patterns

## Scope and files

- Put shared/app-wide query modules in `src/queries`; put feature-only query modules in `src/features/<feature>/queries`.
- Query module ownership mirrors API module ownership.
- Name query files by domain/resource as `*Queries.ts`, e.g. `dashboardsQueries.ts`, not one file per hook.
- Order files as: imports, key factory, local option/payload types, query hooks, mutation hooks.
- Query hooks call local API modules only. Do not call axios or `core.v3.*` fetch/mutation methods directly from query modules. Cloudability-core invalidation/cache side effects may remain in mutation callbacks.
- Return the raw `useQuery`/`useMutation` result directly by default.
- Ask only when scope, hidden global state, optimistic safety, or error-toast ownership cannot be determined.

## Query keys

- Every query module exports a key factory object named `<domain>Keys`.
- Key roots are domain nouns, not method names: `['dashboards']`, not `['getDashboards']`.
- `all` is always the root.
- Add segment labels like `"list"`/`"byId"` when a domain has multiple query shapes.
- Add static broad keys like `lists` only when useful for partial invalidation.
- Use scalar IDs for simple detail keys and params objects for params-based list/search/report keys.

```ts
export const dashboardsKeys = {
  all: ["dashboards"] as const,
  lists: [...dashboardsKeys.all, "list"] as const,
  list: (params: GetDashboardsParams) => [...dashboardsKeys.lists, params] as const,
  byId: (dashboardId: number) => [...dashboardsKeys.all, "byId", dashboardId] as const,
};
```

## Hook shape and types

- Read hooks end with `Query`; mutation hooks end with `Mutation`.
- Mutation names put the action first: `useCreateWidgetMutation`, `useUpdateTabNameMutation`.
- Query hooks should use the shape `useFooQuery(scalarOrParamsOrPayload, optionalQueryOptions)`. The first argument is the API/query input: pass a lone scalar identifier/value directly for detail hooks, e.g. `useDashboardQuery(dashboardId)`, and use a params/payload object for multi-field inputs, list/search/report params, or payload-like values. The second argument, when supported, is only for query behavior/UI-control options like `enabled`, `select`, or `keepPreviousData`.
- Query behavior/UI-control fields go in a separate options object, not in API params/payloads.
- Use `type`, not `interface`; do not add `readonly`.
- Use specific local type names: `ReportQueryOptions`, `CreateDashboardMutationOptions`, `UpdateWidgetMutationPayload`. Avoid plain `QueryOptions`/`MutationOptions`.
- Keep option/payload types private unless needed outside the file.
- If a hook supports options, use `options: FooQueryOptions = {}`.
- Hooks with no supported caller options omit an options argument entirely.

## Options, select, enabled, stale time

- Pick a narrow options type; do not pass through arbitrary React Query options.
- Common query options include `enabled`, `keepPreviousData`, `delay`, hook-specific `select`, and rarely `skipErrorToast`.
- Do not default `enabled` to `true`. Preserve React Query semantics: only `false` disables.
- When composing an internal readiness check, use `enabled: options.enabled !== false && internalCondition`.
- Expose typed caller `select` when useful:

```ts
type AccountsQueryOptions<TData, TSelected = TData> = {
  select?: (data: TData) => TSelected;
  enabled?: boolean;
};

export const useAccountsQuery = <TSelected = Array<Account>>(
  params: GetAccountsParams,
  options: AccountsQueryOptions<Array<Account>, TSelected> = {},
) => {
  return useQuery<Array<Account>, Error, TSelected>({
    queryKey: accountsKeys.list(params),
    queryFn: () => accountsApi.getAccounts(params),
    select: options.select,
    enabled: options.enabled,
  });
};
```

- Use `staleTime: 15 * 1000 * 60` for stable local API data where avoiding needless refetch is desired.
- For cloudability-core-backed API wrappers, inspect the installed core implementation before deciding `staleTime`. Use the target repo's `node_modules/@apptio/cloudability-core/modules/v3/<module>.js` as source of truth. If source files for the exact installed package version are available in the current workspace or package repository, use them only as additional context. Do not rely on `.d.ts` files because they do not show cache configuration, and installed `node_modules` may differ from local source checkouts.
- A core `action.get` method is shared-cache-backed when its implementation passes `cacheKeyConfig` or explicit non-false `cacheOptions`. In `cloudability-core` transport, `cacheOptions` defaults to `false`, but `cacheKeyConfig` turns caching on by converting that default to `{}` and creates a stable cache ID from `coreId`, optional `viewId`, and `dynParams`. `cacheOptions: { ttl: ... }` customizes the core cache TTL.
- If the core method is shared-cache-backed, omit React Query `staleTime` so the query stays stale by default and refetches go through core; core then decides whether to serve its cache or hit the network and core invalidation remains authoritative.
- If the core method is not shared-cache-backed, treat it like a local axios endpoint and choose an explicit React Query `staleTime` when the data is stable. Example: in some installed versions, `core.v3.users.getUsers` has no `cacheKeyConfig`, so `useUsersQuery` may use `staleTime: 15 * 1000 * 60`; newer or different methods such as `getApiUsers` may be cached if their implementation includes `cacheKeyConfig`.
- When reviewing a cached core method with params, verify the implementation's `cacheKeyConfig` includes all request-varying values in `viewId`/`dynParams`; if not, do not rely on the core cache without fixing or escalating the core method.
- Use `keepPreviousData` for pagination, debounced search, and other scenarios where it makes sense; do not add it broadly.

## Error meta and setup

- Most user-visible queries and mutations should set `meta.errorMessagePrefix` with translated domain-specific copy.
- Use `meta.errorMessage` only when server details should not be shown or copy should fully replace the fallback; use `meta.skipErrorToast` when errors are handled locally or should be quiet.
- Import `t` in query modules for operation-level error copy.
- For setup/repair of global query error handling only, reference [references/BOILERPLATE.md](references/BOILERPLATE.md). Do not load it for normal query hook work.

## Mutations and cache updates

- Mutation hooks own cache correctness: `setQueryData`, invalidation, rollback, and core invalidation side effects.
- Caller UI side effects such as navigation/closing modals should usually be passed to `mutate(payload, { onSuccess })`, not hook options.
- Hook-level callbacks are allowed only when they are part of the hook abstraction. Never pass through the full React Query mutation options object.
- Prefer API payload types directly for `mutationFn`; define query-layer mutation payload types only for query/UI-only fields.
- Do not set `mutationKey` by default; add one only for a concrete mutation-state/tooling need.
- Use optimistic updates only when there is clear UX value and rollback/invalidation is safe.
- Use `setQueryData<T>` for exact cache entries when the mutation response contains canonical data. Invalidate broader/list keys when membership/order/derived summaries may have changed.
- In `setQueryData` updaters, return `old`/`undefined` when cache data is missing rather than fabricating placeholder objects.
- Use key factory outputs for `invalidateQueries`, `refetchQueries`, and `setQueryData`; use `exact: true` only when intentionally avoiding descendant keys.
- Use `onSettled` invalidation as a safety net after optimistic updates when optimistic state may drift from server state.
- Success notifications may run in `onSuccess` when warranted. Error notifications should go through global QueryProvider handling.
