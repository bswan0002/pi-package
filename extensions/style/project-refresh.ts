/** A session-owned queue: asynchronous work never retains an extension context. */
export function createProjectRefresh<T>(
	cwd: string,
	read: (cwd: string) => Promise<T>,
	publish: (result: T) => void,
	onError: (error: unknown) => void,
) {
	let active = true;
	let inFlight = false;
	let pending = false;

	const refresh = async (): Promise<boolean> => {
		if (!active) return false;
		const result = await read(cwd);
		if (!active) return false;
		publish(result);
		return true;
	};

	const schedule = () => {
		if (!active) return;
		if (inFlight) {
			pending = true;
			return;
		}
		inFlight = true;
		void refresh().catch((error) => {
			if (active) onError(error);
		}).finally(() => {
			inFlight = false;
			if (active && pending) {
				pending = false;
				schedule();
			}
		});
	};

	return {
		refresh,
		schedule,
		dispose() {
			active = false;
			pending = false;
		},
	};
}
