import { createOpenapiClient } from "../src/client.ts";
import { OpenapiOperationError } from "../src/index.ts";
import type { paths } from "./petstore.ts";

function createFetcher() {
  return createOpenapiClient<paths>({
    baseUrl: "https://petstore3.swagger.io/v3",
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
  const postSecret = createFetcher().endpoint("/store/order").method(
    "post",
  );

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
