import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readThumbnails } from "../src/input.ts";

async function jsonFile(data: unknown) {
	const path = join(await mkdtemp(join(tmpdir(), "thumbs-")), "t.json");
	await writeFile(path, JSON.stringify(data));
	return path;
}

describe("readThumbnails", () => {
	it("reads plain URL arrays and derives the video id", async () => {
		const [t] = await readThumbnails(await jsonFile(["https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"]));
		expect(t).toMatchObject({ videoId: "dQw4w9WgXcQ", link: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
	});

	it("autodetects common fields inside a wrapper object and dedupes", async () => {
		const items = [{ title: "A", thumbnailUrl: "https://x/a.jpg", videoId: "aaaaaaaaaaa" }];
		const thumbs = await readThumbnails(await jsonFile({ videos: [...items, ...items] }));
		expect(thumbs).toEqual([{ url: "https://x/a.jpg", title: "A", videoId: "aaaaaaaaaaa", link: "https://www.youtube.com/watch?v=aaaaaaaaaaa" }]);
	});

	it("supports a dotted --url-field", async () => {
		const thumbs = await readThumbnails(await jsonFile([{ img: { src: "https://x/b.jpg" } }]), { urlField: "img.src" });
		expect(thumbs[0]?.url).toBe("https://x/b.jpg");
	});

	it("supports a custom --title-field", async () => {
		const thumbs = await readThumbnails(await jsonFile([{ thumbnail: "https://x/c.jpg", rawTitle: "Artist - Song" }]), {
			titleField: "rawTitle",
		});
		expect(thumbs[0]?.title).toBe("Artist - Song");
	});
});
