/** An expected failure (bad input, missing option…): printed as a clean message, no stack trace. */
export class CliError extends Error {
	override name = "CliError";
}

/** Strict positive integer: "6" → 6, but "6abc", "0", "1.5" or "" throw. */
export function parseInteger(value: string): number {
	const n = Number(value.trim());
	if (!/^\d+$/.test(value.trim()) || n < 1) throw new CliError(`"${value}" must be an integer ≥ 1`);
	return n;
}

/** Strict decimal: "0.5", "-3", "12" → number, but "12abc", "1e3" or "" throw. */
export function parseNumber(value: string): number {
	if (!/^-?(\d+\.?\d*|\.\d+)$/.test(value.trim())) throw new CliError(`"${value}" must be a number`);
	return Number(value.trim());
}

/** A number between 0 and 1 (the coverage vs purity weight). */
export function parseAlpha(value: string): number {
	const n = parseNumber(value);
	if (n < 0 || n > 1) throw new CliError(`"${value}" must be between 0 and 1`);
	return n;
}
