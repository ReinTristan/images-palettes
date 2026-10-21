import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const THUMBS_DIR = join(".cache", "thumbs");
const RETRIES = 3;

function cachePath(url: string): string {
	return join(THUMBS_DIR, createHash("sha1").update(url).digest("hex"));
}

async function exists(path: string): Promise<boolean> {
	return access(path).then(
		() => true,
		() => false,
	);
}

async function fetchOnce(url: string): Promise<Buffer> {
	let lastError: unknown;
	for (let attempt = 1; attempt <= RETRIES; attempt++) {
		try {
			const res = await fetch(url);
			if (res.status === 404) throw Object.assign(new Error(`404 ${url}`), { notFound: true });
			if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
			return Buffer.from(await res.arrayBuffer());
		} catch (error) {
			lastError = error;
			if ((error as { notFound?: boolean }).notFound) break;
			await new Promise((r) => setTimeout(r, 500 * attempt));
		}
	}
	throw lastError;
}

/**
 * Downloads a thumbnail once and keeps it in .cache/thumbs. maxresdefault doesn't
 * exist for every video, so a 404 there falls back to hqdefault.
 */
export async function downloadThumbnail(url: string): Promise<Buffer> {
	const path = cachePath(url);
	if (await exists(path)) return readFile(path);

	let data: Buffer;
	try {
		data = await fetchOnce(url);
	} catch (error) {
		if (!(error as { notFound?: boolean }).notFound || !url.includes("maxresdefault")) throw error;
		data = await fetchOnce(url.replace("maxresdefault", "hqdefault"));
	}

	await mkdir(THUMBS_DIR, { recursive: true });
	await writeFile(path, data);
	return data;
}

/** Reads a local path or downloads a URL (used for --palette-image). */
export async function loadImage(source: string): Promise<Buffer> {
	return /^https?:\/\//.test(source) ? downloadThumbnail(source) : readFile(source);
}
