import {
  dirname,
  fromFileUrl,
  join,
} from "https://deno.land/std@0.128.0/path/mod.ts";
import { build } from "https://deno.land/x/dnt@0.23.0/mod.ts";
import packageJson from "./package.json" assert { type: "json" };

const currentPath = dirname(fromFileUrl(import.meta.url));
const distPath = join(currentPath, "dist");

const version = Deno.args[0];

if (typeof version !== "string") {
  throw new Error("Version is required, pass it as the first argument");
}

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
  shims: {
    deno: false,
    custom: [{
      package: {
        name: "node-fetch",
        version: "2.6.7",
      },
      globalNames: [
        {
          name: "fetch",
          exportName: "default",
        },
        ...(["Headers", "Request", "Response", "FetchError"].map((name) => ({
          name,
        }))),
        ...["HeadersInit", "RequestInit"].map((name) => ({
          name,
          typeOnly: true,
        })),
      ],
    }],
  },
  package: {
    ...packageJson,
    version,
    devDependencies: {
      "@types/node-fetch": "2.6.1",
    },
  },
});

await Deno.copyFile(join(currentPath, "LICENSE"), join(distPath, "LICENSE"));
