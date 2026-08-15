import { defineConfig } from "tsdown";

/**
 * dsh-terminal build:
 *  - host faces (service entry + typert/remote artifacts): ESM for Node, keep
 *    @deepseek-ai/*, zod and node-pty external (resolved from the profile's
 *    node_modules at runtime).
 *  - client face: CJS bundle with react external; zod, xterm and the fit addon
 *    are inlined so the browser module table needs no extra row.
 *    scripts/wrap-client.mjs then wraps the output into the
 *    window.__ModuleLoader__.load({ id, factory }) contract.
 */
export default defineConfig([
  {
    entry: ["src/index.ts", "src/typert.ts", "src/remote.ts"],
    format: ["esm"],
    platform: "node",
    target: "node20",
    clean: true,
    dts: false,
    sourcemap: false,
    outDir: "lib",
    deps: { neverBundle: [/^@deepseek-ai\//, /^zod$/, /^node-pty$/] }
  },
  {
    entry: ["src/client/index.tsx"],
    name: "client",
    format: ["cjs"],
    platform: "browser",
    target: "es2022",
    clean: false,
    dts: false,
    sourcemap: false,
    outDir: "lib",
    deps: {
      // xterm/zod are inlined so the browser module table needs no extra row;
      // react stays external (resolved by the host page).
      onlyBundle: [/^@xterm\//, /^zod$/],
      neverBundle: [/^react($|\/)/]
    },
    cssModules: false
  }
]);
