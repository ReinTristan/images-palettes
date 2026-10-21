import { createColorthiefExtractor } from "./colorthief.ts";
import { createKmeansExtractor } from "./kmeans.ts";
import { EXTRACTOR_NAMES, type ExtractorName, type ExtractorOptions, type PaletteExtractor } from "./types.ts";
import { createVibrantExtractor } from "./vibrant.ts";

export * from "./types.ts";

export function createExtractor(name: ExtractorName, { k }: ExtractorOptions): PaletteExtractor {
	switch (name) {
		case "kmeans":
			return createKmeansExtractor(k);
		case "vibrant":
			return createVibrantExtractor();
		case "colorthief":
			return createColorthiefExtractor(k);
	}
}

/** Parses the --extractor flag: one name, a comma list, or "all". */
export function parseExtractorNames(value: string): ExtractorName[] {
	if (value === "all") return [...EXTRACTOR_NAMES];
	const names = value.split(",").map((s) => s.trim());
	for (const name of names) {
		if (!EXTRACTOR_NAMES.includes(name as ExtractorName)) {
			throw new Error(`Unknown extractor "${name}". Options: ${EXTRACTOR_NAMES.join(", ")}, all`);
		}
	}
	return names as ExtractorName[];
}
