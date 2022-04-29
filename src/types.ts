// deno-lint-ignore-file no-explicit-any
export type Method =
  | "get"
  | "post"
  | "put"
  | "patch"
  | "delete"
  | "head"
  | "options";

export type OpenapiPaths<Paths> = {
  [P in keyof Paths]: {
    [M in Method]?: unknown;
  };
};

export type DefaultPayload = {
  path?: Record<string, string>;
  query?: Record<string, unknown>;
  body?: any;
};

type ExtractPathType<OP> = OP extends {
  parameters: {
    path: infer P;
  };
} ? { path: P }
  : Record<never, never>;

type ExtractQueryType<OP> = OP extends {
  parameters: {
    query: infer Q;
  };
} ? { query: Q }
  : Record<never, never>;

type ExtractV2BodyType<OP> = OP extends {
  parameters: {
    body: infer B;
  };
} ? (B extends Record<string, unknown> ? { body: B[keyof B] }
  : Record<never, never>)
  : Record<never, never>;

type ExtractV3BodyType<OP> = OP extends {
  requestBody: {
    content: {
      "application/json": infer B;
    };
  };
} ? { body: B }
  : Record<never, never>;

export type OpArgType<OP> =
  & ExtractPathType<OP>
  & ExtractQueryType<OP>
  & ExtractV2BodyType<OP>
  & ExtractV3BodyType<OP>;

type OpResponseTypes<OP> = OP extends {
  responses: infer R;
} ? {
  [S in keyof R]: R[S] extends { schema?: infer S } // openapi 2
  ? S
    : R[S] extends { content: { "application/json": infer C } } // openapi 3
    ? C
    : R[S] extends { content: { "text/plain": infer C } } ? C
    : S extends "default" ? R[S]
    : unknown;
}
  : never;

type _OpReturnType<T> = 200 extends keyof T ? T[200]
  : 201 extends keyof T ? T[201]
  : "default" extends keyof T ? T["default"]
  : unknown;

export type OpReturnType<OP> = _OpReturnType<OpResponseTypes<OP>>;

type _OpDefaultReturnType<T> = "default" extends keyof T ? T["default"]
  : unknown;

export type OpDefaultReturnType<OP> = _OpDefaultReturnType<OpResponseTypes<OP>>;

// private symbol to prevent narrowing on "default" error status
const never: unique symbol = Symbol();

type _OpErrorType<T> = {
  [S in Exclude<keyof T, 200 | 201>]: {
    status: S extends "default" ? typeof never : S;
    data: T[S];
  };
}[Exclude<keyof T, 200 | 201>];

type Coalesce<T, D> = [T] extends [never] ? D : T;

// coalesce default error type
export type OpErrorType<OP> = Coalesce<
  _OpErrorType<OpResponseTypes<OP>>,
  { status: number; data: any }
>;

export type CustomRequestInit = Omit<RequestInit, "headers"> & {
  readonly headers: Headers;
};

export type Fetch = (
  url: string,
  init: CustomRequestInit,
) => Promise<ApiResponse>;

export type _TypedFetch<OP> = (
  arg: OpArgType<OP>,
  init?: RequestInit,
) => Promise<ApiResponse<OpReturnType<OP>>>;

export type TypedFetch<OP> = _TypedFetch<OP> & {
  Error: new (error: ApiError) => ApiError & {
    typed: () => OpErrorType<OP>;
  };
};

export type FetchArgType<F> = F extends TypedFetch<infer OP> ? OpArgType<OP>
  : never;

export type FetchReturnType<F> = F extends TypedFetch<infer OP>
  ? OpReturnType<OP>
  : never;

export type FetchErrorType<F> = F extends TypedFetch<infer OP> ? OpErrorType<OP>
  : never;

export type Middleware = (
  url: string,
  init: CustomRequestInit,
  next: Fetch,
) => Promise<ApiResponse>;

export type FetchConfig = {
  baseUrl?: string;
  init?: RequestInit;
  use?: Middleware[];
};

export type Request = {
  baseUrl: string;
  method: Method;
  path: string;
  payload: DefaultPayload;
  init?: RequestInit;
  fetch: Fetch;
};

export type ApiResponse<R = any> = {
  readonly headers: Headers;
  readonly url: string;
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  readonly data: R;
};

export class ApiError extends Error {
  readonly headers: Headers;
  readonly url: string;
  readonly status: number;
  readonly statusText: string;
  readonly data: any;

  constructor(response: Omit<ApiResponse, "ok">) {
    super(response.statusText);
    Object.setPrototypeOf(this, new.target.prototype);

    this.headers = response.headers;
    this.url = response.url;
    this.status = response.status;
    this.statusText = response.statusText;
    this.data = response.data;
  }
}
