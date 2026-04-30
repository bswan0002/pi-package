/**
 * Session-owned input-buffer cell. Mutable by design — the reducer never
 * touches it. Mutation paths: effect handlers (`set_input_buffer`,
 * `clear_input_buffer`) and the inline-key fast path (`handleIgnoreInline`
 * for printable keys + backspace). The value flows to the view per tick via
 * `runtime.inputBuffer` → `selectOptionListProps` → OptionListView.
 */
export class InputBuffer {
	private value = "";

	get(): string {
		return this.value;
	}

	set(value: string): void {
		this.value = value;
	}

	clear(): void {
		this.value = "";
	}

	append(chunk: string): void {
		this.value = this.value + chunk;
	}

	backspace(): void {
		if (this.value.length === 0) return;
		this.value = this.value.slice(0, -1);
	}
}
