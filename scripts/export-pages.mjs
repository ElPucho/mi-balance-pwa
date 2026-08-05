import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("export", Date.now().toString());
const { default: worker } = await import(workerUrl.href);
const response = await worker.fetch(
  new Request("https://mi-balance.local/", { headers: { accept: "text/html" } }),
  { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
  { waitUntil() {}, passThroughOnException() {} },
);

if (!response.ok) throw new Error(`No se pudo generar la página estática (${response.status})`);

const html = await response.text();

const output = path.join(projectRoot, "dist", "client");
await Promise.all([
  writeFile(path.join(output, "index.html"), html, "utf8"),
  writeFile(path.join(output, "404.html"), html, "utf8"),
  writeFile(path.join(output, ".nojekyll"), "", "utf8"),
]);
