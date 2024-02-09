import {
  dirname,
  fromFileUrl,
  join,
} from "https://deno.land/std@0.215.0/path/mod.ts";
import { build } from "https://deno.land/x/dnt@0.40.0/mod.ts";
import packageJson from "./package.json" assert { type: "json" };

const currentPath = dirname(fromFileUrl(import.meta.url));
const distPath = join(currentPath, "dist");

try {
  await Deno.remove(distPath, { recursive: true });
} catch {
  // Ignore
}

await Deno.mkdir(distPath);

await build({
  entryPoints: ["./src/index.ts"],
  outDir: distPath,
  test: false,
  shims: {},
  declaration: "separate",
  package: packageJson,
  compilerOptions: {
    lib: ["DOM", "DOM.Iterable"],
  },
});

await Deno.copyFile(join(currentPath, "LICENSE"), join(distPath, "LICENSE"));
