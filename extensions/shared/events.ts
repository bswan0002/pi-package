export const EVENTS = {
	READONLY_GIT_CONFIRM_NEEDED: "readonly-git-permissions:confirm-needed",
	READONLY_GIT_BLOCKED: "readonly-git-permissions:blocked",
	READONLY_GIT_ALLOWED: "readonly-git-permissions:allowed",
	POST_EDIT_STARTED: "post-edit:started",
	POST_EDIT_JOB_STARTED: "post-edit:job-started",
	POST_EDIT_JOB_FINISHED: "post-edit:job-finished",
	POST_EDIT_RETRY: "post-edit:retry",
	POST_EDIT_FAILED: "post-edit:failed",
	POST_EDIT_COMPLETED: "post-edit:completed",
} as const;
