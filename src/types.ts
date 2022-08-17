export type OpenapiRequestMethod =
  | "get"
  | "post"
  | "put"
  | "patch"
  | "delete"
  | "head"
  | "options";

export type OpenapiRequestMediaType =
  | "application/json"
  | "multipart/form-data"
  | "application/x-www-form-urlencoded";

export type OpenapiPaths<Paths> = {
  [P in Extract<keyof Paths, string>]: {
    [M in OpenapiRequestMethod]?: unknown;
  };
};

export type OpenapiDefaultRequestPayload = {
  path?: Record<string, string>;
  query?: Record<string, unknown>;
  // deno-lint-ignore no-explicit-any
  body?: any;
};

export type OpenapiOperationRequestBodyMediaType<Op> = Op extends {
  requestBody: {
    content: infer B;
  };
} ? keyof B
  : never;

type OpenapiOperationPathType<Op> = Op extends {
  parameters: {
    path: infer P;
  };
} ? { path: P }
  : Record<never, never>;

type OpenpiOperationQueryType<Op> = Op extends {
  parameters: {
    query: infer Q;
  };
} ? { query: Q }
  : Record<never, never>;

type OpenapiOperationV2BodyType<Op> = Op extends {
  parameters: {
    body: infer B;
  };
} ? (B extends Record<string, unknown> ? { body: B[keyof B] }
    : Record<never, never>)
  : Record<never, never>;

type OpenapiOperationV3JsonBodyType<Op> = Op extends {
  requestBody: {
    content: {
      "application/json": infer B;
    };
  };
} ? { body: B }
  : Record<never, never>;

type OpenapiOperationV3FormDataBodyType<Op> = Op extends {
  requestBody: {
    content: {
      "multipart/form-data": infer B;
    };
  };
} ? { body: B }
  : Record<never, never>;

export type OpenapiOperationArgType<Op> =
  & OpenapiOperationPathType<Op>
  & OpenpiOperationQueryType<Op>
  & OpenapiOperationV2BodyType<Op>
  & OpenapiOperationV3JsonBodyType<Op>
  & OpenapiOperationV3FormDataBodyType<Op>;

type OpenapiOperationResponsesType<Op> = Op extends {
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

type OpenapiSuccessResponsesType<R> = 200 extends keyof R ? R[200]
  : 201 extends keyof R ? R[201]
  : "default" extends keyof R ? R["default"]
  : unknown;

export type OpenapiOperationReturnType<Op> = OpenapiSuccessResponsesType<
  OpenapiOperationResponsesType<Op>
>;

type OpenapiErrorResponsesType<
  R,
  K extends keyof R = Exclude<keyof R, 200 | 201 | "default">,
> = {
  [S in K]: OpenapiOperationResponse<S, R[S]>;
}[K];

type Coalesce<T, D> = [T] extends [never] ? D : T;

export type OpenapiOperationErrorType<Op> = Coalesce<
  OpenapiErrorResponsesType<
    OpenapiOperationResponsesType<Op>
  >,
  // deno-lint-ignore no-explicit-any
  OpenapiOperationResponse<number, any>
>;

export type OpenapiOperationErrorConstructorType<Op> = new (
  error: Omit<OpenapiOperationResponse, "ok">,
) => OpenapiOperationErrorType<Op>;

export type OpenapiRequestOptions = Omit<RequestInit, "body" | "method">;

export type UntypedFetch = (
  url: string,
  init: RequestInit,
) => Promise<OpenapiOperationResponse>;

export type TypedFetch<Op> = (
  arg: OpenapiOperationArgType<Op>,
  init?: RequestInit,
) => Promise<OpenapiOperationResponse<OpenapiOperationReturnType<Op>>>;

export type ReadableStreamFetch<Op> = (
  arg: OpenapiOperationArgType<Op>,
  init?: RequestInit,
) => Promise<OpenapiOperationResponse<ReadableStream<Uint8Array> | null>>;

export type OpenapiOperationApi<Op> = TypedFetch<Op> & {
  Error: OpenapiOperationErrorConstructorType<Op>;
  stream: ReadableStreamFetch<Op>;
};

export type OpenapiOperationApiArgType<F> = F extends
  OpenapiOperationApi<infer Op> ? OpenapiOperationArgType<Op>
  : never;

export type OpenapiOperationApiReturnType<F> = F extends
  OpenapiOperationApi<infer Op> ? OpenapiOperationReturnType<Op>
  : never;

export type OpenapiOperationApiErrorType<F> = F extends
  OpenapiOperationApi<infer Op> ? OpenapiOperationErrorConstructorType<Op>
  : never;

export type OpenapiClientMiddleware = (
  url: string,
  init: RequestInit,
  next: UntypedFetch,
) => Promise<OpenapiOperationResponse>;

export type OpenapiFetchRequest = {
  baseUrl: string;
  method: OpenapiRequestMethod;
  mediaType?: OpenapiRequestMediaType;
  path: string;
  payload: OpenapiDefaultRequestPayload;
  init?: RequestInit;
  fetch: UntypedFetch;
};

// deno-lint-ignore no-explicit-any
export type OpenapiOperationResponse<S = any, R = any> = {
  readonly headers: Headers;
  readonly url: string;
  readonly ok: boolean;
  readonly status: S;
  readonly statusText: string;
  readonly data: R;
};

export class OpenapiOperationError extends Error {
  readonly headers: Headers;
  readonly url: string;
  readonly status: number;
  readonly statusText: string;
  // deno-lint-ignore no-explicit-any
  readonly data: any;

  constructor(response: Omit<OpenapiOperationResponse, "ok">) {
    super(response.statusText);
    Object.setPrototypeOf(this, new.target.prototype);
    Object.defineProperty(this, "message", {
      get() {
        return JSON.stringify(this);
      },
      enumerable: false,
      configurable: false,
    });

    this.headers = response.headers;
    this.url = response.url;
    this.status = response.status;
    this.statusText = response.statusText;
    this.data = response.data;
  }
}
