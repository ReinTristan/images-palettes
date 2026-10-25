import { existsSync } from "node:fs";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { DEFAULTS, defaultConfig, saveSettings, settingsPath, type Config, type Settings } from "./config.ts";
import { EXTRACTOR_NAMES } from "./extractors/index.ts";
import { isUrl } from "./fetcher.ts";
import { parseHexPalette } from "./reference.ts";
import { swatch } from "./report.ts";
import { runAnalyze, runMatch } from "./run.ts";
import { CliError, parseAlpha, parseInteger, parseNumber } from "./utils.ts";

const NOT_SET = pc.dim("not set");

/** Dragged-in paths often come quoted. */
const cleanPath = (value: string) => value.trim().replace(/^(['"])(.*)\1$/, "$2");

/** Wraps a pure parser as a clack validator. */
function validator(parse: (value: string) => unknown) {
	return (value: string | undefined) => {
		try {
			parse(value ?? "");
		} catch (error) {
			return (error as Error).message;
		}
	};
}

function referenceHint(config: Config): string {
	const ref = config.reference;
	if (!ref) return NOT_SET;
	if (ref.kind === "image") return `image ${ref.source}`;
	return parseHexPalette(ref.value)
		.map((c) => swatch(c.hex))
		.join("") + ` ${ref.value}`;
}

function settingsHint(s: Settings): string {
	const parts = [`k ${s.k}`, `top ${s.top}`, `alpha ${s.alpha}`];
	if (s.threshold !== undefined) parts.push(`threshold ${s.threshold}`);
	if (s.openReport) parts.push("open report");
	return parts.join(" · ");
}

// ── Editors: each one returns without touching config on cancel ─────────────

async function editInput(config: Config) {
	const value = await p.text({
		message: "Thumbnails JSON",
		placeholder: "./playlist.json",
		initialValue: config.input,
		validate: validator((v) => {
			if (!existsSync(cleanPath(v))) throw new CliError("File not found");
		}),
	});
	if (p.isCancel(value)) return;
	config.input = cleanPath(value);
}

async function editReference(config: Config) {
	const kind = await p.select({
		message: "Reference palette from",
		initialValue: config.reference?.kind ?? "hex",
		options: [
			{ value: "hex", label: "Hex colors", hint: '"#1a1a2e,#e94560"' },
			{ value: "image", label: "An image", hint: "local path or URL" },
		],
	});
	if (p.isCancel(kind)) return;

	if (kind === "hex") {
		const value = await p.text({
			message: "Colors (separated by commas or spaces)",
			placeholder: "#1a1a2e,#16213e,#e94560",
			initialValue: config.reference?.kind === "hex" ? config.reference.value : undefined,
			validate: validator(parseHexPalette),
		});
		if (p.isCancel(value)) return;
		config.reference = { kind, value: value.trim() };
	} else {
		const value = await p.text({
			message: "Image path or URL",
			placeholder: "./reference.jpg",
			initialValue: config.reference?.kind === "image" ? config.reference.source : undefined,
			validate: validator((v) => {
				const source = cleanPath(v);
				if (!source) throw new CliError("Required");
				if (!isUrl(source) && !existsSync(source)) throw new CliError("File not found");
			}),
		});
		if (p.isCancel(value)) return;
		config.reference = { kind, source: cleanPath(value) };
	}
}

async function editExtractors(config: Config) {
	const value = await p.multiselect({
		message: "Extractors",
		options: EXTRACTOR_NAMES.map((name) => ({ value: name, label: name })),
		initialValues: config.extractors,
		required: true,
	});
	if (p.isCancel(value)) return;
	config.extractors = value;
}

async function editNumber(config: Config, key: "k" | "concurrency" | "top" | "alpha", message: string, parse: (v: string) => number) {
	const value = await p.text({ message, initialValue: String(config[key]), validate: validator(parse) });
	if (p.isCancel(value)) return;
	config[key] = parse(value);
}

async function editThreshold(config: Config) {
	const value = await p.text({
		message: "Drop results with a score above (empty = no threshold)",
		initialValue: config.threshold === undefined ? "" : String(config.threshold),
		validate: validator((v) => v.trim() && parseNumber(v)),
	});
	if (p.isCancel(value)) return;
	config.threshold = value.trim() ? parseNumber(value) : undefined;
}

async function editField(config: Config, key: "urlField" | "titleField", message: string) {
	const value = await p.text({ message: `${message} (empty = autodetect)`, placeholder: "a.b.c", initialValue: config[key] ?? "" });
	if (p.isCancel(value)) return;
	config[key] = value.trim() || undefined;
}

async function editOpenReport(config: Config) {
	const value = await p.confirm({ message: "Open the HTML report after a match?", initialValue: config.openReport });
	if (p.isCancel(value)) return;
	config.openReport = value;
}

async function resetSettings(config: Config) {
	const value = await p.confirm({ message: "Reset every setting to its default?", initialValue: false });
	if (p.isCancel(value) || !value) return;
	Object.assign(config, { ...DEFAULTS, extractors: [...DEFAULTS.extractors], threshold: undefined, urlField: undefined, titleField: undefined });
}

async function settingsMenu(config: Config) {
	while (true) {
		const choice = await p.select({
			message: "Settings",
			options: [
				{ value: "k", label: "Palette size (k)", hint: `${config.k} · kmeans/colorthief` },
				{ value: "concurrency", label: "Concurrency", hint: String(config.concurrency) },
				{ value: "top", label: "Results to show", hint: String(config.top) },
				{ value: "alpha", label: "Alpha (coverage vs purity)", hint: String(config.alpha) },
				{ value: "threshold", label: "Score threshold", hint: config.threshold === undefined ? "none" : String(config.threshold) },
				{ value: "urlField", label: "URL field", hint: config.urlField ?? "autodetect" },
				{ value: "titleField", label: "Title field", hint: config.titleField ?? "autodetect" },
				{ value: "openReport", label: "Open report after match", hint: config.openReport ? "yes" : "no" },
				{ value: "reset", label: "Reset to defaults" },
				{ value: "back", label: "Back" },
			],
		});
		if (p.isCancel(choice) || choice === "back") return;

		switch (choice) {
			case "k":
				await editNumber(config, "k", "Colors per palette", parseInteger);
				break;
			case "concurrency":
				await editNumber(config, "concurrency", "Parallel downloads/analyses", parseInteger);
				break;
			case "top":
				await editNumber(config, "top", "How many results to show", parseInteger);
				break;
			case "alpha":
				await editNumber(config, "alpha", "Weight of coverage vs purity (0-1)", parseAlpha);
				break;
			case "threshold":
				await editThreshold(config);
				break;
			case "urlField":
				await editField(config, "urlField", "Field holding the thumbnail URL");
				break;
			case "titleField":
				await editField(config, "titleField", "Field holding the title");
				break;
			case "openReport":
				await editOpenReport(config);
				break;
			case "reset":
				await resetSettings(config);
				break;
		}
	}
}

/** Runs a task and keeps the menu alive whatever happens. */
async function attempt(task: () => Promise<unknown>) {
	try {
		await task();
	} catch (error) {
		p.log.error(error instanceof CliError ? error.message : ((error as Error).stack ?? String(error)));
	}
}

export async function menu(): Promise<void> {
	const config = defaultConfig();
	p.intro(pc.inverse(" images-palettes "));

	try {
		while (true) {
			// Rebuilt every loop so the hints show the current values.
			const choice = await p.select({
				message: "What now?",
				options: [
					{ value: "input", label: "Input JSON", hint: config.input ?? NOT_SET },
					{ value: "reference", label: "Reference palette", hint: referenceHint(config) },
					{ value: "extractors", label: "Extractors", hint: config.extractors.join(", ") },
					{ value: "settings", label: "Settings ›", hint: settingsHint(config) },
					{ value: "match", label: "Match", hint: "rank thumbnails against the reference" },
					{ value: "analyze", label: "Analyze only", hint: "download + cache palettes" },
					{ value: "exit", label: "Exit" },
				],
			});
			if (p.isCancel(choice) || choice === "exit") break;

			switch (choice) {
				case "input":
					await editInput(config);
					break;
				case "reference":
					await editReference(config);
					break;
				case "extractors":
					await editExtractors(config);
					break;
				case "settings":
					await settingsMenu(config);
					break;
				case "analyze":
					await attempt(() => runAnalyze(config));
					break;
				case "match":
					await attempt(() => runMatch(config));
					break;
			}
		}
	} finally {
		saveSettings(config);
		p.outro(`Settings saved to ${pc.dim(settingsPath())}`);
	}
}
