import { distance, type PaletteColor } from "./color.ts";
import type { Thumbnail } from "./input.ts";

/** Image colors below this weight are noise: they can't "cover" a reference color on their own. */
const MIN_COVER_WEIGHT = 0.03;

export interface MatchScore {
	/** Avg distance from each reference color to its closest image color. "Are all my colors there?" */
	coverage: number;
	/** Weighted avg distance from each image color to its closest reference color. "Is the image mostly my colors?" */
	purity: number;
	/** alpha·coverage + (1-alpha)·purity. Lower is better. */
	score: number;
}

export interface MatchResult extends MatchScore {
	thumbnail: Thumbnail;
	palette: PaletteColor[];
}

export interface MatchOptions {
	alpha: number;
	top: number;
	/** Drop results with a score above this. */
	threshold?: number;
}

function nearest(color: PaletteColor, palette: PaletteColor[]): number {
	return Math.min(...palette.map((c) => distance(color.lab, c.lab)));
}

export function scorePalette(reference: PaletteColor[], palette: PaletteColor[], alpha: number): MatchScore {
	const significant = palette.filter((c) => c.weight >= MIN_COVER_WEIGHT);
	const coverPool = significant.length ? significant : palette;

	const coverage = reference.reduce((sum, ref) => sum + nearest(ref, coverPool), 0) / reference.length;
	const totalWeight = palette.reduce((sum, c) => sum + c.weight, 0) || 1;
	const purity = palette.reduce((sum, c) => sum + c.weight * nearest(c, reference), 0) / totalWeight;

	return { coverage, purity, score: alpha * coverage + (1 - alpha) * purity };
}

export function rankThumbnails(
	reference: PaletteColor[],
	thumbnails: Thumbnail[],
	palettes: Record<string, PaletteColor[]>,
	{ alpha, top, threshold }: MatchOptions,
): MatchResult[] {
	return thumbnails
		.filter((t) => palettes[t.url]?.length)
		.map((thumbnail) => {
			const palette = palettes[thumbnail.url]!;
			return { thumbnail, palette, ...scorePalette(reference, palette, alpha) };
		})
		.filter((r) => threshold === undefined || r.score <= threshold)
		.sort((a, b) => a.score - b.score)
		.slice(0, top);
}
