import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { hexToRgb, type PaletteColor } from "./color.ts";
import type { ExtractorName } from "./extractors/index.ts";
import type { MatchResult } from "./match.ts";

export interface Ranking {
	extractor: ExtractorName;
	reference: PaletteColor[];
	results: MatchResult[];
	/** All palettes this extractor knows, by thumbnail URL (for the compare view). */
	palettes: Record<string, PaletteColor[]>;
}

const OUT_DIR = "out";

// ── Terminal ────────────────────────────────────────────────────────────────

function swatch(hex: string, width = 2): string {
	const [r, g, b] = hexToRgb(hex);
	return `\x1b[48;2;${r};${g};${b}m${" ".repeat(width)}\x1b[0m`;
}

const BAR_WIDTH = 16;

/** Proportional bar that's always exactly BAR_WIDTH cells wide (ANSI codes break padEnd). */
function swatches(palette: PaletteColor[]): string {
	let used = 0;
	return palette
		.map((c, i) => {
			const isLast = i === palette.length - 1;
			const width = isLast ? BAR_WIDTH - used : Math.min(BAR_WIDTH - used, Math.round(c.weight * BAR_WIDTH));
			used += width;
			return width > 0 ? swatch(c.hex, width) : "";
		})
		.join("");
}

export function printRanking({ extractor, reference, results }: Ranking) {
	console.log(`\n── ${extractor} ── reference ${reference.map((c) => swatch(c.hex)).join("")}  ${reference.map((c) => c.hex).join(" ")}`);
	if (!results.length) {
		console.log("  (no results — try raising --threshold)");
		return;
	}
	results.forEach((r, i) => {
		const label = r.thumbnail.title ?? r.thumbnail.link ?? r.thumbnail.url;
		console.log(
			`${String(i + 1).padStart(3)}. ${r.score.toFixed(1).padStart(5)}  ${swatches(r.palette)}  ${label}`,
		);
	});
}

// ── Files ──────────────────────────────────────────────────────────────────

const escapeHtml = (s: string) =>
	s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

function paletteBar(palette: PaletteColor[], label?: string): string {
	const segments = palette
		.map((c) => `<span style="flex:${c.weight.toFixed(4)};background:${c.hex}" title="${c.hex} · ${(c.weight * 100).toFixed(0)}%"></span>`)
		.join("");
	return `<div class="bar-row">${label ? `<span class="bar-label">${label}</span>` : ""}<div class="bar">${segments}</div></div>`;
}

function card(r: MatchResult, rank: number): string {
	const t = r.thumbnail;
	const title = escapeHtml(t.title ?? t.videoId ?? t.url);
	const href = escapeHtml(t.link ?? t.url);
	return `<article class="card">
	<a href="${href}" target="_blank" rel="noopener"><img src="${escapeHtml(t.url)}" loading="lazy" alt=""></a>
	${paletteBar(r.palette)}
	<div class="meta"><span class="rank">#${rank}</span><span class="title" title="${title}">${title}</span>
	<span class="score" title="coverage ${r.coverage.toFixed(1)} · purity ${r.purity.toFixed(1)}">${r.score.toFixed(1)}</span></div>
</article>`;
}

function compareView(rankings: Ranking[]): string {
	// Every thumbnail that made any top list, ordered by its best rank.
	const rows = new Map<string, { result: MatchResult; ranks: Map<ExtractorName, number> }>();
	for (const ranking of rankings) {
		ranking.results.forEach((result, i) => {
			const row = rows.get(result.thumbnail.url) ?? { result, ranks: new Map() };
			row.ranks.set(ranking.extractor, i + 1);
			rows.set(result.thumbnail.url, row);
		});
	}
	const sorted = [...rows.values()].sort((a, b) => Math.min(...a.ranks.values()) - Math.min(...b.ranks.values()));

	return sorted
		.map(({ result, ranks }) => {
			const t = result.thumbnail;
			const title = escapeHtml(t.title ?? t.videoId ?? t.url);
			const bars = rankings
				.map((rk) => {
					const palette = rk.palettes[t.url] ?? [];
					const rank = ranks.get(rk.extractor);
					return paletteBar(palette, `${rk.extractor} ${rank ? `#${rank}` : "—"}`);
				})
				.join("");
			return `<article class="card compare">
	<a href="${escapeHtml(t.link ?? t.url)}" target="_blank" rel="noopener"><img src="${escapeHtml(t.url)}" loading="lazy" alt=""></a>
	${bars}
	<div class="meta"><span class="title" title="${title}">${title}</span></div>
</article>`;
		})
		.join("\n");
}

function renderHtml(rankings: Ranking[]): string {
	const tabs = rankings.map((r) => r.extractor as string);
	if (rankings.length > 1) tabs.push("compare");

	const panels = rankings.map(
		(r) => `<section class="panel" data-panel="${r.extractor}">
	<div class="reference"><h2>Reference (${r.extractor})</h2>${paletteBar(r.reference)}<code>${r.reference.map((c) => c.hex).join(" ")}</code></div>
	<div class="grid">${r.results.map((res, i) => card(res, i + 1)).join("\n") || "<p>No results.</p>"}</div>
</section>`,
	);
	if (rankings.length > 1) {
		panels.push(`<section class="panel" data-panel="compare"><div class="grid">${compareView(rankings)}</div></section>`);
	}

	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Palette matches</title>
<style>
	:root { --bg: #f6f6f4; --surface: #fff; --text: #1d1d1b; --muted: #6b6b66; --border: #e2e2dd; --accent: #2f5bd3; }
	@media (prefers-color-scheme: dark) {
		:root { --bg: #141413; --surface: #1f1f1d; --text: #ececea; --muted: #9a9a94; --border: #33332f; --accent: #8aa8ff; }
	}
	* { box-sizing: border-box; }
	body { margin: 0; padding: 24px 16px; background: var(--bg); color: var(--text); font: 14px/1.4 system-ui, sans-serif; }
	h1 { font-size: 20px; margin: 0 0 16px; }
	h2 { font-size: 14px; margin: 0 0 8px; color: var(--muted); font-weight: 500; }
	nav { display: flex; gap: 4px; margin-bottom: 20px; flex-wrap: wrap; }
	nav button { border: 1px solid var(--border); background: var(--surface); color: var(--text); padding: 6px 14px; border-radius: 999px; cursor: pointer; font: inherit; }
	nav button[aria-selected="true"] { background: var(--accent); border-color: var(--accent); color: #fff; }
	.panel { display: none; }
	.panel.active { display: block; }
	.reference { margin-bottom: 20px; max-width: 480px; }
	.reference code { color: var(--muted); font-size: 12px; }
	.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
	.card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
	.card img { display: block; width: 100%; aspect-ratio: 16 / 9; object-fit: cover; }
	.bar-row { display: flex; align-items: center; gap: 8px; padding: 6px 10px 0; }
	.bar-label { font-size: 11px; color: var(--muted); width: 92px; flex: none; }
	.bar { display: flex; flex: 1; height: 16px; border-radius: 4px; overflow: hidden; }
	.bar span { min-width: 3px; }
	.meta { display: flex; gap: 8px; align-items: baseline; padding: 8px 10px 10px; }
	.rank { color: var(--muted); font-variant-numeric: tabular-nums; }
	.title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.score { font-variant-numeric: tabular-nums; font-weight: 600; }
</style>
</head>
<body>
<h1>Palette matches</h1>
<nav>${tabs.map((t) => `<button data-tab="${t}">${t}</button>`).join("")}</nav>
${panels.join("\n")}
<script>
	const buttons = document.querySelectorAll("nav button");
	function show(tab) {
		buttons.forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
		document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("active", p.dataset.panel === tab));
	}
	buttons.forEach((b) => b.addEventListener("click", () => show(b.dataset.tab)));
	show(buttons[0].dataset.tab);
</script>
</body>
</html>
`;
}

export async function writeReports(rankings: Ranking[]): Promise<{ json: string; html: string }> {
	await mkdir(OUT_DIR, { recursive: true });
	const json = join(OUT_DIR, "results.json");
	const html = join(OUT_DIR, "results.html");
	const data = Object.fromEntries(rankings.map((r) => [r.extractor, { reference: r.reference, results: r.results }]));
	await writeFile(json, JSON.stringify(data, null, 2));
	await writeFile(html, renderHtml(rankings));
	return { json, html };
}
