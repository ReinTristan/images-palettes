import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { Reference } from "../src/config.ts";
import { validateConfig } from "../src/run.ts";
import { CliError } from "../src/utils.ts";
import { makeConfig } from "./helpers/make-config.ts";

let input: string;

beforeAll(async () => {
	input = join(await mkdtemp(join(tmpdir(), "palettes-run-")), "t.json");
	await writeFile(input, "[]");
});

describe("validateConfig", () => {
	it("needs an existing input", () => {
		expect(() => validateConfig(makeConfig(), { needsReference: false })).toThrow(/No input/);
		expect(() => validateConfig(makeConfig({ input: "missing.json" }), { needsReference: false })).toThrow(/not found/);
		expect(() => validateConfig(makeConfig({ input }), { needsReference: false })).not.toThrow();
	});

	it("needs a valid reference to match", () => {
		const check = (reference?: Reference) => () =>
			validateConfig(makeConfig({ input, reference }), { needsReference: true });
		expect(check()).toThrow(CliError);
		expect(check({ kind: "hex", value: "#zzz" })).toThrow(CliError);
		expect(check({ kind: "image", source: "missing.jpg" })).toThrow(/not found/);
		expect(check({ kind: "image", source: "https://example.com/a.jpg" })).not.toThrow();
		expect(check({ kind: "hex", value: "#1a1a2e,#e94560" })).not.toThrow();
	});
});
