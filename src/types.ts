export const THEME_IDS = [
	"obsidian",
	"flexoki",
	"nord",
	"solarized",
	"tokyo",
	"paper",
	"github",
] as const;

export type ThemeId = (typeof THEME_IDS)[number];
export type ColorScheme = "auto" | "light" | "dark";
export type ZoomMode = "auto" | "always" | "never";

export interface PeleSettings {
	theme: ThemeId;
	scheme: ColorScheme;
	zoom: ZoomMode;
	autoDirection: boolean;
	matchFont: boolean;
	fontFamily: string;
	matchFontSize: boolean;
	fontSize: number;
}

export const DEFAULT_SETTINGS: PeleSettings = {
	theme: "obsidian",
	scheme: "auto",
	zoom: "auto",
	autoDirection: true,
	matchFont: true,
	fontFamily: "",
	matchFontSize: true,
	fontSize: 16,
};

export function isThemeId(value: string): value is ThemeId {
	return (THEME_IDS as readonly string[]).includes(value);
}

export function isColorScheme(value: string): value is ColorScheme {
	return value === "auto" || value === "light" || value === "dark";
}

export function isZoomMode(value: string): value is ZoomMode {
	return value === "auto" || value === "always" || value === "never";
}
