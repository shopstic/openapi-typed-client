import {
  OpenapiClientMiddleware,
  OpenapiFetchRequest,
  OpenapiOperationApi,
  OpenapiOperationArgType,
  OpenapiOperationError,
  OpenapiOperationErrorConstructorType,
  OpenapiOperationRequestBodyMediaType,
  OpenapiOperationResponse,
  OpenapiPaths,
  OpenapiRequestMediaType,
  OpenapiRequestMethod,
  OpenapiRequestOptions,
  ReadableStreamFetch,
  TypedFetch,
  UntypedFetch,
} from "./types.ts";

const canSendBody = (method: OpenapiRequestMethod) =>
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
    } else if (typeof leaf !== "undefined") {
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

function createHeaders(
  init?: HeadersInit,
  mediaType?: OpenapiRequestMediaType,
) {
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
  method: OpenapiRequestMethod,
  payload: unknown,
  mediaType?: OpenapiRequestMediaType,
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

function cloneRequestInit(init: RequestInit) {
  const { headers, ...rest } = init;
  return {
    ...rest,
    headers: headers ? new Headers(headers) : undefined,
  };
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

function getFetchParams(request: OpenapiFetchRequest) {
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
): Promise<OpenapiOperationResponse> {
  const response = await fetch(url, init);

  const data = await (async () => {
    if (raw) {
      return response.body;
    }

    const contentType = response.headers.get("content-type");

    if (contentType && /application\/([^+]+\+)?json/.test(contentType)) {
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

  throw new OpenapiOperationError(result);
}

type RequestHandler = (
  index: number,
  url: string,
  init: RequestInit,
) => Promise<OpenapiOperationResponse>;

function wrapMiddlewares(
  middlewares: OpenapiClientMiddleware[],
  fetch: UntypedFetch,
): UntypedFetch {
  const handler: RequestHandler = async (index, url, init) => {
    if (index === middlewares.length) {
      return fetch(url, init);
    }

    const current = middlewares[index];

    return await current(
      url,
      cloneRequestInit(init),
      (nextUrl, nextInit) => handler(index + 1, nextUrl, nextInit),
    );
  };

  return (url, init) => handler(0, url, init);
}

async function fetchUrl<R>(request: OpenapiFetchRequest) {
  const { url, init } = getFetchParams(request);

  const response = await request.fetch(url, init);

  return response as OpenapiOperationResponse<R>;
}

export interface OpenapiClient<Paths> {
  withBaseUrl: (baseUrl: string) => this;
  withOptions: (
    updater: (currentOptions: OpenapiRequestOptions) => OpenapiRequestOptions,
  ) => this;
  withMiddleware: (mw: OpenapiClientMiddleware) => this;
  endpoint: <P extends Extract<keyof Paths, string>>(path: P) => {
    method: <
      M extends Extract<keyof Paths[P], OpenapiRequestMethod>,
      T extends OpenapiOperationRequestBodyMediaType<Paths[P][M]>,
    >(
      method: M,
      mediaType?: T,
    ) => OpenapiOperationApi<Paths[P][M]>;
  };
}

function createFetch<OP>(
  fetch: TypedFetch<OP>,
  fetchAsStream: ReadableStreamFetch<OP>,
): OpenapiOperationApi<OP> {
  const fun = async (
    payload: OpenapiOperationArgType<OP>,
    init?: RequestInit,
  ) => {
    try {
      return await fetch(payload, init);
    } catch (err) {
      if (err instanceof OpenapiOperationError) {
        throw new fun.Error(err);
      }
      throw err;
    }
  };

  fun.stream = async (
    payload: OpenapiOperationArgType<OP>,
    init?: RequestInit,
  ) => {
    try {
      return await fetchAsStream(payload, init);
    } catch (err) {
      if (err instanceof OpenapiOperationError) {
        throw new fun.Error(err);
      }
      throw err;
    }
  };

  fun.Error = class extends OpenapiOperationError {
    constructor(error: OpenapiOperationResponse) {
      super(error);
      Object.setPrototypeOf(this, new.target.prototype);
    }
    // deno-lint-ignore no-explicit-any
  } as any as OpenapiOperationErrorConstructorType<OP>;

  return fun;
}

export function createOpenapiClient<Paths extends OpenapiPaths<Paths>>(
  { baseUrl, options = {}, middlewares = [] }: {
    baseUrl: string;
    options?: OpenapiRequestOptions;
    middlewares?: OpenapiClientMiddleware[];
  },
): OpenapiClient<Paths> {
  const typedFetch = wrapMiddlewares(
    middlewares,
    (args, init) => fetchResponse(args, init, false),
  );
  const untypedFetch = wrapMiddlewares(
    middlewares,
    (args, init) => fetchResponse(args, init, true),
  );

  const api: OpenapiClient<Paths> = {
    withBaseUrl(baseUrl) {
      return createOpenapiClient({ baseUrl, options, middlewares });
    },
    withOptions(updater) {
      const newOptions = updater(cloneRequestInit(options));
      return createOpenapiClient({ baseUrl, options: newOptions, middlewares });
    },
    withMiddleware: (mw: OpenapiClientMiddleware) => {
      return createOpenapiClient({
        baseUrl,
        options,
        middlewares: middlewares.concat([mw]),
      });
    },
    endpoint: <P extends Extract<keyof Paths, string>>(path: P) => ({
      method: <
        M extends Extract<keyof Paths[P], OpenapiRequestMethod>,
        T extends OpenapiOperationRequestBodyMediaType<Paths[P][M]>,
      >(method: M, mediaType?: T) => {
        return createFetch<Paths[P][M]>((payload, init) =>
          fetchUrl({
            baseUrl,
            path,
            method,
            mediaType,
            payload,
            init: mergeRequestInit(options, init),
            fetch: typedFetch,
          }), (payload, init) =>
          fetchUrl({
            baseUrl,
            path,
            method,
            mediaType,
            payload,
            init: mergeRequestInit(options, init),
            fetch: untypedFetch,
          }));
      },
    }),
  };

  return api;
}
