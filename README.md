# images-palettes

Find the YouTube thumbnail you half-remember by its colors.

Give it a JSON list of thumbnail URLs and a reference palette (hex colors or an image). It downloads every thumbnail, extracts its palette, and ranks them by how close they are to the reference. The results show up in the terminal and in a local HTML gallery.

It runs three palette extractors side by side so you can compare them:

| Extractor | How it works |
| --- | --- |
| `kmeans` | Hand-rolled k-means in OKLab (k-means++ seeding, deterministic). Gives the dominant colors with their share of the image. |
| `colorthief` | [Color Thief](https://github.com/lokesh/color-thief) median cut, quantized in OKLCH. |
| `vibrant` | [node-vibrant](https://github.com/Vibrant-Colors/node-vibrant) swatches (Vibrant, Muted, DarkVibrant…). These are color *roles*, not necessarily the dominant colors. It works well with `--palette-image` but is weaker with hand-picked hex colors. |

## Requirements

- Node.js ≥ 22.12
- pnpm (the version is pinned in `package.json`; Corepack downloads it for you)

## Setup

```sh
pnpm install
```

## Usage

### 1. Input

A JSON file with the thumbnails. Any of these shapes work:

```jsonc
// array of URLs
["https://i.ytimg.com/vi/5WD0s3zJLmg/hqdefault.jpg", "..."]

// array of objects
[{ "title": "Artist - Song", "thumbnailUrl": "https://i.ytimg.com/vi/.../hqdefault.jpg" }]

// object wrapping the array
{ "name": "Some channel", "songs": [{ "rawTitle": "...", "thumbnail": "..." }] }
```

The URL and title fields are autodetected (`thumbnailUrl`, `thumbnail`, `url`, `title`, `name`, YouTube API `snippet.*`…). If yours are named differently, pass `--url-field` and `--title-field`. Both accept dotted paths like `img.src`.

Duplicate URLs are analyzed only once.

### 2. Analyze

```sh
pnpm analyze -i playlist.json
```

This downloads the thumbnails to `.cache/thumbs/` and stores one palette cache per extractor in `.cache/palettes.<extractor>.json`. It only processes what's missing from the cache, so re-runs are instant. `match` runs this step for you, so it's optional.

### 3. Match

```sh
# hex colors (with or without #, separated by commas or spaces)
pnpm match -i playlist.json -p "#1a1a2e,#16213e,#e94560"

# or take the palette from an image (local path or URL)
pnpm match -i playlist.json --palette-image ./reference.jpg
```

This prints a ranking per extractor and writes:

- `out/results.html`: a gallery with one tab per extractor, plus a **compare** tab that shows the three palettes of each thumbnail side by side.
- `out/results.json`: the same data, machine-readable.

### Options

| Option | Default | Description |
| --- | --- | --- |
| `-i, --input <file>` | required | Thumbnails JSON |
| `--url-field <path>` | autodetect | Field holding the thumbnail URL |
| `--title-field <path>` | autodetect | Field holding the title |
| `-e, --extractor <name>` | `all` | `kmeans`, `vibrant`, `colorthief`, a comma list, or `all` |
| `-k, --k <n>` | `6` | Palette size for `kmeans` / `colorthief` |
| `-c, --concurrency <n>` | `8` | Parallel downloads / analyses |
| `-p, --palette <hexes>` | | Reference colors (`match` only) |
| `--palette-image <path\|url>` | | Reference image (`match` only) |
| `-t, --top <n>` | `30` | Results to show (`match` only) |
| `--threshold <score>` | none | Drop results with a score above this (`match` only) |
| `-a, --alpha <0-1>` | `0.6` | Coverage vs purity weight (`match` only) |

## How the score works

Colors are compared in OKLab, where distance roughly follows how different two colors look. Distances are ΔEOK × 100: under 2 you can't tell them apart, around 10 the difference is noticeable, and over 20 they're clearly different colors.

Each thumbnail gets two numbers:

- **Coverage**: for each reference color, the distance to the closest color in the thumbnail, averaged. This asks "are all my colors there?" Colors covering less than 3% of the image don't count here.
- **Purity**: for each thumbnail color, the distance to the closest reference color, weighted by how much of the image it covers. This asks "is the image mostly my colors?"

`score = alpha × coverage + (1 − alpha) × purity`. Lower is better. Raise `--alpha` if you only care that your colors appear, and lower it if you want images made *only* of your colors.

Before analysis, every image is normalized to 160×90. 4:3 thumbnails (`hqdefault`, `sddefault`), which have black letterbox bars baked in, are center-cropped to 16:9 first. A `maxresdefault` URL that returns 404 falls back to `hqdefault`.

## Development

```sh
pnpm test        # vitest
pnpm typecheck   # tsc (noEmit)
```

## License

[MIT](LICENSE.md)
