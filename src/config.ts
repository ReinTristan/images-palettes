import Conf from "conf";
import { EXTRACTOR_NAMES, type ExtractorName } from "./extractors/index.ts";
import { parseAlpha, parseInteger, parseNumber } from "./utils.ts";

/** What gets persisted between runs. */
export interface Settings {
	extractors: ExtractorName[];
	k: number;
	concurrency: number;
	top: number;
	alpha: number;
	threshold?: number;
	urlField?: string;
	titleField?: string;
	openReport: boolean;
}

export type Reference = { kind: "hex"; value: string } | { kind: "image"; source: string };

/** Everything a run needs. Settings are persisted; input and reference only live for the session. */
export interface Config extends Settings {
	input?: string;
	reference?: Reference;
}

export const DEFAULTS: Settings = {
	extractors: [...EXTRACTOR_NAMES],
	k: 6,
	concurrency: 8,
	top: 30,
	alpha: 0.6,
	openReport: false,
};

/** Overrides where settings are stored (tests and manual runs shouldn't clobber real prefs). */
export const CONFIG_DIR_ENV = "IMAGES_PALETTES_CONFIG_DIR";

let store: Conf<Record<string, unknown>> | undefined;

// Created on first use, so importing this module never touches disk.
function getStore() {
	store ??= new Conf({ projectName: "images-palettes", cwd: process.env[CONFIG_DIR_ENV] || undefined });
	return store;
}

export function settingsPath(): string {
	return getStore().path;
}

/** Keeps only the valid fields of a store written by any version; invalid ones fall back to the defaults. */
export function sanitize(raw: unknown): Partial<Settings> {
	if (!raw || typeof raw !== "object") return {};
	const r = raw as Record<string, unknown>;
	const out: Partial<Settings> = {};

	const valid = <T>(value: unknown, parse: (s: string) => T): T | undefined => {
		if (typeof value !== "number" && typeof value !== "string") return undefined;
		try {
			return parse(String(value));
		} catch {
			return undefined;
		}
	};

	if (Array.isArray(r.extractors)) {
		const names = r.extractors.filter((n): n is ExtractorName => EXTRACTOR_NAMES.includes(n));
		if (names.length) out.extractors = [...new Set(names)];
	}
	for (const key of ["k", "concurrency", "top"] as const) {
		const n = valid(r[key], parseInteger);
		if (n !== undefined) out[key] = n;
	}
	const alpha = valid(r.alpha, parseAlpha);
	if (alpha !== undefined) out.alpha = alpha;
	const threshold = valid(r.threshold, parseNumber);
	if (threshold !== undefined) out.threshold = threshold;
	for (const key of ["urlField", "titleField"] as const) {
		if (typeof r[key] === "string" && r[key]) out[key] = r[key];
	}
	if (typeof r.openReport === "boolean") out.openReport = r.openReport;
	return out;
}

/** Defaults overlaid with the saved settings. The only place that reads the store. */
export function defaultConfig(): Config {
	return { ...DEFAULTS, ...sanitize(getStore().store) };
}

export function pickSettings(config: Config): Settings {
	const { extractors, k, concurrency, top, alpha, threshold, urlField, titleField, openReport } = config;
	return { extractors, k, concurrency, top, alpha, threshold, urlField, titleField, openReport };
}

export function saveSettings(config: Config): void {
	// JSON round-trip drops undefined fields (conf rejects them).
	getStore().store = JSON.parse(JSON.stringify(pickSettings(config)));
}
