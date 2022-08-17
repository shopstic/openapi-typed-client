import { createOpenapiClient } from "../src/client.ts";
import { paths as GhPaths } from "./github.ts";

const client = createOpenapiClient<GhPaths>({
  baseUrl: "https://api.github.com",
  options: {
    headers: {
      Accept: "application/vnd.github+json",
    },
  },
});

const ret = (await client.endpoint("/rate_limit").method("get")({})).data;
