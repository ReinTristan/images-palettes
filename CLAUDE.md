# CLAUDE.md

CLI that ranks YouTube thumbnails (from a JSON list) by how closely their color palette matches a reference palette. Node + TypeScript, ESM, pnpm. See README.md for usage.

## Commands

```sh
pnpm install
pnpm start                # interactive menu (needs a TTY)
pnpm test                 # vitest run
pnpm typecheck            # tsc (noEmit)
pnpm analyze -i <json>    # download + extract palettes into .cache/
pnpm match -i <json> -p "#hex,#hex"   # or --palette-image <path|url>
```

There is no build step: everything runs through `tsx`. Use `pnpm` / `pnpm dlx`, not `npm`/`npx`: `packageManager` pins pnpm and npx fails inside the project.

## Architecture (`src/`)

Pipeline: `input` → `fetcher` → `pixels.normalizeImage` → extractors → `analyze` (cache) → `match` → `report`.

Front-ends only build a `Config`; `run.ts` does the work and knows nothing about the CLI.

- `index.ts`: entry point. No args + TTY on stdin and stdout → `menu()`; otherwise commander (`analyze` | `match`, shared options via `withCommonOptions`). Expected failures throw `CliError` → clean message + `process.exitCode = 1` (never `process.exit`).
- `menu.ts`: @clack/prompts loop. Options are rebuilt each iteration so hints show current values; `editX(config)` editors return untouched on `isCancel`. Settings are saved in `finally`.
- `config.ts`: `Settings` (persisted with `conf`) + session-only `input`/`reference`. **Config is the source of truth**: `defaultConfig()` = `DEFAULTS` ← sanitized store, and it's the only reader of the store. Commander options have **no `.default()`**, so absent flags stay `undefined` and saved settings win. Flags aren't persisted. The store is created lazily; `IMAGES_PALETTES_CONFIG_DIR` overrides its folder. A new setting needs a field in `Settings`, `DEFAULTS`, `sanitize`, `pickSettings`, a flag and a menu editor.
- `utils.ts`: pure strict parsers (`parseInteger`, `parseNumber`, `parseAlpha`) and `CliError`. Commander and the menu wrap the same functions.
- `run.ts`: `validateConfig` (before any download), `runAnalyze`, `runMatch` (`match` analyzes whatever is missing, then optionally `open`s the report).
- `input.ts`: reads the JSON (array, or an object wrapping an array), autodetects URL/title/id fields, accepts dotted `--url-field` / `--title-field`, and dedupes by URL.
- `fetcher.ts`: downloads with retries into `.cache/thumbs/<sha1(url)>`, with a `maxresdefault` → `hqdefault` fallback on 404.
- `pixels.ts`: sharp. `normalizeImage` center-crops 4:3 letterboxed thumbnails to 16:9 and resizes to 160×90 PNG. **Every extractor receives this normalized buffer.**
- `color.ts`: OKLab helpers. `rgbToOklab` is hand-rolled (LUT) for the k-means hot loop; culori handles parsing and formatting. `distance` = ΔEOK × 100.
- `extractors/`: the `PaletteExtractor` interface (`name`, `cacheKey`, `extract(buffer) → PaletteColor[]`) with three implementations, `kmeans`, `vibrant` and `colorthief`. All return `{ hex, lab, weight }`, with weights summing to ~1 and sorted desc. The registry and the `--extractor` parsing live in `extractors/index.ts`.
- `analyze.ts`: one cache file per `cacheKey` (`.cache/palettes.<cacheKey>.json`, keyed by URL), saved every 100 items. Shows a clack `progress` bar; failures are collected and logged after it.
- `match.ts`: `score = alpha·coverage + (1−alpha)·purity`, lower is better. Image colors under 3% weight are ignored for coverage.
- `report.ts`: ANSI truecolor terminal output, plus `out/results.json` and a self-contained `out/results.html` (one tab per extractor, plus a compare tab).

## Conventions

- Imports use explicit `.ts` extensions (`allowImportingTsExtensions` + `verbatimModuleSyntax`); use `import type` for types.
- Tabs for indentation. Everything is in English: code, comments, CLI messages and the HTML report.
- Adding an extractor: implement `PaletteExtractor`, add its name to `EXTRACTOR_NAMES` and a case in `createExtractor`. Put every option that changes its output into `cacheKey`.
- Changing how palettes are computed (normalization, extractor options) without changing `cacheKey` leaves stale caches. Bump the key or tell the user to delete `.cache/palettes.*.json`.
- Library gotchas:
  - colorthief needs `ignoreWhite: false`, or it drops white.
  - node-vibrant returns generated swatches with `population: 0` for roles that aren't in the image; filter them out.
- `.cache/` and `out/` are gitignored. Don't commit input JSONs or reference images.

## Tests (`tests/`)

Vitest builds synthetic images with sharp, so the tests need no network. Use `tests/helpers/make-config.ts` to build configs, and point `IMAGES_PALETTES_CONFIG_DIR` at a temp dir before touching the store. A k-means test tolerates a tiny third cluster, because resizing blends the border column between two colors. That's expected behavior, not a bug.
