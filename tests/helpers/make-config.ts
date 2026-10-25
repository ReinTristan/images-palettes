import { DEFAULTS, type Config } from "../../src/config.ts";

/** A full Config from the defaults, so adding a field doesn't mean editing every test. */
export function makeConfig(overrides: Partial<Config> = {}): Config {
	return { ...DEFAULTS, extractors: [...DEFAULTS.extractors], ...overrides };
}
