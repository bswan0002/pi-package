# Query Setup Boilerplate

Reference this file only when setting up or repairing the shared TanStack Query provider/error-handling infrastructure. Normal query hook work should use `SKILL.md` without loading this reference.

This boilerplate is intentionally generic for Cloudability Switchboard Extension repos. It excludes data-explorer-ui-specific meta fields, queued mutation suppression, IndexedDB persistence, and feature-specific error behavior.

## Files to create/update

```txt
src/lib/react-query/QueryProvider.tsx
src/lib/react-query/react-query.d.ts
src/utils/queryUtils.ts
```

The app root should render `QueryProvider` around routes/components that use TanStack Query. Existing apps usually already have this wiring.

## `src/lib/react-query/react-query.d.ts`

This module augmentation defines the shared `meta` fields used by query and mutation hooks.

```ts
import "@tanstack/react-query"

declare module "@tanstack/react-query" {
  interface Meta {
    /** Full replacement fallback. 4xx server messages still take priority. */
    errorMessage?: string
    /** Prefix composed with 4xx server details as `"{prefix}: {detail}"`; shown alone for 5xx/unknown errors. */
    errorMessagePrefix?: string
    /** Suppresses the global error toast for locally handled or intentionally quiet errors. */
    skipErrorToast?: boolean
  }

  interface QueryMeta extends Meta {}
  interface MutationMeta extends Meta {}
}
```

Do not add feature-specific fields here unless the repo has an explicit cross-cutting need.

## `src/utils/queryUtils.ts`

This preserves useful 4xx backend validation messages while falling back to user-friendly operation copy for 5xx, network, and unknown errors.

```ts
import { isAxiosError } from "axios"

export const parseServerErrorMessage = (error: unknown, fallback: string): string => {
  if (!isAxiosError(error) || `${error.status}`.startsWith("5")) {
    return fallback
  }

  const [serverMsg, serverMsgs] = [error.response?.data?.error?.message, error.response?.data?.error?.messages]

  if (typeof serverMsg === "string") {
    return serverMsg
  }

  if (Array.isArray(serverMsgs) && serverMsgs.every(msg => typeof msg === "string")) {
    return serverMsgs.join(" ")
  }

  return fallback
}

export const getErrorMessage = (
  error: unknown,
  meta: Record<string, unknown> | undefined,
  fallbackMessage: string,
): string => {
  if (typeof meta?.errorMessage === "string") {
    return parseServerErrorMessage(error, meta.errorMessage)
  }

  if (typeof meta?.errorMessagePrefix === "string") {
    const serverMsg = parseServerErrorMessage(error, "")
    return serverMsg ? `${meta.errorMessagePrefix}: ${serverMsg}` : meta.errorMessagePrefix
  }

  return parseServerErrorMessage(error, fallbackMessage)
}
```

Expected behavior:

- 4xx Axios error with `response.data.error.message`: show the server message.
- 4xx Axios error with `response.data.error.messages: string[]`: join messages with spaces.
- 5xx Axios errors: use fallback copy.
- Non-Axios/unknown errors: use fallback copy.
- `meta.errorMessagePrefix`: show `"{prefix}: {server detail}"` for 4xx details, otherwise show prefix alone.
- `meta.errorMessage`: use as the fallback replacement while still allowing 4xx server details to take priority.

## `src/lib/react-query/QueryProvider.tsx`

This configures global query and mutation error toasts. Hooks provide operation-level copy through `meta.errorMessagePrefix`, `meta.errorMessage`, or `meta.skipErrorToast`.

```tsx
import { core } from "@apptio/cloudability-core"
import {
  MutationCache,
  QueryCache,
  QueryClient,
  type QueryClientConfig,
  QueryClientProvider,
} from "@tanstack/react-query"
import { type ReactNode } from "react"

import { t } from "@/lib/i18n/t"
import { getErrorMessage } from "@/utils/queryUtils"

const queryClientConfig: QueryClientConfig = {
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (query.meta?.skipErrorToast) return

      core.apexShell.showNotification(getErrorMessage(error, query.meta, t("app:status.server_error")), {
        type: "error",
      })
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, variables, context, mutation) => {
      if (mutation.meta?.skipErrorToast) return

      core.apexShell.showNotification(getErrorMessage(error, mutation.meta, t("app:status.server_error")), {
        type: "error",
      })
    },
  }),
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
}

export const queryClient = new QueryClient(queryClientConfig)

type QueryProviderProps = {
  children: ReactNode
}

export const QueryProvider = ({ children }: QueryProviderProps) => {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
```

Projects may add domain-specific suppression before showing a toast, but keep the shared boilerplate focused on `skipErrorToast` and the generic meta fields above.

If a repo needs persistent query cache for local development, add that separately around this same `queryClientConfig`; persistence is repo/config-specific and is not part of the standard boilerplate.

## Example query/mutation usage

This example shows the error meta plus the minimum cache work a mutation should do when it creates data that affects existing queries.

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { dashboardsApi } from "@/api/dashboardsApi"
import { t } from "@/lib/i18n/t"

export const dashboardsKeys = {
  all: ["dashboards"] as const,
  list: () => [...dashboardsKeys.all, "list"] as const,
  byId: (dashboardId: number) => [...dashboardsKeys.all, "byId", dashboardId] as const,
}

export const useDashboardsQuery = () => {
  return useQuery({
    queryKey: dashboardsKeys.list(),
    queryFn: dashboardsApi.getDashboards,
    staleTime: 15 * 1000 * 60,
    meta: { errorMessagePrefix: t("dashboards:could_not_load_dashboards") },
  })
}

export const useCreateDashboardMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: dashboardsApi.createDashboard,
    meta: { errorMessagePrefix: t("dashboards:could_not_create_dashboard") },
    onSuccess: newDashboard => {
      queryClient.setQueryData(dashboardsKeys.byId(newDashboard.id), newDashboard)
      queryClient.invalidateQueries({ queryKey: dashboardsKeys.list() })
    },
  })
}
```

Use `meta.skipErrorToast: true` when a local screen or component intentionally owns the error state and no global toast should appear.
