import { mount, type MountOptions, type Mounted, type ZoomOptions } from "pele";
import { extractDirectives } from "./directives";
import type { ColorScheme, PeleSettings } from "./types";

interface Entry {
	host: HTMLElement;
	block: HTMLElement;
	diagram: HTMLElement;
	mounted: Mounted;
	source: string;
	requestedScheme: ColorScheme;
	fontSize: number;
}

const ZOOM_LABELS = {
	zoomIn: "放大",
	zoomOut: "缩小",
	reset: "重置",
};

const LINK_SCHEMES = ["http", "https", "mailto", "tel", "obsidian"];

export class PeleRenderer {
	private readonly entries = new Set<Entry>();
	private readonly entryByHost = new WeakMap<HTMLElement, Entry>();
	private readonly observedDocs = new WeakSet<Document>();
	private readonly schemeObserver: MutationObserver;
	private refreshTimer = 0;

	constructor(private readonly getSettings: () => PeleSettings) {
		this.schemeObserver = new MutationObserver(() => this.applySchemes());
		this.schemeObserver.observe(document.body, {
			attributes: true,
			attributeFilter: ["class"],
		});
	}

	render(host: HTMLElement, source: string): () => void {
		this.destroyHost(host);
		host.replaceChildren();

		const settings = this.getSettings();
		const spec = extractDirectives(source);
		const doc = host.ownerDocument;
		this.observeScheme(doc);
		const block = doc.createElement("div");
		block.className = "ob-pele-block";
		block.dataset.theme = spec.theme ?? settings.theme;

		const diagram = doc.createElement("div");
		diagram.className = "ob-pele-diagram";
		block.appendChild(diagram);
		host.appendChild(block);

		const requestedScheme = spec.scheme ?? settings.scheme;
		this.applyScheme(block, requestedScheme);
		this.applyFonts(block, settings);

		const fontSize = resolveFontSize(host, settings);
		const entry: Entry = {
			host,
			block,
			diagram,
			mounted: undefined as unknown as Mounted,
			source: spec.source,
			requestedScheme,
			fontSize,
		};

		try {
			const mounted = mount(diagram, spec.source, this.buildOptions(settings, fontSize, block));
			entry.mounted = mounted;
			this.entries.add(entry);
			this.entryByHost.set(host, entry);
			this.syncError(entry);
			this.scheduleFontSync(entry);
			return () => this.destroyEntry(entry);
		} catch (error) {
			this.showFallbackError(doc, block, spec.source, error);
			return () => undefined;
		}
	}

	destroyHost(host: HTMLElement): void {
		const entry = this.entryByHost.get(host);
		if (entry) this.destroyEntry(entry);
	}

	destroy(): void {
		this.schemeObserver.disconnect();
		window.clearTimeout(this.refreshTimer);
		for (const entry of [...this.entries]) this.destroyEntry(entry);
	}

	handleCssChange(): void {
		this.applySchemes();
		window.clearTimeout(this.refreshTimer);
		this.refreshTimer = window.setTimeout(() => this.refreshAll(), 120);
	}

	private destroyEntry(entry: Entry): void {
		if (!this.entries.has(entry)) return;
		this.entries.delete(entry);
		if (this.entryByHost.get(entry.host) === entry) {
			this.entryByHost.delete(entry.host);
		}
		entry.mounted.destroy();
	}

	private buildOptions(
		settings: PeleSettings,
		fontSize: number,
		block: HTMLElement,
	): MountOptions {
		return {
			zoom: zoomOptions(settings.zoom),
			autoDirection: settings.autoDirection,
			fontSize,
			linkSchemes: LINK_SCHEMES,
			imageSchemes: ["http", "https"],
			padding: 8,
			onRender: () => {
				block.classList.remove("is-error");
			},
			onError: () => {
				block.classList.add("is-error");
			},
		};
	}

	private applyFonts(block: HTMLElement, settings: PeleSettings): void {
		const doc = block.ownerDocument;
		const bodyStyle = doc.defaultView?.getComputedStyle(doc.body);
		const bodyFont = bodyStyle?.fontFamily.trim();
		const bodyMono = bodyStyle?.getPropertyValue("--font-monospace").trim();

		const family = settings.matchFont
			? bodyFont || "var(--font-text)"
			: settings.fontFamily.trim() || "sans-serif";
		block.style.setProperty("--pele-font", family);
		block.style.setProperty("--pele-font-mono", bodyMono || "monospace");
	}

	private observeScheme(doc: Document): void {
		if (this.observedDocs.has(doc)) return;
		this.observedDocs.add(doc);
		this.schemeObserver.observe(doc.body, {
			attributes: true,
			attributeFilter: ["class"],
		});
	}

	private applyScheme(block: HTMLElement, requested: ColorScheme): void {
		const scheme: Exclude<ColorScheme, "auto"> =
			requested === "auto"
				? block.ownerDocument.body.classList.contains("theme-dark")
					? "dark"
					: "light"
					: requested;
		block.dataset.scheme = scheme;
	}

	private applySchemes(): void {
		for (const entry of this.entries) {
			if (!entry.block.isConnected) continue;
			this.applyScheme(entry.block, entry.requestedScheme);
		}
	}

	private refreshAll(): void {
		const settings = this.getSettings();
		for (const entry of [...this.entries]) {
			if (!entry.block.isConnected) continue;
			this.applyScheme(entry.block, entry.requestedScheme);
			this.applyFonts(entry.block, settings);

			const nextSize = resolveFontSize(entry.host, settings);
			if (Math.abs(nextSize - entry.fontSize) > 0.01) {
				entry.fontSize = nextSize;
				entry.mounted.update(
					entry.source,
					this.buildOptions(settings, nextSize, entry.block),
				);
			} else {
				entry.mounted.refresh();
			}
			this.syncError(entry);
		}
	}

	private syncError(entry: Entry): void {
		entry.block.classList.toggle("is-error", entry.mounted.error != null);
	}

	private scheduleFontSync(entry: Entry): void {
		if (!this.getSettings().matchFontSize) return;

		const view = entry.host.ownerDocument.defaultView;
		const request = view?.requestAnimationFrame?.bind(view) ?? requestAnimationFrame;

		const run = (attempt: number): void => {
			if (!this.entries.has(entry)) return;

			if (!entry.host.isConnected) {
				if (attempt < 5) request(() => run(attempt + 1));
				return;
			}

			const settings = this.getSettings();
			const nextSize = resolveFontSize(entry.host, settings);
			if (Math.abs(nextSize - entry.fontSize) <= 0.01) return;

			entry.fontSize = nextSize;
			entry.mounted.update(
				entry.source,
				this.buildOptions(settings, nextSize, entry.block),
			);
			this.syncError(entry);
		};

		request(() => run(0));
	}

	private showFallbackError(
		doc: Document,
		block: HTMLElement,
		source: string,
		error: unknown,
	): void {
		block.classList.add("is-error");
		const box = doc.createElement("div");
		box.className = "ob-pele-fallback-error";

		const title = doc.createElement("div");
		title.className = "ob-pele-fallback-title";
		title.textContent = "Pele 无法渲染这个图表";

		const message = doc.createElement("div");
		message.className = "ob-pele-fallback-message";
		message.textContent = error instanceof Error ? error.message : String(error);

		const pre = doc.createElement("pre");
		const code = doc.createElement("code");
		code.textContent = source;
		pre.appendChild(code);

		box.append(title, message, pre);
		block.appendChild(box);
	}
}

function zoomOptions(mode: PeleSettings["zoom"]): boolean | ZoomOptions {
	if (mode === "never") return false;
	const options: ZoomOptions = {
		always: mode === "always",
		controls: true,
		maxScale: 4,
		labels: ZOOM_LABELS,
	};
	return options;
}

function resolveFontSize(host: HTMLElement, settings: PeleSettings): number {
	if (!settings.matchFontSize) return settings.fontSize;

	const doc = host.ownerDocument;
	const view = doc.defaultView;
	const hostSize = parseFloat(
		(view ?? window).getComputedStyle(host).fontSize,
	);
	if (Number.isFinite(hostSize) && hostSize > 0) return hostSize;

	const bodySize = parseFloat(
		(view ?? window)
			.getComputedStyle(doc.body)
			.getPropertyValue("--font-text-size"),
	);
	if (Number.isFinite(bodySize) && bodySize > 0) return bodySize;

	return 16;
}
