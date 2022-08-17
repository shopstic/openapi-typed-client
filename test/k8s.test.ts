import { createOpenapiClient } from "../src/client.ts";
import { OpenapiOperationError } from "../src/index.ts";
import type { paths } from "./k8s.ts";

function createFetcher() {
  return createOpenapiClient<paths>({
    baseUrl: "https://petstore.swagger.io/v2",
    options: {
      headers: {},
    },
  })
    .withMiddleware(async (url, init, next) => {
      console.log(`before calling ${url}`, init);
      const res = await next(url, init);
      console.log(`after calling ${url}`, init);
      return res;
    });
}

// deno-lint-ignore no-explicit-any
async function call(fn: () => Promise<any>) {
  try {
    await fn();
  } catch (e) {
    if (e instanceof OpenapiOperationError) {
      console.error(e.url, e.status, e.statusText, e.data);
    } else {
      console.error(e);
    }
  }
}

Deno.test("get with no path", async () => {
  const abort = new AbortController();
  const getNamespaces = createFetcher()
    .endpoint("/api/v1/namespaces")
    .method("get");

  try {
    const namespaces = (await getNamespaces({
      query: {
        pretty: "true",
        watch: true,
        timeoutSeconds: 123,
      },
    }, {
      signal: abort.signal,
    })).data;

    console.log("namespaces", namespaces.items.map((n) => n.metadata?.name));
  } catch (e) {
    if (e instanceof getNamespaces.Error) {
      if (e.status === 401) {
        console.error("Got 401", e.data);
      } else if (e.status === 500) {
        console.error(e);
      } else {
        console.error(e);
      }
    } else {
      console.error(e);
    }
  }
});

Deno.test("get with path and query", async () => {
  const abort = new AbortController();
  const getSecret = createFetcher()
    .endpoint("/api/v1/namespaces/{namespace}/secrets")
    .method("get");

  await call(() =>
    getSecret({
      path: {
        namespace: "all",
      },
      query: {
        pretty: "true",
        watch: true,
        timeoutSeconds: 123,
      },
    }, {
      signal: abort.signal,
    })
  );
});

Deno.test("post", async () => {
  const abort = new AbortController();
  const postSecret = createFetcher()
    .endpoint("/api/v1/namespaces/{namespace}/secrets")
    .method("post");

  await call(() =>
    postSecret({
      path: {
        namespace: "all",
      },
      query: {
        pretty: "true",
      },
      body: {},
    }, {
      signal: abort.signal,
    })
  );
});
