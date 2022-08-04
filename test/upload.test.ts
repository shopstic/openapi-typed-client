import { ApiError, Fetcher } from "../src/index.ts";
import type { paths } from "./upload.ts";

function createFetcher() {
  return Fetcher
    .for<paths>()
    .configure({
      baseUrl: "https://petstore3.swagger.io/v3",
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

// deno-lint-ignore no-explicit-any
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

Deno.test("post", async () => {
  const abort = new AbortController();
  const postSecret = createFetcher().endpoint("/upload").method(
    "post",
    "multipart/form-data",
  );

  await call(() =>
    postSecret({
      body: {
        userId: 1,
        orderId: 1,
        file: new Blob(["foo bar"], { type: "text/plain" }),
      },
    }, {
      signal: abort.signal,
    })
  );
});
