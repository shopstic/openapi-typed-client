import { ApiError, Fetcher } from "../src/index.ts";
import type { paths } from "./k8s.ts";

function createFetcher() {
  return Fetcher
    .for<paths>()
    .configure({
      baseUrl: "https://petstore.swagger.io/v2",
      init: {
        headers: {},
      },
    })
    .use(async (url, init, next) => {
      console.log(`before calling ${url}`, init);
      const res = await next(url, init);
      console.log(`after calling ${url}`, init);
      return res;
    });
}

async function call(fn: () => Promise<any>) {
  try {
    await fn();
  } catch (e) {
    if (e instanceof ApiError) {
      console.error(e.url, e.status, e.statusText, e.data);
    } else {
      console.error(e);
    }
  }
}

Deno.test("get with no path", async () => {
  const abort = new AbortController();
  const getSecret = createFetcher()
    .endpoint("/api/v1/namespaces")
    .method("get");

  await call(() =>
    getSecret({
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
      body: {
        metadata: {
          name: "foo",
        },
        data: {
          bar: "baz",
        },
      },
    }, {
      signal: abort.signal,
    })
  );
});
