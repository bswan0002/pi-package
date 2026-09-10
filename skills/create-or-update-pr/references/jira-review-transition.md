# Jira review transition after PR creation

Move the associated Jira ticket to Engineering Review, or the project's equivalent code-review status, after creating and verifying a new PR. Include this operation in the PR approval proposal. This applies to new draft PRs too unless the user requests otherwise; disclose that in the proposal. Never transition a ticket before PR creation succeeds.

## Discover before approval

Use the same Jira site, issue key, and `ATLASSIAN_EMAIL` / `ATLASSIAN_API_KEY` credentials as the ticket lookup. For Apptio, the site is `https://apptio.atlassian.net`. Never print credentials or authorization headers or enable shell tracing.

Read the current status and available transitions using authenticated GET requests:

- `/rest/api/3/issue/{issueKey}?fields=status`
- `/rest/api/3/issue/{issueKey}/transitions?expand=transitions.fields`

Choose by each transition's destination `to.name`, not merely its action `name`. Transition IDs are issue/workflow-specific; never hardcode or reuse them across tickets.

1. Prefer a destination named `Engineering Review` (case-insensitive).
2. Otherwise select a clearly equivalent engineering/code-review destination, such as `Code Review`, `Peer Review`, or `In Review`, only when available workflow context makes the meaning unambiguous. A generic review label or Jira's `indeterminate` status category alone does not prove equivalence. Do not substitute QA, testing, product review, or approval stages.
3. If multiple plausible destinations/actions remain, or the equivalent is unclear, ask the user to choose from the actual available options. Do not invent a status or attempt intermediate transitions to reach an unavailable destination.
4. If already in the intended review status, report that no transition is needed. Do not move completed tickets backward automatically.
5. Inspect `fields` for required inputs. Ask for missing required values rather than inventing them or changing unrelated issue fields.
6. Include the issue key and exact destination in the PR proposal. If discovery fails or credentials are absent, disclose that the Jira step is blocked; PR creation can still proceed with approval. Any later target not covered by the approval requires confirmation.

## Execute after successful creation

Re-read the current status and available transitions before writing. If already at the approved destination, do nothing. If the destination is no longer available, the issue has moved to a completed status, or required inputs changed, stop the Jira step and report or ask; do not improvise another transition.

POST `/rest/api/3/issue/{issueKey}/transitions` with `Content-Type: application/json` and the freshly discovered transition ID:

```json
{"transition":{"id":"<discovered transition ID>"}}
```

Include required fields only when their values were explicitly approved. Use an authenticated request with HTTP error checking, such as `curl --silent --show-error --fail-with-body`, following the credential handling above.

After the POST, GET the ticket's status again and confirm the destination. If the POST times out or its outcome is uncertain, read the status before considering a retry. Never claim success based solely on sending the request.

Return the PR URL plus the issue key and verified status, or the specific reason the Jira step was skipped/failed. Do not recreate, close, or undo the PR because Jira failed. Do not transition tickets merely because PR metadata was updated, or retrospectively transition the current conversation's ticket while editing this skill.
