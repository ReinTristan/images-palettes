import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { log } from "@clack/prompts";
import open from "open";
import { analyze } from "./analyze.ts";
import type { Config } from "./config.ts";
import { createExtractor } from "./extractors/index.ts";
import { isUrl } from "./fetcher.ts";
import { readThumbnails } from "./input.ts";
import { rankThumbnails } from "./match.ts";
import { paletteFromImage, parseHexPalette } from "./reference.ts";
import { printRanking, writeReports, type Ranking } from "./report.ts";
import { CliError } from "./utils.ts";

/** Checks everything a run needs before downloading anything. */
export function validateConfig(config: Config, { needsReference }: { needsReference: boolean }): void {
	if (!config.input) throw new CliError("No input JSON set (-i, --input <file>)");
	if (!existsSync(config.input)) throw new CliError(`Input file not found: ${config.input}`);
	if (!config.extractors.length) throw new CliError("No extractor selected");
	if (!needsReference) return;
	if (!config.reference) throw new CliError("No reference palette set (--palette or --palette-image)");
	if (config.reference.kind === "hex") {
		try {
			parseHexPalette(config.reference.value);
		} catch (error) {
			throw new CliError((error as Error).message);
		}
	} else if (!isUrl(config.reference.source) && !existsSync(config.reference.source)) {
		throw new CliError(`Reference image not found: ${config.reference.source}`);
	}
}

async function prepare(config: Config) {
	const thumbnails = await readThumbnails(config.input!, { urlField: config.urlField, titleField: config.titleField });
	const extractors = config.extractors.map((name) => createExtractor(name, { k: config.k }));
	const caches = await analyze(thumbnails, extractors, config.concurrency);
	return { thumbnails, extractors, caches };
}

/** Downloads and analyzes whatever is missing from the caches. */
export async function runAnalyze(config: Config): Promise<void> {
	validateConfig(config, { needsReference: false });
	const { thumbnails, caches } = await prepare(config);
	for (const [extractor, cache] of caches) {
		const ok = thumbnails.filter((t) => cache[t.url]).length;
		log.success(`${extractor.name}: ${ok}/${thumbnails.length} palettes cached`);
	}
}

/** Analyzes what's missing, ranks against the reference and writes the reports. */
export async function runMatch(config: Config): Promise<{ rankings: Ranking[]; json: string; html: string }> {
	validateConfig(config, { needsReference: true });
	const reference = config.reference!;
	const hexReference = reference.kind === "hex" ? parseHexPalette(reference.value) : undefined;
	const { thumbnails, caches } = await prepare(config);

	const rankings: Ranking[] = [];
	for (const [extractor, palettes] of caches) {
		const palette = reference.kind === "hex" ? hexReference! : await paletteFromImage(reference.source, extractor);
		const results = rankThumbnails(palette, thumbnails, palettes, config);
		rankings.push({ extractor: extractor.name, reference: palette, results, palettes });
	}

	rankings.forEach(printRanking);
	const { json, html } = await writeReports(rankings);
	console.log(`\n→ ${html}\n→ ${json}\n`);

	if (config.openReport) {
		try {
			await open(resolve(html));
		} catch (error) {
			log.warn(`Couldn't open the report: ${(error as Error).message}`);
		}
	}
	return { rankings, json, html };
}
