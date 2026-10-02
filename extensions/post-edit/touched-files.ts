function record(value: unknown): Record<string, unknown> | undefined {
	return value !== null && typeof value === "object" ? value as Record<string, unknown> : undefined;
}

/** Shared by direct Pi results and conversion's nested completion notifications. */
export function touchedFiles(toolName: string, input: unknown, details: unknown, isError: boolean): string[] {
	if (toolName === "edit" || toolName === "write") {
		const path = record(input)?.path;
		return !isError && typeof path === "string" ? [path] : [];
	}
	if (toolName !== "apply_patch") return [];
	const patch = record(details);
	// Partial failures can already have changed files. Never infer success from patch input.
	if (patch?.status !== "success" && patch?.status !== "partial_failure") return [];
	const result = record(patch.result);
	if (!result) return [];
	return [...new Set(["changedFiles", "createdFiles", "deletedFiles", "movedFiles"].flatMap((key) => {
		const paths = result[key];
		return Array.isArray(paths) ? paths.filter((path): path is string => typeof path === "string") : [];
	}))];
}

export function resultDetails(result: unknown): unknown {
	return record(result)?.details;
}

export function resultIsError(result: unknown): boolean {
	return record(result)?.isError === true;
}
