// Wrap the tsdown CJS output of the client face into the DSH browser module
// contract: window.__ModuleLoader__.load({ id, factory }) where factory(require)
// materializes the module and returns module.exports.
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const input = resolve(rootDir, "lib/index.cjs");
const out = resolve(rootDir, "lib/client.js");
const raw = readFileSync(input, "utf8");

const indented = raw
  .split("\n")
  .map((line) => "\t\t" + line)
  .join("\n");

const wrapped = "window.__ModuleLoader__.load({\n\tid: \"dsh-terminal\",\n\tfactory: (require) => {\n\t\tvar module = { exports: {} };\n\t\tvar exports = module.exports;\n" + indented + "\n\t\treturn module.exports;\n\t}\n});\n";

writeFileSync(out, wrapped, "utf8");
rmSync(input, { force: true });
console.log("wrap-client: wrote " + out + " (" + wrapped.length + " bytes)");
