import { isColorScheme, isThemeId, type ColorScheme, type ThemeId } from "./types";

export interface DiagramSpec {
	source: string;
	theme?: ThemeId;
	scheme?: ColorScheme;
}

const THEME_LINE = /^%%\s*(?:pele[\s-]+)?theme\s*:\s*([a-zA-Z0-9_-]+)\s*$/;
const SCHEME_LINE = /^%%\s*(?:pele[\s-]+)?scheme\s*:\s*(auto|light|dark)\s*$/;

export function extractDirectives(source: string): DiagramSpec {
	const lines = source.replace(/\r\n?/g, "\n").split("\n");
	const kept: string[] = [];
	let theme: ThemeId | undefined;
	let scheme: ColorScheme | undefined;

	for (let index = 0; index < lines.length; index++) {
		const line = lines[index];
		const trimmed = line.trim();

		if (trimmed === "" || trimmed.startsWith("%%")) {
			const themeMatch = THEME_LINE.exec(trimmed);
			if (themeMatch && isThemeId(themeMatch[1].toLowerCase())) {
				theme = themeMatch[1].toLowerCase() as ThemeId;
				continue;
			}

			const schemeMatch = SCHEME_LINE.exec(trimmed);
			if (schemeMatch && isColorScheme(schemeMatch[1].toLowerCase())) {
				scheme = schemeMatch[1].toLowerCase() as ColorScheme;
				continue;
			}

			kept.push(line);
			continue;
		}

		kept.push(...lines.slice(index));
		break;
	}

	return { source: kept.join("\n").trim(), theme, scheme };
}
