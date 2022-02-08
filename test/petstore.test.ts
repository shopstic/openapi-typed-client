import { ApiError, Fetcher } from "../src/index.ts";
import type { paths } from "./petstore.ts";

function createFetcher() {
  // declare fetcher for paths
  const fetcher = Fetcher.for<paths>();

  // global configuration
  fetcher.configure({
    baseUrl: "https://petstore3.swagger.io/api/v3",
    init: {
      headers: {},
    },
    use: [],
  });

  return fetcher;
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
  const get = createFetcher().endpoint("/pet/findByStatus").method("get");

  await call(() =>
    get({
      query: {
        status: "available",
      },
    }, {
      signal: abort.signal,
    })
  );
});

Deno.test("get with path", async () => {
  const abort = new AbortController();
  const get = createFetcher().endpoint("/pet/{petId}").method("get");

  await call(() =>
    get({
      path: {
        petId: 1234,
      },
    }, {
      signal: abort.signal,
    })
  );
});

Deno.test("post", async () => {
  const abort = new AbortController();
  const postSecret = createFetcher().endpoint("/store/order").method("post");

  await call(() =>
    postSecret({
      body: {
        id: 10,
        petId: 198772,
        quantity: 7,
        shipDate: new Date(),
        status: "approved",
        complete: true,
      },
    }, {
      signal: abort.signal,
    })
  );
});
