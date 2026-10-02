export const EXTENSION_NAME = "pi-better-openai";
export const CONFIG_BASENAME = "pi-better-openai.json";
export const STATUS_KEY = "better-openai";
export const RESET_STATUS_KEY = "better-openai-resets";

export function logPrefix(): string {
  return `[${EXTENSION_NAME}]`;
}
