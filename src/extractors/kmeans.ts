import { distance, labToHex, rgbToOklab, type Lab, type PaletteColor } from "../color.ts";
import { readPixels } from "../pixels.ts";
import type { PaletteExtractor } from "./types.ts";

const MAX_ITERATIONS = 15;
/** Centroids closer than this (ΔEOK × 100) get merged — k is an upper bound, not a promise. */
const MERGE_DISTANCE = 3;

/** Small seeded PRNG so the same image always gives the same palette. */
function mulberry32(seed: number) {
	return () => {
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function sqDist(points: Float64Array, i: number, c: Lab): number {
	const dl = points[i * 3]! - c[0];
	const da = points[i * 3 + 1]! - c[1];
	const db = points[i * 3 + 2]! - c[2];
	return dl * dl + da * da + db * db;
}

function pointAt(points: Float64Array, i: number): Lab {
	return [points[i * 3]!, points[i * 3 + 1]!, points[i * 3 + 2]!];
}

/** k-means++ seeding. Stops early when every point already sits on a center (image with < k colors). */
function seedCenters(points: Float64Array, n: number, k: number, random: () => number): Lab[] {
	const centers: Lab[] = [pointAt(points, Math.floor(random() * n))];
	const nearest = new Float64Array(n).fill(Infinity);

	while (centers.length < k) {
		const last = centers[centers.length - 1]!;
		let total = 0;
		for (let i = 0; i < n; i++) {
			nearest[i] = Math.min(nearest[i]!, sqDist(points, i, last));
			total += nearest[i]!;
		}
		if (total < 1e-12) break;

		let target = random() * total;
		let chosen = n - 1;
		for (let i = 0; i < n; i++) {
			target -= nearest[i]!;
			if (target <= 0) {
				chosen = i;
				break;
			}
		}
		centers.push(pointAt(points, chosen));
	}
	return centers;
}

export function kmeans(points: Float64Array, k: number, seed = 42): PaletteColor[] {
	const n = points.length / 3;
	const random = mulberry32(seed);
	let centers = seedCenters(points, n, k, random);
	const assignment = new Int32Array(n);

	for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
		let changed = false;
		for (let i = 0; i < n; i++) {
			let best = 0;
			let bestDist = Infinity;
			for (let c = 0; c < centers.length; c++) {
				const d = sqDist(points, i, centers[c]!);
				if (d < bestDist) {
					bestDist = d;
					best = c;
				}
			}
			if (assignment[i] !== best) {
				assignment[i] = best;
				changed = true;
			}
		}

		const sums = centers.map(() => [0, 0, 0, 0]);
		for (let i = 0; i < n; i++) {
			const s = sums[assignment[i]!]!;
			s[0]! += points[i * 3]!;
			s[1]! += points[i * 3 + 1]!;
			s[2]! += points[i * 3 + 2]!;
			s[3]!++;
		}
		centers = centers.map((c, idx) => {
			const [l, a, b, count] = sums[idx]!;
			return count ? [l! / count, a! / count, b! / count] : c;
		});

		if (!changed && iter > 0) break;
	}

	const counts = new Array<number>(centers.length).fill(0);
	for (let i = 0; i < n; i++) counts[assignment[i]!]!++;

	const clusters = centers
		.map((lab, i) => ({ lab, count: counts[i]! }))
		.filter((c) => c.count > 0)
		.sort((x, y) => y.count - x.count);

	// Merge near-duplicates into the bigger cluster (weighted average).
	const merged: typeof clusters = [];
	for (const cluster of clusters) {
		const twin = merged.find((m) => distance(m.lab, cluster.lab) < MERGE_DISTANCE);
		if (!twin) {
			merged.push({ ...cluster });
			continue;
		}
		const total = twin.count + cluster.count;
		twin.lab = twin.lab.map((v, j) => (v * twin.count + cluster.lab[j]! * cluster.count) / total) as Lab;
		twin.count = total;
	}

	return merged.map(({ lab, count }) => ({ hex: labToHex(lab), lab, weight: count / n }));
}

export function createKmeansExtractor(k: number): PaletteExtractor {
	return {
		name: "kmeans",
		cacheKey: `kmeans-k${k}`,
		async extract(image) {
			const { data, width, height } = await readPixels(image);
			const n = width * height;
			const points = new Float64Array(n * 3);
			for (let i = 0; i < n; i++) {
				points.set(rgbToOklab(data[i * 3]!, data[i * 3 + 1]!, data[i * 3 + 2]!), i * 3);
			}
			return kmeans(points, k);
		},
	};
}
