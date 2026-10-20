import {
	MarkdownRenderChild,
	MarkdownView,
	Notice,
	Plugin,
	TFile,
	editorLivePreviewField,
	type Editor,
} from "obsidian";
import { StateEffect, StateField, RangeSetBuilder, type EditorState } from "@codemirror/state";
import {
	Decoration,
	EditorView,
	WidgetType,
	type DecorationSet,
} from "@codemirror/view";
import { findDiagramFences, fenceOverlapsSelection } from "./fences";
import { PeleRenderer } from "./renderer";
import { PeleSettingTab } from "./settings";
import { THEMES } from "./themes";
import { SHOWCASE_NOTE, SHOWCASE_PATH } from "./showcase";
import {
	DEFAULT_SETTINGS,
	THEME_IDS,
	isColorScheme,
	isThemeId,
	isZoomMode,
	type PeleSettings,
} from "./types";

const refreshEffect = StateEffect.define<null>();

class PeleWidget extends WidgetType {
	constructor(
		private readonly renderer: PeleRenderer,
		private readonly source: string,
		private readonly revision: number,
	) {
		super();
	}

	override eq(other: PeleWidget): boolean {
		return this.revision === other.revision && this.source === other.source;
	}

	override toDOM(): HTMLElement {
		const host = activeDocument.createElement("div");
		host.className = "ob-pele-host";
		this.renderer.render(host, this.source);
		return host;
	}

	override destroy(dom: HTMLElement): void {
		this.renderer.destroyHost(dom);
	}

	override ignoreEvent(event: Event): boolean {
		return (
			event.target instanceof Element &&
			event.target.closest(".ob-pele-block") !== null
		);
	}
}

function createEditorExtension(plugin: PelePlugin) {
	const build = (state: EditorState): DecorationSet => {
		if (!state.field(editorLivePreviewField, false)) return Decoration.none;

		const builder = new RangeSetBuilder<Decoration>();
		const text = state.doc.toString();

		for (const fence of findDiagramFences(text)) {
			if (fenceOverlapsSelection(state.selection.ranges, fence.from, fence.to)) {
				continue;
			}
			builder.add(
				fence.from,
				fence.to,
				Decoration.replace({
					block: true,
					widget: new PeleWidget(plugin.renderer, fence.source, plugin.revision),
				}),
			);
		}

		return builder.finish();
	};

	return StateField.define<DecorationSet>({
		create: build,
		update(decorations, transaction) {
			if (
				transaction.docChanged ||
				transaction.selection ||
				transaction.effects.some((effect) => effect.is(refreshEffect))
			) {
				return build(transaction.state);
			}
			return decorations;
		},
		provide: (field) => EditorView.decorations.from(field),
	});
}

class PeleRenderChild extends MarkdownRenderChild {
	constructor(
		containerEl: HTMLElement,
		private readonly dispose: () => void,
	) {
		super(containerEl);
	}

	override onunload(): void {
		this.dispose();
	}
}

export default class PelePlugin extends Plugin {
	override settings: PeleSettings = { ...DEFAULT_SETTINGS };
	renderer!: PeleRenderer;
	revision = 0;

	override async onload(): Promise<void> {
		await this.loadSettings();

		this.renderer = new PeleRenderer(() => this.settings);

		for (const language of ["mermaid", "pele"]) {
			this.registerMarkdownCodeBlockProcessor(
				language,
				(source, el, ctx) => {
					const dispose = this.renderer.render(el, source);
					ctx.addChild(new PeleRenderChild(el, dispose));
				},
				-200,
			);
		}

		this.registerEditorExtension(createEditorExtension(this));
		this.addSettingTab(new PeleSettingTab(this.app, this));

		this.registerEvent(
			this.app.workspace.on("css-change", () => this.renderer.handleCssChange()),
		);

		this.addCommand({
			id: "rerender",
			name: "重新渲染图表",
			callback: () => this.refreshViews(),
		});

		this.addCommand({
			id: "cycle-theme",
			name: "切换图表主题",
			callback: () => void this.cycleTheme(),
		});

		this.addCommand({
			id: "open-showcase",
			name: "打开主题展示笔记",
			callback: () => void this.openShowcase(),
		});
	}

	override onunload(): void {
		this.renderer?.destroy();
	}

	async loadSettings(): Promise<void> {
		const saved = (await this.loadData()) as Partial<PeleSettings> | null;

		this.settings = {
			theme: saved?.theme && isThemeId(saved.theme) ? saved.theme : DEFAULT_SETTINGS.theme,
			scheme:
				saved?.scheme && isColorScheme(saved.scheme)
					? saved.scheme
					: DEFAULT_SETTINGS.scheme,
			zoom:
				saved?.zoom && isZoomMode(saved.zoom) ? saved.zoom : DEFAULT_SETTINGS.zoom,
			autoDirection:
				typeof saved?.autoDirection === "boolean"
					? saved.autoDirection
					: DEFAULT_SETTINGS.autoDirection,
			matchFont:
				typeof saved?.matchFont === "boolean"
					? saved.matchFont
					: DEFAULT_SETTINGS.matchFont,
			fontFamily:
				typeof saved?.fontFamily === "string"
					? saved.fontFamily
					: DEFAULT_SETTINGS.fontFamily,
			matchFontSize:
				typeof saved?.matchFontSize === "boolean"
					? saved.matchFontSize
					: DEFAULT_SETTINGS.matchFontSize,
			fontSize:
				typeof saved?.fontSize === "number" && saved.fontSize >= 8 && saved.fontSize <= 48
					? saved.fontSize
					: DEFAULT_SETTINGS.fontSize,
		};
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.refreshViews();
	}

	refreshViews(): void {
		this.revision++;

		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view;
			if (!(view instanceof MarkdownView)) continue;

			if (view.getMode() === "preview") {
				view.previewMode.rerender(true);
				continue;
			}

			const editor = view.editor as Editor & { cm?: EditorView };
			editor.cm?.dispatch({ effects: refreshEffect.of(null) });
		}

		this.app.workspace.updateOptions();
	}

	private async cycleTheme(): Promise<void> {
		const index = THEME_IDS.indexOf(this.settings.theme);
		this.settings.theme = THEME_IDS[(index + 1) % THEME_IDS.length];
		await this.saveSettings();
		new Notice(`Pele 主题：${THEMES[this.settings.theme].name}`);
	}

	private async openShowcase(): Promise<void> {
		const existing = this.app.vault.getAbstractFileByPath(SHOWCASE_PATH);
		const file = existing instanceof TFile
			? existing
			: await this.app.vault.create(SHOWCASE_PATH, SHOWCASE_NOTE);
		await this.app.workspace.getLeaf(true).openFile(file);
	}
}
