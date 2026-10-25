import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { log, progress } from "@clack/prompts";
import pLimit from "p-limit";
import type { PaletteColor } from "./color.ts";
import type { PaletteExtractor } from "./extractors/index.ts";
import { downloadThumbnail } from "./fetcher.ts";
import type { Thumbnail } from "./input.ts";
import { normalizeImage } from "./pixels.ts";

export type PaletteCache = Record<string, PaletteColor[]>;

const cacheFile = (extractor: PaletteExtractor) => join(".cache", `palettes.${extractor.cacheKey}.json`);

async function loadCache(extractor: PaletteExtractor): Promise<PaletteCache> {
	try {
		return JSON.parse(await readFile(cacheFile(extractor), "utf8"));
	} catch {
		return {};
	}
}

async function saveCache(extractor: PaletteExtractor, cache: PaletteCache) {
	await mkdir(".cache", { recursive: true });
	await writeFile(cacheFile(extractor), JSON.stringify(cache));
}

/**
 * Makes sure every thumbnail has a palette for every extractor. Only downloads and
 * analyzes what's missing from the cache. Returns one cache per extractor.
 */
export async function analyze(
	thumbnails: Thumbnail[],
	extractors: PaletteExtractor[],
	concurrency: number,
): Promise<Map<PaletteExtractor, PaletteCache>> {
	const caches = new Map(await Promise.all(extractors.map(async (e) => [e, await loadCache(e)] as const)));
	const pending = thumbnails.filter((t) => extractors.some((e) => !caches.get(e)![t.url]));

	if (pending.length) {
		const bar = progress({ max: pending.length, style: "block", size: 24 });
		const label = (done: number, failed: number) =>
			`${done}/${pending.length} thumbnails${failed ? ` (${failed} failed)` : ""} · ${extractors.map((e) => e.name).join(", ")}`;
		bar.start(label(0, 0));
		const limit = pLimit(concurrency);
		let done = 0;
		// Collected and printed after the bar, so warnings don't break its redraws.
		const failures: string[] = [];

		await Promise.all(
			pending.map((thumb) =>
				limit(async () => {
					try {
						const image = await normalizeImage(await downloadThumbnail(thumb.url));
						for (const extractor of extractors) {
							const cache = caches.get(extractor)!;
							cache[thumb.url] ??= await extractor.extract(image);
						}
					} catch (error) {
						failures.push(`${thumb.url}: ${(error as Error).message}`);
					}
					done++;
					bar.advance(1, label(done, failures.length));
					// Save now and then so a crash halfway doesn't lose everything.
					if (done % 100 === 0) await Promise.all(extractors.map((e) => saveCache(e, caches.get(e)!)));
				}),
			),
		);
		await Promise.all(extractors.map((e) => saveCache(e, caches.get(e)!)));
		bar.stop(`Analyzed ${pending.length - failures.length}/${pending.length} new thumbnails (${thumbnails.length} total)`);
		for (const failure of failures) log.warn(failure);
	}

	return caches;
}
