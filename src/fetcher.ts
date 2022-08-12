import {
  _TypedFetch,
  _UntypedFetch,
  ApiError,
  ApiResponse,
  CustomRequestInit,
  DefaultPayload,
  ExtractRequestBodyMediaTypes,
  Fetch,
  FetchConfig,
  FetchRequest,
  Method,
  Middleware,
  OpArgType,
  OpenapiPaths,
  OpErrorType,
  RequestMediaType,
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

function getQuery(params?: Record<string, unknown>) {
  if (!params) {
    return "";
  }

  const queryString = objectToSearchParams(params).toString();

  if (queryString.length > 0) {
    return "?" + queryString;
  }

  return queryString;
}

function getHeaders(init?: HeadersInit, mediaType?: RequestMediaType) {
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

function getBody(
  method: Method,
  payload: unknown,
  mediaType?: RequestMediaType,
): string | URLSearchParams | FormData | undefined {
  if (sendBody(method)) {
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
  const path = getPath(request.path, request.payload.path);
  const query = getQuery(request.payload.query);
  const headers = getHeaders(request.init?.headers, request.mediaType);
  const url = request.baseUrl + path + query;

  const init = {
    ...request.init,
    method: request.method.toUpperCase(),
    headers,
    body: getBody(request.method, request.payload.body, request.mediaType),
  };

  return { url, init };
}

async function fetchResponse(
  url: string,
  init: RequestInit,
  raw: boolean,
): Promise<ApiResponse> {
  const response = await fetch(url, init);
  const contentType = response.headers.get("content-type");

  const data = await (async () => {
    if (raw) {
      return response.body;
    }
    if (contentType && contentType.indexOf("application/json") !== -1) {
      return await response.json();
    } else {
      return await response.text();
    }
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

async function fetchUrl<R>(request: FetchRequest) {
  const { url, init } = getFetchParams(request);

  const response = await request.fetch(url, init);

  return response as ApiResponse<R>;
}

export interface FetcherApi<Paths> {
  configure: (config: FetchConfig) => this;
  use: (mw: Middleware) => this;
  endpoint: <P extends keyof Paths>(path: P) => {
    method: <
      M extends keyof Paths[P],
      T extends ExtractRequestBodyMediaTypes<Paths[P][M]>,
    >(
      method: M,
      mediaType?: T,
    ) => TypedFetch<Paths[P][M]>;
  };
}

function createFetch<OP>(
  fetch: _TypedFetch<OP>,
  fetchAsStream: _UntypedFetch<OP>,
): TypedFetch<OP> {
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

  fun.stream = async (payload: OpArgType<OP>, init?: RequestInit) => {
    try {
      return await fetchAsStream(payload, init);
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

function fetcher<Paths>(): FetcherApi<Paths> {
  let baseUrl = "";
  let defaultInit: RequestInit = {};
  const middlewares: Middleware[] = [];
  const typedFetch = wrapMiddlewares(
    middlewares,
    (args, init) => fetchResponse(args, init, false),
  );
  const untypedFetch = wrapMiddlewares(
    middlewares,
    (args, init) => fetchResponse(args, init, true),
  );

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
      method: <
        M extends keyof Paths[P],
        T extends ExtractRequestBodyMediaTypes<Paths[P][M]>,
      >(method: M, mediaType?: T) => {
        return createFetch((payload, init) =>
          fetchUrl({
            baseUrl: baseUrl || "",
            path: path as string,
            method: method as Method,
            mediaType: mediaType as RequestMediaType | undefined,
            payload: payload as DefaultPayload,
            init: mergeRequestInit(defaultInit, init),
            fetch: typedFetch,
          }), (payload, init) =>
          fetchUrl({
            baseUrl: baseUrl || "",
            path: path as string,
            method: method as Method,
            mediaType: mediaType as RequestMediaType | undefined,
            payload: payload as DefaultPayload,
            init: mergeRequestInit(defaultInit, init),
            fetch: untypedFetch,
          })) as TypedFetch<Paths[P][M]>;
      },
    }),
  };

  return api;
}

export const Fetcher = {
  for: <Paths extends OpenapiPaths<Paths>>() => fetcher<Paths>(),
};
