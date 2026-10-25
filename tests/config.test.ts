import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { CONFIG_DIR_ENV, DEFAULTS, defaultConfig, sanitize, saveSettings } from "../src/config.ts";
import { makeConfig } from "./helpers/make-config.ts";

let dir: string;

beforeAll(async () => {
	// The store is created lazily, so setting the env var before the first read is enough.
	dir = await mkdtemp(join(tmpdir(), "palettes-config-"));
	process.env[CONFIG_DIR_ENV] = dir;
});

describe("sanitize", () => {
	it("keeps valid fields", () => {
		const settings = { extractors: ["kmeans"], k: 4, concurrency: 2, top: 10, alpha: 0.3, threshold: 15, urlField: "img.src", openReport: true };
		expect(sanitize(settings)).toEqual(settings);
	});

	it("filters unknown extractors instead of dropping the list", () => {
		expect(sanitize({ extractors: ["kmeans", "removed", "vibrant"] })).toEqual({ extractors: ["kmeans", "vibrant"] });
	});

	it("drops invalid values so the defaults win", () => {
		expect(sanitize({ extractors: ["removed"], k: 0, top: "6abc", alpha: 2, threshold: "x", urlField: "", openReport: "yes" })).toEqual({});
	});

	it("ignores garbage", () => {
		expect(sanitize(null)).toEqual({});
		expect(sanitize("nope")).toEqual({});
	});
});

describe("defaultConfig", () => {
	it("overlays the saved settings on the defaults", async () => {
		await writeFile(join(dir, "config.json"), JSON.stringify({ k: 3, extractors: ["colorthief", "gone"] }));
		expect(defaultConfig()).toEqual({ ...DEFAULTS, k: 3, extractors: ["colorthief"] });
	});

	it("round-trips settings but not the session-only fields", () => {
		saveSettings(makeConfig({ top: 5, threshold: 12, input: "x.json", reference: { kind: "hex", value: "#fff" } }));
		const config = defaultConfig();
		expect(config).toMatchObject({ top: 5, threshold: 12 });
		expect(config.input).toBeUndefined();
		expect(config.reference).toBeUndefined();
	});
});
