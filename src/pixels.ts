import sharp from "sharp";

export const NORMALIZED_WIDTH = 160;
export const NORMALIZED_HEIGHT = 90;

/**
 * Loads a thumbnail and returns a small 16:9 PNG every extractor works from.
 * 4:3 YouTube thumbnails (hqdefault/sddefault/0.jpg) are 16:9 frames with black
 * letterbox bars baked in, so those get center-cropped to 16:9 first.
 */
export async function normalizeImage(input: string | Buffer): Promise<Buffer> {
	const image = sharp(input).rotate();
	const { width, height } = await image.metadata();
	if (!width || !height) throw new Error("Could not read the image size");

	if (Math.abs(width / height - 4 / 3) < 0.02) {
		const cropHeight = Math.round((width * 9) / 16);
		image.extract({ left: 0, top: Math.round((height - cropHeight) / 2), width, height: cropHeight });
	}

	return image
		.resize(NORMALIZED_WIDTH, NORMALIZED_HEIGHT, { fit: "fill" })
		.removeAlpha()
		.png()
		.toBuffer();
}

export interface RawPixels {
	data: Buffer;
	width: number;
	height: number;
}

/** Raw RGB bytes (3 per pixel) of an image. */
export async function readPixels(input: string | Buffer): Promise<RawPixels> {
	const { data, info } = await sharp(input).removeAlpha().raw().toBuffer({ resolveWithObject: true });
	return { data, width: info.width, height: info.height };
}
