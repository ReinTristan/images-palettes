# CLAUDE.md

CLI that ranks YouTube thumbnails (from a JSON list) by how closely their color palette matches a reference palette. Node + TypeScript, ESM, pnpm. See README.md for usage.

## Commands

```sh
pnpm install
pnpm test                 # vitest run
pnpm typecheck            # tsc (noEmit)
pnpm analyze -i <json>    # download + extract palettes into .cache/
pnpm match -i <json> -p "#hex,#hex"   # or --palette-image <path|url>
```

There is no build step: everything runs through `tsx`. Use `pnpm` / `pnpm dlx`, not `npm`/`npx`: `devEngines` pins pnpm and npx fails inside the project.

## Architecture (`src/`)

Pipeline: `input` → `fetcher` → `pixels.normalizeImage` → extractors → `analyze` (cache) → `match` → `report`.

- `cli.ts`: commander. `analyze` and `match` share options via `withCommonOptions`; `match` calls the same `prepare()` (it analyzes whatever is missing).
- `input.ts`: reads the JSON (array, or an object wrapping an array), autodetects URL/title/id fields, accepts dotted `--url-field` / `--title-field`, and dedupes by URL.
- `fetcher.ts`: downloads with retries into `.cache/thumbs/<sha1(url)>`, with a `maxresdefault` → `hqdefault` fallback on 404.
- `pixels.ts`: sharp. `normalizeImage` center-crops 4:3 letterboxed thumbnails to 16:9 and resizes to 160×90 PNG. **Every extractor receives this normalized buffer.**
- `color.ts`: OKLab helpers. `rgbToOklab` is hand-rolled (LUT) for the k-means hot loop; culori handles parsing and formatting. `distance` = ΔEOK × 100.
- `extractors/`: the `PaletteExtractor` interface (`name`, `cacheKey`, `extract(buffer) → PaletteColor[]`) with three implementations, `kmeans`, `vibrant` and `colorthief`. All return `{ hex, lab, weight }`, with weights summing to ~1 and sorted desc. The registry and the `--extractor` parsing live in `extractors/index.ts`.
- `analyze.ts`: one cache file per `cacheKey` (`.cache/palettes.<cacheKey>.json`, keyed by URL), saved every 100 items.
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

Vitest builds synthetic images with sharp, so the tests need no network. A k-means test tolerates a tiny third cluster, because resizing blends the border column between two colors. That's expected behavior, not a bug.
