import { describe, expect, it } from "vitest";
import { CliError, parseAlpha, parseInteger, parseNumber } from "../src/utils.ts";

describe("parseInteger", () => {
	it("accepts positive integers", () => {
		expect(parseInteger("6")).toBe(6);
		expect(parseInteger(" 12 ")).toBe(12);
	});

	it.each(["6abc", "0", "-1", "1.5", "", "1e3"])("rejects %j", (value) => {
		expect(() => parseInteger(value)).toThrow(CliError);
	});
});

describe("parseNumber", () => {
	it("accepts decimals and negatives", () => {
		expect(parseNumber("12")).toBe(12);
		expect(parseNumber("0.5")).toBe(0.5);
		expect(parseNumber(".5")).toBe(0.5);
		expect(parseNumber("-3")).toBe(-3);
	});

	it.each(["12abc", "1e3", "", "abc", "."])("rejects %j", (value) => {
		expect(() => parseNumber(value)).toThrow(CliError);
	});
});

describe("parseAlpha", () => {
	it("accepts the [0, 1] range", () => {
		expect(parseAlpha("0")).toBe(0);
		expect(parseAlpha("0.6")).toBe(0.6);
		expect(parseAlpha("1")).toBe(1);
	});

	it.each(["1.5", "-0.1", "x"])("rejects %j", (value) => {
		expect(() => parseAlpha(value)).toThrow(CliError);
	});
});
