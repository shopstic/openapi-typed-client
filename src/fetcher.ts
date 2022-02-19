import {
  _TypedFetch,
  ApiError,
  ApiResponse,
  CustomRequestInit,
  DefaultPayload,
  Fetch,
  FetchConfig,
  Method,
  Middleware,
  OpArgType,
  OpenapiPaths,
  OpErrorType,
  Request,
  TypedFetch,
} from "./types.ts";

const sendBody = (method: Method) =>
  method === "post" ||
  method === "put" ||
  method === "patch" ||
  method === "delete";

function getPath(pathTemplate: string, pathParams?: Record<string, string>) {
  if (pathParams) {
    return pathTemplate.replace(/\{([^}]+)\}/g, (_, key) => {
      if (!(key in pathParams)) {
        throw new Error(
          `Expected path key ${key} doesnt exist in payload: ${
            JSON.stringify(pathParams)
          }`,
        );
      }
      return encodeURIComponent(pathParams[key]);
    });
  }

  return pathTemplate;
}

// deno-lint-ignore no-explicit-any
function getQuery(params?: Record<string, any>) {
  if (!params) {
    return "";
  }

  const queryString = new URLSearchParams(params).toString();

  if (queryString.length > 0) {
    return "?" + queryString;
  }

  return queryString;
}

function getHeaders(init?: HeadersInit) {
  const headers = new Headers(init);

  if (!headers.has("Content-Type")) {
    headers.append("Content-Type", "application/json");
  }

  if (!headers.has("Accept")) {
    headers.append("Accept", "application/json");
  }

  return headers;
}

function getBody(method: Method, payload: unknown) {
  const body = sendBody(method) ? JSON.stringify(payload) : undefined;
  // if delete don't send body if empty
  return method === "delete" && body === "{}" ? undefined : body;
}

function mergeRequestInit(
  first?: RequestInit,
  second?: RequestInit,
): RequestInit {
  const headers = new Headers(first?.headers);
  const other = new Headers(second?.headers);

  for (const key of other.keys()) {
    const value = other.get(key);
    if (value != null) {
      headers.set(key, value);
    }
  }
  return { ...first, ...second, headers };
}

function getFetchParams(request: Request) {
  const path = getPath(request.path, request.payload.path);
  const query = getQuery(request.payload.query);
  const headers = getHeaders(request.init?.headers);
  const url = request.baseUrl + path + query;

  const init = {
    ...request.init,
    method: request.method.toUpperCase(),
    headers,
    body: getBody(request.method, request.payload.body),
  };

  return { url, init };
}

async function getResponseData(response: Response) {
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.indexOf("application/json") !== -1) {
    return await response.json();
  }
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function fetchJson(url: string, init: RequestInit): Promise<ApiResponse> {
  const response = await fetch(url, init);

  const data = await getResponseData(response);

  const result = {
    headers: response.headers,
    url: response.url,
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    data,
  };

  if (result.ok) {
    return result;
  }

  throw new ApiError(result);
}

function wrapMiddlewares(middlewares: Middleware[], fetch: Fetch): Fetch {
  type Handler = (
    index: number,
    url: string,
    init: CustomRequestInit,
  ) => Promise<ApiResponse>;

  const handler: Handler = async (index, url, init) => {
    if (middlewares == null || index === middlewares.length) {
      return fetch(url, init);
    }
    const current = middlewares[index];
    init = init || { headers: getHeaders() };
    return await current(
      url,
      init,
      (nextUrl, nextInit) => handler(index + 1, nextUrl, nextInit),
    );
  };

  return (url, init) => handler(0, url, init);
}

async function fetchUrl<R>(request: Request) {
  const { url, init } = getFetchParams(request);

  const response = await request.fetch(url, init);

  return response as ApiResponse<R>;
}

function createFetch<OP>(fetch: _TypedFetch<OP>): TypedFetch<OP> {
  const fun = async (payload: OpArgType<OP>, init?: RequestInit) => {
    try {
      return await fetch(payload, init);
    } catch (err) {
      if (err instanceof ApiError) {
        throw new fun.Error(err);
      }
      throw err;
    }
  };

  fun.Error = class extends ApiError {
    constructor(error: ApiError) {
      super(error);
      Object.setPrototypeOf(this, new.target.prototype);
    }
    typed() {
      return {
        status: this.status,
        data: this.data,
      } as OpErrorType<OP>;
    }
  };

  return fun;
}

export interface FetcherApi<Paths> {
  configure: (config: FetchConfig) => this;
  use: (mw: Middleware) => this;
  endpoint: <P extends keyof Paths>(path: P) => ({
    method: <M extends keyof Paths[P]>(method: M) => TypedFetch<Paths[P][M]>;
  });
}

function fetcher<Paths>(): FetcherApi<Paths> {
  let baseUrl = "";
  let defaultInit: RequestInit = {};
  const middlewares: Middleware[] = [];
  const fetch = wrapMiddlewares(middlewares, fetchJson);

  const api = {
    configure: (config: FetchConfig) => {
      baseUrl = config.baseUrl || "";
      defaultInit = config.init || {};
      middlewares.splice(0);
      middlewares.push(...(config.use || []));
      return api;
    },
    use: (mw: Middleware) => {
      middlewares.push(mw);
      return api;
    },
    endpoint: <P extends keyof Paths>(path: P) => ({
      method: <M extends keyof Paths[P]>(method: M) =>
        createFetch((payload, init) =>
          fetchUrl({
            baseUrl: baseUrl || "",
            path: path as string,
            method: method as Method,
            payload: payload as DefaultPayload,
            init: mergeRequestInit(defaultInit, init),
            fetch,
          })
        ) as TypedFetch<Paths[P][M]>,
    }),
  };

  return api;
}

export const Fetcher = {
  for: <Paths extends OpenapiPaths<Paths>>() => fetcher<Paths>(),
};
