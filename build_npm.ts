import { join } from "https://deno.land/std@0.111.0/path/mod.ts";
import { build } from "https://deno.land/x/dnt@0.22.0/mod.ts";
import { inheritExec } from "https://deno.land/x/utils@2.5.2/exec_utils.ts";

const publishVersion = Deno.args[0];

if (!publishVersion) {
  throw new Error("Publish version is required as the first argument");
}

const tempDir = await Deno.makeTempDir();

try {
  await build({
    entryPoints: ["./src/index.ts"],
    outDir: tempDir,
    test: false,
    shims: {
      // see JS docs for overview and more options
      deno: false,
    },
    package: {
      name: "openapi-ts-fetch",
      version: publishVersion,
      description: "OpenAPI TS Fetch",
      license: "Apache 2.0",
    },
  });

  await Deno.copyFile("LICENSE", join(tempDir, "LICENSE"));
  await inheritExec({
    cmd: ["npm", "publish"],
    cwd: tempDir,
  });
} finally {
  await Deno.remove(tempDir, { recursive: true });
}
