import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const vault =
	process.env.OBSIDIAN_VAULT ?? path.resolve("I:/obsidiannote/paper-zettel");
const pluginId = "ob-pele";
const target = path.join(vault, ".obsidian", "plugins", pluginId);
const files = ["main.js", "manifest.json", "styles.css"];

for (const file of files) {
	if (!existsSync(file)) {
		console.error(`Missing build artifact: ${file}. Run npm run build first.`);
		process.exit(1);
	}
}

await mkdir(target, { recursive: true });
for (const file of files) {
	await copyFile(file, path.join(target, file));
}

if (process.argv.includes("--enable")) {
	const configPath = path.join(vault, ".obsidian", "community-plugins.json");
	let enabled = [];
	try {
		enabled = JSON.parse(await readFile(configPath, "utf8"));
	} catch {
		enabled = [];
	}
	if (!enabled.includes(pluginId)) {
		enabled.push(pluginId);
		await writeFile(configPath, `${JSON.stringify(enabled, null, 2)}\n`);
		console.log("Enabled ob-pele in community-plugins.json (reload Obsidian).");
	}
}

console.log(`Deployed ${pluginId} to ${target}`);
