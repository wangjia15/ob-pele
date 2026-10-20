import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { build } from "esbuild";

const dir = await mkdtemp(path.join(tmpdir(), "ob-pele-unit-"));
const outfile = path.join(dir, "unit.mjs");

try {
	await build({
		entryPoints: ["src/fences.ts", "src/directives.ts"],
		outdir: dir,
		bundle: true,
		format: "esm",
		platform: "node",
		logLevel: "silent",
	});

	const { findDiagramFences, fenceOverlapsSelection } = await import(
		pathToFileURL(path.join(dir, "fences.js")).href
	);
	const { extractDirectives } = await import(
		pathToFileURL(path.join(dir, "directives.js")).href
	);

	{
		const text = "before\n```mermaid\nflowchart LR\n  A --> B\n```\nafter\n";
		const fences = findDiagramFences(text);
		assert.equal(fences.length, 1);
		assert.equal(fences[0].source, "flowchart LR\n  A --> B\n");
		assert.equal(text.slice(fences[0].from, fences[0].to), "```mermaid\nflowchart LR\n  A --> B\n```\n");
	}

	{
		const text = "~~~pele\npie\n  \"a\" : 1\n~~~~\n";
		const fences = findDiagramFences(text);
		assert.equal(fences.length, 1);
		assert.equal(fences[0].source, "pie\n  \"a\" : 1\n");
	}

	{
		const text = "```js\nconst a = 1;\n```\n```mermaidz\nx\n```\n";
		assert.equal(findDiagramFences(text).length, 0);
	}

	{
		const text = "```mermaid\nflowchart LR\n  A --> B\n";
		assert.equal(findDiagramFences(text).length, 0);
	}

	{
		const text = "- item\n\t```mermaid\n\tgraph TD\n\t  A --> B\n\t```\n";
		assert.equal(findDiagramFences(text).length, 1);
	}

	{
		const text = "```mermaid {theme=dark}\nflowchart LR\n  A --> B\n```\n";
		assert.equal(findDiagramFences(text).length, 1);
	}

	{
		const ranges = [{ from: 10, to: 20 }];
		assert.equal(fenceOverlapsSelection(ranges, 0, 9), false);
		assert.equal(fenceOverlapsSelection(ranges, 0, 10), true);
		assert.equal(fenceOverlapsSelection(ranges, 20, 30), true);
		assert.equal(fenceOverlapsSelection(ranges, 21, 30), false);
	}

	{
		const spec = extractDirectives("%% theme: nord\n%% scheme: dark\nflowchart LR\n  A --> B");
		assert.equal(spec.theme, "nord");
		assert.equal(spec.scheme, "dark");
		assert.equal(spec.source, "flowchart LR\n  A --> B");
	}

	{
		const spec = extractDirectives("%%{init: {'theme':'base'}}%%\nflowchart LR\n  A --> B");
		assert.equal(spec.theme, undefined);
		assert.equal(spec.scheme, undefined);
		assert.equal(spec.source, "%%{init: {'theme':'base'}}%%\nflowchart LR\n  A --> B");
	}

	{
		const spec = extractDirectives("\n\n%% theme: nope\nflowchart LR\n  %% theme: flexoki\n  A --> B");
		assert.equal(spec.theme, undefined);
		assert.equal(spec.source, "%% theme: nope\nflowchart LR\n  %% theme: flexoki\n  A --> B");
	}

	{
		const spec = extractDirectives("  %% pele-theme: tokyo  \n%% pele scheme: light\npie\n  \"a\" : 1");
		assert.equal(spec.theme, "tokyo");
		assert.equal(spec.scheme, "light");
		assert.equal(spec.source, "pie\n  \"a\" : 1");
	}

	console.log("Unit checks passed.");
} finally {
	await rm(dir, { recursive: true, force: true });
}
