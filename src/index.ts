import { Command, CommanderError, InvalidArgumentError, Option } from "commander";
import pc from "picocolors";
import { DEFAULTS, defaultConfig, type Config } from "./config.ts";
import { parseExtractorNames, type ExtractorName } from "./extractors/index.ts";
import { menu } from "./menu.ts";
import { runAnalyze, runMatch } from "./run.ts";
import { CliError, parseAlpha, parseInteger, parseNumber } from "./utils.ts";

/** Turns a pure parser into a commander argParser (commander wants InvalidArgumentError). */
function arg<T>(parse: (value: string) => T): (value: string) => T {
	return (value) => {
		try {
			return parse(value);
		} catch (error) {
			throw new InvalidArgumentError((error as Error).message);
		}
	};
}

// No commander defaults: an absent flag stays undefined so the saved settings win.
const fallback = (value: unknown) => `(default: saved setting, or ${value})`;

interface CommonFlags {
	input?: string;
	urlField?: string;
	titleField?: string;
	extractor?: ExtractorName[];
	k?: number;
	concurrency?: number;
}

interface MatchFlags extends CommonFlags {
	palette?: string;
	paletteImage?: string;
	top?: number;
	threshold?: number | false;
	alpha?: number;
	open?: boolean;
}

const program = new Command("palettes")
	.description("Filter YouTube thumbnails by color palette. Run with no arguments for the interactive menu.")
	.exitOverride();

function withCommonOptions(cmd: Command): Command {
	return cmd
		.exitOverride()
		.option("-i, --input <file>", "thumbnails JSON")
		.option("--url-field <path>", "field holding the thumbnail URL (supports a.b.c); autodetected by default")
		.option("--title-field <path>", "field holding the title (supports a.b.c); autodetected by default")
		.addOption(new Option("-e, --extractor <name>", `kmeans | vibrant | colorthief | all ${fallback("all")}`).argParser(arg(parseExtractorNames)))
		.option("-k, --k <n>", `colors per palette (kmeans/colorthief) ${fallback(DEFAULTS.k)}`, arg(parseInteger))
		.option("-c, --concurrency <n>", `parallel downloads/analyses ${fallback(DEFAULTS.concurrency)}`, arg(parseInteger));
}

/** Saved settings overlaid with whatever flags were actually passed. */
function configFromFlags(flags: MatchFlags): Config {
	const config = defaultConfig();
	const set = <K extends keyof Config>(key: K, value: Config[K] | undefined) => {
		if (value !== undefined) config[key] = value;
	};
	set("input", flags.input);
	set("urlField", flags.urlField);
	set("titleField", flags.titleField);
	set("extractors", flags.extractor);
	set("k", flags.k);
	set("concurrency", flags.concurrency);
	set("top", flags.top);
	set("alpha", flags.alpha);
	set("openReport", flags.open);
	if (flags.threshold === false) config.threshold = undefined;
	else set("threshold", flags.threshold);

	if (flags.palette !== undefined && flags.paletteImage !== undefined) {
		throw new CliError("Pass either --palette or --palette-image, not both");
	}
	if (flags.palette !== undefined) config.reference = { kind: "hex", value: flags.palette };
	if (flags.paletteImage !== undefined) config.reference = { kind: "image", source: flags.paletteImage };
	return config;
}

withCommonOptions(program.command("analyze").description("Download thumbnails and extract their palettes (cached)")).action(
	async (flags: CommonFlags) => {
		await runAnalyze(configFromFlags(flags));
	},
);

withCommonOptions(program.command("match").description("Rank thumbnails against a reference palette"))
	.option("-p, --palette <hexes>", 'reference colors, e.g. "#1a1a2e,#e94560"')
	.option("--palette-image <path|url>", "image to take the reference palette from")
	.option("-t, --top <n>", `how many results to show ${fallback(DEFAULTS.top)}`, arg(parseInteger))
	.option("--threshold <score>", "drop results with a score above this (default: saved setting, or none)", arg(parseNumber))
	.option("--no-threshold", "ignore a saved threshold")
	.option("-a, --alpha <0-1>", `weight of coverage vs purity ${fallback(DEFAULTS.alpha)}`, arg(parseAlpha))
	.option("--open", `open the HTML report when done ${fallback("no")}`)
	.option("--no-open", "don't open the HTML report")
	.action(async (flags: MatchFlags) => {
		await runMatch(configFromFlags(flags));
	});

async function main() {
	if (process.argv.length <= 2) {
		if (process.stdin.isTTY && process.stdout.isTTY) return menu();
		console.error(program.helpInformation());
		console.error("The interactive menu needs a terminal; pass a command to run without one.");
		process.exitCode = 1;
		return;
	}
	await program.parseAsync();
}

try {
	await main();
} catch (error) {
	if (error instanceof CommanderError) {
		// Commander already printed the message (or the help).
		process.exitCode = error.exitCode;
	} else if (error instanceof CliError) {
		console.error(pc.red(`✖ ${error.message}`));
		process.exitCode = 1;
	} else {
		console.error(error);
		process.exitCode = 1;
	}
}
