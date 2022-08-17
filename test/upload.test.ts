import { createOpenapiClient } from "../src/client.ts";
import type { paths } from "./upload.ts";

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

Deno.test("post", async () => {
  const abort = new AbortController();
  const upload = createFetcher().endpoint("/upload").method(
    "post",
    "multipart/form-data",
  );

  try {
    await upload({
      body: {
        userId: 1,
        orderId: 1,
        file: new Blob(["foo bar"], { type: "text/plain" }),
      },
    }, {
      signal: abort.signal,
    });
  } catch (e) {
    if (e instanceof upload.Error) {
      if (e.status === 405) {
        console.error(e.data.baz);
      } else if (e.status === 401) {
        console.error(e.data.bar);
      } else {
        console.error(e);
      }
    } else {
      console.error(e);
    }
  }
});
