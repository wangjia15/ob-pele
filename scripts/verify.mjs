import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { render, supports } from "pele";

const dir = await mkdtemp(path.join(tmpdir(), "ob-pele-verify-"));
const outfile = path.join(dir, "showcase.mjs");

try {
	await build({
		entryPoints: ["src/showcase.ts"],
		bundle: true,
		format: "esm",
		platform: "node",
		outfile,
		logLevel: "silent",
	});

	const { SHOWCASE_NOTE } = await import(pathToFileURL(outfile).href);

	let failed = 0;
	let verified = 0;

	const checkBlocks = (label, markdown) => {
		const blocks = [
			...markdown.matchAll(/^[ \t]*```(?:mermaid|pele)\r?\n([\s\S]*?)^[ \t]*```/gm),
		].map((match) => match[1]);

		for (const [index, raw] of blocks.entries()) {
			const source = raw
				.split("\n")
				.filter((line) => !/^%%\s*(?:pele[\s-]+)?(?:theme|scheme)\s*:/i.test(line.trim()))
				.join("\n");

			if (!supports(source)) {
				console.error(`${label} diagram ${index + 1}: unsupported`);
				failed++;
				continue;
			}

			try {
				const result = render(source);
				verified++;
				console.log(
					`${label} diagram ${index + 1}: ${result.type} ${Math.round(result.width)}x${Math.round(result.height)}`,
				);
			} catch (error) {
				failed++;
				console.error(
					`${label} diagram ${index + 1}: ${error instanceof Error ? error.message : error}`,
				);
			}
		}

		if (blocks.length === 0) {
			console.error(`No ${label} diagrams found.`);
			failed++;
		}
	};

	checkBlocks("showcase", SHOWCASE_NOTE);

	for (const file of ["README.md", "docs/使用手册.md", "docs/案例.md"]) {
		let markdown;
		try {
			markdown = await readFile(file, "utf8");
		} catch {
			console.error(`Missing docs file: ${file}`);
			failed++;
			continue;
		}
		checkBlocks(file, markdown);
	}

	const css = await readFile("styles.css", "utf8");
	for (const theme of [
		"obsidian",
		"flexoki",
		"nord",
		"solarized",
		"tokyo",
		"paper",
		"github",
	]) {
		const selector = `.ob-pele-block[data-theme="${theme}"]`;
		if (!css.includes(selector)) {
			console.error(`Missing theme CSS: ${theme}`);
			failed++;
		}
	}

	if (failed > 0) process.exit(1);
	console.log(`All ${verified} diagrams and themes verified.`);
} finally {
	await rm(dir, { recursive: true, force: true });
}
