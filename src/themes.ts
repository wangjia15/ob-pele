import type { ThemeId } from "./types";

export interface ThemeInfo {
	name: string;
	description: string;
}

export const THEMES: Record<ThemeId, ThemeInfo> = {
	obsidian: {
		name: "跟随 Obsidian",
		description: "使用当前 Obsidian 主题的背景、文字与强调色",
	},
	flexoki: {
		name: "Flexoki",
		description: "温暖的纸张底色与克制的墨色",
	},
	nord: {
		name: "Nord",
		description: "冷冽的北欧蓝灰",
	},
	solarized: {
		name: "Solarized",
		description: "经典的低对比明暗配色",
	},
	tokyo: {
		name: "Tokyo Night",
		description: "深蓝夜色与霓虹高光",
	},
	paper: {
		name: "Paper",
		description: "单色纸墨，适合打印与长文阅读",
	},
	github: {
		name: "GitHub",
		description: "清爽克制的 GitHub 配色",
	},
};
