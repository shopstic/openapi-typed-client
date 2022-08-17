import {
  CustomRequestInit,
  Fetch,
  FetchRequest,
  OpenapiClientConfig,
  OpenapiClientMiddleware,
  OpenapiPaths,
  OperationApi,
  OperationArgType,
  OperationError,
  OperationErrorConstructorType,
  OperationRequestBodyMediaType,
  OperationResponse,
  RawFetch,
  RequestMediaType,
  RequestMethod,
  TypedFetch,
} from "./types.ts";

const canSendBody = (method: RequestMethod) =>
  method === "post" ||
  method === "put" ||
  method === "patch" ||
  method === "delete";

function renderPath(template: string, params?: Record<string, string>) {
  if (params) {
    return template.replace(/\{([^}]+)\}/g, (_, key) => {
      if (!(key in params)) {
        throw new Error(
          `Expected path key ${key} doesnt exist in payload: ${
            JSON.stringify(params)
          }`,
        );
      }
      return encodeURIComponent(params[key]);
    });
  }

  return template;
}

function objectToSearchParams(
  obj: Record<string, unknown>,
  searchParams?: URLSearchParams,
  parent?: string,
): URLSearchParams {
  const params = searchParams || new URLSearchParams();

  for (const key of Object.keys(obj)) {
    const propName = parent ? parent + "." + key : key;
    const leaf = obj[key];

    if (Array.isArray(leaf)) {
      leaf.forEach((v) => {
        params.append(propName, String(v));
      });
    } else if (typeof leaf === "object") {
      if (leaf instanceof Date) {
        params.set(propName, leaf.toISOString());
      } else if (leaf !== null) {
        objectToSearchParams(
          leaf as Record<string, unknown>,
          params,
          propName,
        );
      }
    } else {
      params.set(propName, String(leaf));
    }
  }

  return params;
}

function createQueryString(params?: Record<string, unknown>) {
  if (!params) {
    return "";
  }

  const queryString = objectToSearchParams(params).toString();

  if (queryString.length > 0) {
    return "?" + queryString;
  }

  return queryString;
}

function createHeaders(init?: HeadersInit, mediaType?: RequestMediaType) {
  const headers = new Headers(init);

  if (
    !headers.has("Content-Type") && (!mediaType ||
      mediaType === "application/json")
  ) {
    headers.append("Content-Type", "application/json");
  }

  if (!headers.has("Accept")) {
    headers.append("Accept", "application/json");
  }

  return headers;
}

function createRequestBody(
  method: RequestMethod,
  payload: unknown,
  mediaType?: RequestMediaType,
): string | URLSearchParams | FormData | undefined {
  if (canSendBody(method)) {
    if (mediaType === "application/x-www-form-urlencoded") {
      return new URLSearchParams(payload as Record<string, string>);
    } else if (mediaType === "multipart/form-data") {
      const body = new FormData();
      Object.entries(payload as Record<string, string | Blob>).forEach(
        ([k, v]) => {
          body.append(k, v);
        },
      );
      return body;
    }

    return JSON.stringify(payload);
  }
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

function getFetchParams(request: FetchRequest) {
  const path = renderPath(request.path, request.payload.path);
  const query = createQueryString(request.payload.query);
  const headers = createHeaders(request.init?.headers, request.mediaType);
  const url = request.baseUrl + path + query;

  const init = {
    ...request.init,
    method: request.method.toUpperCase(),
    headers,
    body: createRequestBody(
      request.method,
      request.payload.body,
      request.mediaType,
    ),
  };

  return { url, init };
}

async function fetchResponse(
  url: string,
  init: RequestInit,
  raw: boolean,
): Promise<OperationResponse> {
  const response = await fetch(url, init);

  const data = await (async () => {
    if (raw) {
      return response.body;
    }

    const contentType = response.headers.get("content-type");

    if (contentType && contentType.indexOf("application/json") !== -1) {
      return await response.json();
    }

    return await response.text();
  })();

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

  throw new OperationError(result);
}

type RequestHandler = (
  index: number,
  url: string,
  init: CustomRequestInit,
) => Promise<OperationResponse>;

function wrapMiddlewares(
  middlewares: OpenapiClientMiddleware[],
  fetch: Fetch,
): Fetch {
  const handler: RequestHandler = async (index, url, init) => {
    if (middlewares == null || index === middlewares.length) {
      return fetch(url, init);
    }

    const current = middlewares[index];
    init = init || { headers: createHeaders() };

    return await current(
      url,
      init,
      (nextUrl, nextInit) => handler(index + 1, nextUrl, nextInit),
    );
  };

  return (url, init) => handler(0, url, init);
}

async function fetchUrl<R>(request: FetchRequest) {
  const { url, init } = getFetchParams(request);

  const response = await request.fetch(url, init);

  return response as OperationResponse<R>;
}

export interface FetcherApi<Paths> {
  configure: (config: OpenapiClientConfig) => this;
  use: (mw: OpenapiClientMiddleware) => this;
  endpoint: <P extends Extract<keyof Paths, string>>(path: P) => {
    method: <
      M extends Extract<keyof Paths[P], RequestMethod>,
      T extends OperationRequestBodyMediaType<Paths[P][M]>,
    >(
      method: M,
      mediaType?: T,
    ) => OperationApi<Paths[P][M]>;
  };
}

function createFetch<OP>(
  fetch: TypedFetch<OP>,
  fetchAsStream: RawFetch<OP>,
): OperationApi<OP> {
  const fun = async (
    payload: OperationArgType<OP>,
    init?: RequestInit,
  ) => {
    try {
      return await fetch(payload, init);
    } catch (err) {
      if (err instanceof OperationError) {
        throw new fun.Error(err);
      }
      throw err;
    }
  };

  fun.stream = async (
    payload: OperationArgType<OP>,
    init?: RequestInit,
  ) => {
    try {
      return await fetchAsStream(payload, init);
    } catch (err) {
      if (err instanceof OperationError) {
        throw new fun.Error(err);
      }
      throw err;
    }
  };

  fun.Error = class extends OperationError {
    constructor(error: OperationResponse) {
      super(error);
      Object.setPrototypeOf(this, new.target.prototype);
    }
    // deno-lint-ignore no-explicit-any
  } as any as OperationErrorConstructorType<OP>;

  return fun;
}

function fetcher<Paths extends OpenapiPaths<Paths>>(): FetcherApi<Paths> {
  let baseUrl = "";
  let defaultInit: RequestInit = {};
  const middlewares: OpenapiClientMiddleware[] = [];

  const typedFetch = wrapMiddlewares(
    middlewares,
    (args, init) => fetchResponse(args, init, false),
  );
  const untypedFetch = wrapMiddlewares(
    middlewares,
    (args, init) => fetchResponse(args, init, true),
  );

  const api = {
    configure: (config: OpenapiClientConfig) => {
      baseUrl = config.baseUrl || "";
      defaultInit = config.init || {};
      middlewares.splice(0);
      middlewares.push(...(config.use || []));
      return api;
    },
    use: (mw: OpenapiClientMiddleware) => {
      middlewares.push(mw);
      return api;
    },
    endpoint: <P extends Extract<keyof Paths, string>>(path: P) => ({
      method: <
        M extends Extract<keyof Paths[P], RequestMethod>,
        T extends OperationRequestBodyMediaType<Paths[P][M]>,
      >(method: M, mediaType?: T) => {
        return createFetch<Paths[P][M]>((payload, init) =>
          fetchUrl({
            baseUrl,
            path,
            method,
            mediaType,
            payload,
            init: mergeRequestInit(defaultInit, init),
            fetch: typedFetch,
          }), (payload, init) =>
          fetchUrl({
            baseUrl,
            path,
            method,
            mediaType,
            payload,
            init: mergeRequestInit(defaultInit, init),
            fetch: untypedFetch,
          }));
      },
    }),
  };

  return api;
}

export const Fetcher = {
  for: <Paths extends OpenapiPaths<Paths>>() => fetcher<Paths>(),
};
