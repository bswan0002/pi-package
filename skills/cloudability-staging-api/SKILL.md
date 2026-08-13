---
name: cloudability-staging-api
description: Uses Cloudability staging API responses as empirical evidence for product reasoning, API implementation, debugging, reviews, and handwritten response-type validation. Use when working in a Cloudability frontend repo and a material conclusion could depend on backend response shapes, values, scale, cardinality, available options, or edge-case reachability, including work outside API modules.
---

# Cloudability Staging API

Use the staging API to test material assumptions instead of speculating from frontend code alone.

## When to call staging

Call a relevant endpoint when observed backend data could materially change a conclusion, concern, or implementation. Common cases include:

- judging whether an edge case is realistically reachable based on collection size, cardinality, or available options;
- understanding product behavior from the data users actually receive;
- implementing or reviewing API code whose response types are handwritten;
- checking response envelopes, field names, runtime value types, nulls, or representative values;
- reproducing backend-dependent behavior or deciding whether defensive frontend complexity is justified.

Do not call staging for assumptions unrelated to backend data or when the result cannot affect the work.

## Repo-local discovery only

1. Start with the current repo's `src/api`, feature `api` directories, request types, transforms, queries, call sites, tests, and mocks.
2. Derive the HTTP method, path, query parameters, repeated/array serialization, body, headers, and raw response shape from those files.
3. Account for frontend transforms: the wire response may differ from the value returned by an API wrapper.
4. Do not inspect other repos, generated OpenAPI sources, or dependency source unless the user explicitly asks.
5. Do not invent material parameter values. Find them in local call sites/defaults or explain why the request cannot yet be made reliably.

## Authenticated request pattern

Staging is `https://api-s.cloudability.com`. Never substitute a production Cloudability host.

First verify the credential exists without printing it:

```bash
[ -n "${CLDY_API_KEY:-}" ] || { echo "CLDY_API_KEY is not set" >&2; exit 1; }
```

For a simple GET:

```bash
set -o pipefail
curl --silent --show-error --fail-with-body \
  --user "$CLDY_API_KEY:" \
  'https://api-s.cloudability.com/v3/internal/dashboards' \
  -H 'accept: application/json' | jq
```

Prefer `--get` and one `--data-urlencode` per query value for dynamic or repeated parameters:

```bash
curl --silent --show-error --fail-with-body \
  --user "$CLDY_API_KEY:" \
  --get 'https://api-s.cloudability.com/v3/internal/reporting/cost/run' \
  --data-urlencode 'dimensions=date' \
  --data-urlencode 'dimensions=region' \
  --data-urlencode 'metrics=total_adjusted_amortized_cost' \
  -H 'accept: application/json' | jq
```

Never print, log, persist, or expose `CLDY_API_KEY`, and do not enable shell tracing. If authentication fails, report the status without revealing credentials.

## Mutation approval and safety boundary

- Proactively run GET or HEAD requests when the evidence rule above applies.
- Send POST, PUT, PATCH, or DELETE requests only to `https://api-s.cloudability.com`. Approval never permits production writes or writes to any other host.
- Before the first mutation, identify the investigation's stated scope and check whether the user has explicitly approved either its mutation plan or all staging mutations for that scope during the current session.
- Valid session-scoped approval includes: “I approve all staging mutations for this investigation” and, when clearly referring to staging, “create whatever test fixtures you need, perform any writes needed, and clean them up when done.”
- A general request such as “investigate this issue using staging” or “implement and test this feature” does **not** authorize writes.
- If approval is absent, ask once for either session-scoped approval or approval of a specific mutation plan. Do not execute a mutation until one is granted.
- After approval, do not ask again for each in-scope POST, PUT, PATCH, or DELETE. Ask again only if an operation materially exceeds the approved scope, affects non-test data, targets anything other than staging, or introduces substantially greater risk than the approved plan.
- Session-scoped approval automatically includes deleting agent-created test fixtures during cleanup; do not request separate cleanup approval.
- Use the smallest mutations needed. Track agent-created fixtures, clean them up when done, and report the staging state changed and the cleanup performed.

## Interpret the evidence

- Use `jq` to focus on relevant counts, fields, types, or records rather than treating a large raw dump as analysis.
- For product reasoning, connect the observed scale or values directly to the assumption being tested.
- For handwritten TypeScript types, compare field names, envelopes, and runtime value types against a representative live response.
- One response sample cannot prove exhaustiveness, optionality, nullability, or behavior for every account. Combine live evidence with repo-local code and types.
- Briefly state which endpoint was checked and the observation that affected the result.

Example product check:

```bash
curl --silent --show-error --fail-with-body \
  --user "$CLDY_API_KEY:" \
  'https://api-s.cloudability.com/v3/internal/reporting/cost/measures' \
  -H 'accept: application/json' \
  | jq '{total: length, dimensions: (map(select(.type == "dimension")) | length)}'
```
