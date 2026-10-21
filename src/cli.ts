import { Command, InvalidArgumentError, Option } from "commander";
import { analyze } from "./analyze.ts";
import { createExtractor, parseExtractorNames, type ExtractorName } from "./extractors/index.ts";
import { readThumbnails } from "./input.ts";
import { rankThumbnails } from "./match.ts";
import { paletteFromImage, parseHexPalette } from "./reference.ts";
import { printRanking, writeReports, type Ranking } from "./report.ts";

function int(value: string): number {
	const n = Number.parseInt(value, 10);
	if (!Number.isFinite(n) || n < 1) throw new InvalidArgumentError("Must be an integer ≥ 1");
	return n;
}

function float(value: string): number {
	const n = Number.parseFloat(value);
	if (!Number.isFinite(n)) throw new InvalidArgumentError("Must be a number");
	return n;
}

function extractorList(value: string): ExtractorName[] {
	try {
		return parseExtractorNames(value);
	} catch (error) {
		throw new InvalidArgumentError((error as Error).message);
	}
}

interface CommonOptions {
	input: string;
	urlField?: string;
	titleField?: string;
	extractor: ExtractorName[];
	k: number;
	concurrency: number;
}

const program = new Command("palettes").description("Filter YouTube thumbnails by color palette");

function withCommonOptions(cmd: Command): Command {
	return cmd
		.requiredOption("-i, --input <file>", "thumbnails JSON")
		.option("--url-field <path>", "field holding the thumbnail URL (supports a.b.c); autodetected by default")
		.option("--title-field <path>", "field holding the title (supports a.b.c); autodetected by default")
		.addOption(
			new Option("-e, --extractor <name>", "kmeans | vibrant | colorthief | all").argParser(extractorList).default(extractorList("all"), "all"),
		)
		.option("-k, --k <n>", "colors per palette (kmeans/colorthief)", int, 6)
		.option("-c, --concurrency <n>", "parallel downloads/analyses", int, 8);
}

async function prepare(opts: CommonOptions) {
	const thumbnails = await readThumbnails(opts.input, { urlField: opts.urlField, titleField: opts.titleField });
	const extractors = opts.extractor.map((name) => createExtractor(name, { k: opts.k }));
	const caches = await analyze(thumbnails, extractors, opts.concurrency);
	return { thumbnails, extractors, caches };
}

withCommonOptions(program.command("analyze").description("Download thumbnails and extract their palettes (cached)")).action(
	async (opts: CommonOptions) => {
		const { thumbnails, caches } = await prepare(opts);
		for (const [extractor, cache] of caches) {
			const ok = thumbnails.filter((t) => cache[t.url]).length;
			console.log(`${extractor.name}: ${ok}/${thumbnails.length} palettes cached`);
		}
	},
);

withCommonOptions(program.command("match").description("Rank thumbnails against a reference palette"))
	.option("-p, --palette <hexes>", 'reference colors, e.g. "#1a1a2e,#e94560"')
	.option("--palette-image <path|url>", "image to take the reference palette from")
	.option("-t, --top <n>", "how many results to show", int, 30)
	.option("--threshold <score>", "drop results with a score above this", float)
	.option("-a, --alpha <0-1>", "weight of coverage vs purity", float, 0.6)
	.action(async (opts: CommonOptions & { palette?: string; paletteImage?: string; top: number; threshold?: number; alpha: number }) => {
		if (!opts.palette === !opts.paletteImage) {
			program.error("Pass either --palette or --palette-image (exactly one)");
		}
		const hexReference = opts.palette ? parseHexPalette(opts.palette) : undefined;
		const { thumbnails, caches } = await prepare(opts);

		const rankings: Ranking[] = [];
		for (const [extractor, palettes] of caches) {
			const reference = hexReference ?? (await paletteFromImage(opts.paletteImage!, extractor));
			const results = rankThumbnails(reference, thumbnails, palettes, opts);
			rankings.push({ extractor: extractor.name, reference, results, palettes });
		}

		rankings.forEach(printRanking);
		const { json, html } = await writeReports(rankings);
		console.log(`\n→ ${html}\n→ ${json}`);
	});

await program.parseAsync();
