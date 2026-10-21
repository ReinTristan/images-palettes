import { readFile } from "node:fs/promises";

export interface Thumbnail {
	url: string;
	videoId?: string;
	title?: string;
	/** Link to the video, when we can build one. */
	link?: string;
}

const URL_FIELDS = ["thumbnailUrl", "thumbnail", "thumb", "url", "snippet.thumbnails.maxres.url", "snippet.thumbnails.high.url"];
const TITLE_FIELDS = ["title", "name", "snippet.title"];
const ID_FIELDS = ["videoId", "id", "snippet.resourceId.videoId"];

function get(obj: unknown, path: string): unknown {
	return path.split(".").reduce<unknown>((cur, key) => (cur && typeof cur === "object" ? (cur as Record<string, unknown>)[key] : undefined), obj);
}

function firstString(obj: unknown, paths: string[]): string | undefined {
	for (const path of paths) {
		const value = get(obj, path);
		if (typeof value === "string" && value) return value;
	}
}

/** i.ytimg.com/vi/<id>/hqdefault.jpg and i.ytimg.com/vi_webp/<id>/... */
export function videoIdFromUrl(url: string): string | undefined {
	return url.match(/\/vi(?:_webp)?\/([\w-]{6,})\//)?.[1];
}

export interface FieldOptions {
	/** Path to the thumbnail URL (supports a.b.c). Autodetected when missing. */
	urlField?: string;
	/** Path to the title (supports a.b.c). Autodetected when missing. */
	titleField?: string;
}

function toThumbnail(item: unknown, { urlField, titleField }: FieldOptions): Thumbnail | undefined {
	const url = typeof item === "string" ? item : firstString(item, urlField ? [urlField] : URL_FIELDS);
	if (!url) return;
	const videoId = (typeof item === "object" && firstString(item, ID_FIELDS)) || videoIdFromUrl(url);
	return {
		url,
		videoId,
		title: typeof item === "object" ? firstString(item, titleField ? [titleField] : TITLE_FIELDS) : undefined,
		link: videoId ? `https://www.youtube.com/watch?v=${videoId}` : undefined,
	};
}

/**
 * Reads the thumbnails JSON. Accepts an array (of URL strings or objects) or an
 * object holding that array somewhere at the top level (e.g. `{ "videos": [...] }`).
 */
export async function readThumbnails(path: string, fields: FieldOptions = {}): Promise<Thumbnail[]> {
	const json: unknown = JSON.parse(await readFile(path, "utf8"));
	const items = Array.isArray(json)
		? json
		: json && typeof json === "object"
			? Object.values(json).find(Array.isArray)
			: undefined;
	if (!items) throw new Error(`${path}: no array of thumbnails found`);

	const thumbnails = items.map((item) => toThumbnail(item, fields));
	const skipped = thumbnails.filter((t) => !t).length;
	if (skipped) {
		console.warn(`⚠ ${skipped} items without a thumbnail URL (try --url-field <path>)`);
	}

	// Dedupe by URL, keeping the first occurrence.
	const seen = new Set<string>();
	return thumbnails.filter((t): t is Thumbnail => !!t && !seen.has(t.url) && !!seen.add(t.url));
}
