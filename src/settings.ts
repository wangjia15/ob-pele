import { PluginSettingTab, Setting, type App } from "obsidian";
import type PelePlugin from "./main";
import { THEMES } from "./themes";
import {
	THEME_IDS,
	isColorScheme,
	isThemeId,
	isZoomMode,
	type ColorScheme,
	type ZoomMode,
} from "./types";

const PREVIEW_SOURCE = `flowchart LR
  A[笔记] --> B{渲染}
  B -->|Pele| C[图表]
  B -->|内置| D[Mermaid]`;

export class PeleSettingTab extends PluginSettingTab {
	private previewHost: HTMLElement | null = null;
	private previewHint: HTMLElement | null = null;
	private saveTimer = 0;

	constructor(
		app: App,
		private readonly plugin: PelePlugin,
	) {
		super(app, plugin);
	}

	override display(): void {
		const { containerEl } = this;
		containerEl.empty();
		this.cleanupPreview();

		new Setting(containerEl)
			.setName("主题")
			.setDesc("所有图表默认使用的配色。")
			.addDropdown((dropdown) => {
				for (const id of THEME_IDS) {
					dropdown.addOption(id, THEMES[id].name);
				}
				dropdown.setValue(this.plugin.settings.theme);
				dropdown.onChange(async (value) => {
					if (!isThemeId(value)) return;
					this.plugin.settings.theme = value;
					await this.plugin.saveSettings();
					this.renderPreview();
				});
			});

		this.previewHost = containerEl.createDiv({ cls: "ob-pele-settings-preview" });
		this.renderPreview();

		this.previewHint = containerEl.createDiv({ cls: "ob-pele-settings-hint" });
		this.previewHint.setText(THEMES[this.plugin.settings.theme].description);

		new Setting(containerEl)
			.setName("明暗模式")
			.setDesc("固定主题的明暗版本。跟随 Obsidian 会在切换外观时自动换色。")
			.addDropdown((dropdown) => {
				const options: Record<ColorScheme, string> = {
					auto: "跟随 Obsidian",
					light: "浅色",
					dark: "深色",
				};
				for (const [value, label] of Object.entries(options)) {
					dropdown.addOption(value, label);
				}
				dropdown.setValue(this.plugin.settings.scheme);
				dropdown.onChange(async (value) => {
					if (!isColorScheme(value)) return;
					this.plugin.settings.scheme = value;
					await this.plugin.saveSettings();
					this.renderPreview();
				});
			});

		new Setting(containerEl)
			.setName("缩放")
			.setDesc("自动：图表超出宽度时可缩放；始终：总是显示缩放按钮；关闭：禁用缩放。")
			.addDropdown((dropdown) => {
				const options: Record<ZoomMode, string> = {
					auto: "自动",
					always: "始终",
					never: "关闭",
				};
				for (const [value, label] of Object.entries(options)) {
					dropdown.addOption(value, label);
				}
				dropdown.setValue(this.plugin.settings.zoom);
				dropdown.onChange(async (value) => {
					if (!isZoomMode(value)) return;
					this.plugin.settings.zoom = value;
					await this.plugin.saveSettings();
					this.renderPreview();
				});
			});

		new Setting(containerEl)
			.setName("窄屏自动转向")
			.setDesc("容器较窄时，允许横向流程图切换为纵向布局。")
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.autoDirection);
				toggle.onChange(async (value) => {
					this.plugin.settings.autoDirection = value;
					await this.plugin.saveSettings();
					this.renderPreview();
				});
			});

		const fontSetting = new Setting(containerEl)
			.setName("跟随笔记字体")
			.setDesc("使用当前 Obsidian 正文字体。关闭后可指定字体族。");

		const customFontSetting = new Setting(containerEl)
			.setName("字体族")
			.setDesc("例如 Inter, Noto Sans SC, sans-serif。")
			.addText((text) => {
				text.setPlaceholder("sans-serif");
				text.setValue(this.plugin.settings.fontFamily);
				text.setDisabled(this.plugin.settings.matchFont);
				text.onChange((value) => {
					this.plugin.settings.fontFamily = value;
					this.scheduleSave();
				});
			});

		fontSetting.addToggle((toggle) => {
			toggle.setValue(this.plugin.settings.matchFont);
			toggle.onChange(async (value) => {
				this.plugin.settings.matchFont = value;
				controlInput(customFontSetting).disabled = value;
				await this.plugin.saveSettings();
				this.renderPreview();
			});
		});

		const sizeSetting = new Setting(containerEl)
			.setName("跟随笔记字号")
			.setDesc("使用笔记正文的字号。关闭后可指定图表的基准字号。");

		const customSizeSetting = new Setting(containerEl)
			.setName("基准字号")
			.setDesc("图表标签的基准字号，单位 px。")
			.addSlider((slider) => {
				slider
					.setLimits(10, 32, 1)
					.setValue(this.plugin.settings.fontSize)
					.setDynamicTooltip()
					.setDisabled(this.plugin.settings.matchFontSize)
					.onChange((value) => {
						this.plugin.settings.fontSize = value;
						this.scheduleSave();
					});
			});

		sizeSetting.addToggle((toggle) => {
			toggle.setValue(this.plugin.settings.matchFontSize);
			toggle.onChange(async (value) => {
				this.plugin.settings.matchFontSize = value;
				controlInput(customSizeSetting).disabled = value;
				await this.plugin.saveSettings();
				this.renderPreview();
			});
		});

		new Setting(containerEl)
			.setName("重新渲染")
			.setDesc("手动刷新所有打开的笔记中的图表。")
			.addButton((button) => {
				button.setButtonText("重新渲染").onClick(() => {
					this.plugin.refreshViews();
					this.renderPreview();
				});
			});

		const hint = containerEl.createDiv({ cls: "ob-pele-settings-hint" });
		hint.createEl("p", {
			text: "在代码块最前面加入指令，可以只为当前图表覆盖主题和明暗模式：",
		});
		const pre = hint.createEl("pre");
		pre.createEl("code", {
			text: `%% theme: nord
%% scheme: dark
flowchart LR
  A --> B`,
		});
		const optionsLine = hint.createEl("p");
		optionsLine.appendText("theme 可选：");
		optionsLine.createEl("code", { text: THEME_IDS.join(" / ") });
		optionsLine.appendText("；scheme 可选：auto / light / dark。");
	}

	override hide(): void {
		window.clearTimeout(this.saveTimer);
		this.cleanupPreview();
		super.hide();
	}

	private renderPreview(): void {
		if (!this.previewHost) return;
		this.plugin.renderer.render(this.previewHost, PREVIEW_SOURCE);
		this.previewHint?.setText(THEMES[this.plugin.settings.theme].description);
	}

	private scheduleSave(): void {
		window.clearTimeout(this.saveTimer);
		this.saveTimer = window.setTimeout(() => {
			void this.plugin.saveSettings().then(() => this.renderPreview());
		}, 400);
	}

	private cleanupPreview(): void {
		if (!this.previewHost) return;
		this.plugin.renderer.destroyHost(this.previewHost);
		this.previewHost.remove();
		this.previewHost = null;
		this.previewHint = null;
	}
}

function controlInput(setting: Setting): HTMLInputElement {
	return setting.controlEl.querySelector("input") as HTMLInputElement;
}
