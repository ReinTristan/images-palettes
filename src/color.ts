import { converter, formatHex, parse } from "culori";

/** OKLab triple: l in [0, 1], a/b roughly in [-0.4, 0.4]. */
export type Lab = [l: number, a: number, b: number];

export interface PaletteColor {
	hex: string;
	lab: Lab;
	/** Share of the image this color represents, 0–1. Weights of a palette sum to ~1. */
	weight: number;
}

const toOklab = converter("oklab");
const toRgb = converter("rgb");

// sRGB 0–255 → linear lookup table, so the per-pixel conversion in k-means stays cheap.
const LINEAR = new Float64Array(256);
for (let i = 0; i < 256; i++) {
	const c = i / 255;
	LINEAR[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Hand-rolled sRGB (0–255) → OKLab for the hot loop. Same math culori uses. */
export function rgbToOklab(r: number, g: number, b: number): Lab {
	const lr = LINEAR[r]!;
	const lg = LINEAR[g]!;
	const lb = LINEAR[b]!;
	const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
	const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
	const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
	return [
		0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
		1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
		0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
	];
}

export function hexToLab(hex: string): Lab {
	const parsed = parse(hex.startsWith("#") ? hex : `#${hex}`);
	const lab = parsed && toOklab(parsed);
	if (!lab) throw new Error(`Invalid color: "${hex}"`);
	return [lab.l, lab.a, lab.b];
}

export function labToHex([l, a, b]: Lab): string {
	return formatHex({ mode: "oklab", l, a, b });
}

export function hexToRgb(hex: string): [number, number, number] {
	const rgb = toRgb(hex);
	if (!rgb) throw new Error(`Invalid color: "${hex}"`);
	const to255 = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255);
	return [to255(rgb.r), to255(rgb.g), to255(rgb.b)];
}

/**
 * Perceptual distance (ΔEOK × 100). Rough scale: <2 indistinguishable,
 * ~5 close, ~10 noticeably different, >20 clearly different colors.
 */
export function distance(x: Lab, y: Lab): number {
	return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) * 100;
}

export function normalizeWeights(colors: PaletteColor[]): PaletteColor[] {
	const total = colors.reduce((sum, c) => sum + c.weight, 0);
	if (total <= 0) return colors.map((c) => ({ ...c, weight: 1 / colors.length }));
	return colors.map((c) => ({ ...c, weight: c.weight / total }));
}
