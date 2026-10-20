export interface Fence {
	from: number;
	to: number;
	source: string;
}

const FENCE_LINE = /^([ \t]*)(`{3,}|~{3,})([^\n\r]*)$/gm;

const RENDERED_LANGUAGES = new Set(["mermaid", "pele"]);

interface OpenFence {
	from: number;
	marker: string;
	length: number;
	language: string;
}

export function findDiagramFences(text: string): Fence[] {
	const fences: Fence[] = [];
	let open: OpenFence | null = null;
	let match: RegExpExecArray | null;

	FENCE_LINE.lastIndex = 0;

	while ((match = FENCE_LINE.exec(text)) !== null) {
		const marker = match[2];
		const info = match[3].trim();
		const lineStart = match.index;
		const lineEnd = text.indexOf("\n", lineStart);
		const afterLine = lineEnd === -1 ? text.length : lineEnd + 1;

		if (open === null) {
			if (info === "") continue;
			const language = info.split(/\s+/)[0].replace(/^\{?\.?|\}$/g, "").toLowerCase();
			open = {
				from: lineStart,
				marker: marker[0],
				length: marker.length,
				language,
			};
			continue;
		}

		const closes =
			info === "" &&
			marker[0] === open.marker &&
			marker.length >= open.length;

		if (!closes) continue;

		if (RENDERED_LANGUAGES.has(open.language)) {
			const contentStart = text.indexOf("\n", open.from);
			const source =
				contentStart === -1 ? "" : text.slice(contentStart + 1, lineStart);
			fences.push({
				from: open.from,
				to: afterLine,
				source: source.replace(/\r\n?/g, "\n"),
			});
		}

		open = null;
	}

	return fences;
}

export function fenceOverlapsSelection(
	ranges: readonly { from: number; to: number }[],
	from: number,
	to: number,
): boolean {
	return ranges.some((range) => range.from <= to && range.to >= from);
}
