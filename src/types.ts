// deno-lint-ignore-file no-explicit-any
export type RequestMethod =
  | "get"
  | "post"
  | "put"
  | "patch"
  | "delete"
  | "head"
  | "options";

export type RequestMediaType =
  | "application/json"
  | "multipart/form-data"
  | "application/x-www-form-urlencoded";

export type OpenapiPaths<Paths> = {
  [P in Extract<keyof Paths, string>]: {
    [M in RequestMethod]?: unknown;
  };
};

export type DefaultRequestPayload = {
  path?: Record<string, string>;
  query?: Record<string, unknown>;
  body?: any;
};

export type OperationRequestBodyMediaType<Op> = Op extends {
  requestBody: {
    content: infer B;
  };
} ? keyof B
  : never;

type OperationPathType<Op> = Op extends {
  parameters: {
    path: infer P;
  };
} ? { path: P }
  : Record<never, never>;

type OperationQueryType<Op> = Op extends {
  parameters: {
    query: infer Q;
  };
} ? { query: Q }
  : Record<never, never>;

type OperationV2BodyType<Op> = Op extends {
  parameters: {
    body: infer B;
  };
} ? (B extends Record<string, unknown> ? { body: B[keyof B] }
    : Record<never, never>)
  : Record<never, never>;

type OperationV3JsonBodyType<Op> = Op extends {
  requestBody: {
    content: {
      "application/json": infer B;
    };
  };
} ? { body: B }
  : Record<never, never>;

type OperationV3FormDataBodyType<Op> = Op extends {
  requestBody: {
    content: {
      "multipart/form-data": infer B;
    };
  };
} ? { body: B }
  : Record<never, never>;

export type OperationArgType<Op> =
  & OperationPathType<Op>
  & OperationQueryType<Op>
  & OperationV2BodyType<Op>
  & OperationV3JsonBodyType<Op>
  & OperationV3FormDataBodyType<Op>;

type OperationResponsesType<Op> = Op extends {
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

type SuccessResponsesType<R> = 200 extends keyof R ? R[200]
  : 201 extends keyof R ? R[201]
  : "default" extends keyof R ? R["default"]
  : unknown;

export type OperationReturnType<Op> = SuccessResponsesType<
  OperationResponsesType<Op>
>;

type ErrorResponsesType<
  R,
  K extends keyof R = Exclude<keyof R, 200 | 201 | "default">,
> = {
  [S in K]: OperationResponse<S, R[S]>;
}[K];

type Coalesce<T, D> = [T] extends [never] ? D : T;

export type OperationErrorType<Op> = Coalesce<
  ErrorResponsesType<
    OperationResponsesType<Op>
  >,
  OperationResponse<number, any>
>;

export type OperationErrorConstructorType<Op> = new (
  error: Omit<OperationResponse, "ok">,
) => OperationErrorType<Op>;

export type CustomRequestInit = Omit<RequestInit, "headers"> & {
  readonly headers: Headers;
};

export type Fetch = (
  url: string,
  init: CustomRequestInit,
) => Promise<OperationResponse>;

export type TypedFetch<Op> = (
  arg: OperationArgType<Op>,
  init?: RequestInit,
) => Promise<OperationResponse<OperationReturnType<Op>>>;

export type RawFetch<Op> = (
  arg: OperationArgType<Op>,
  init?: RequestInit,
) => Promise<OperationResponse<ReadableStream<Uint8Array> | null>>;

export type OperationApi<Op> = TypedFetch<Op> & {
  Error: OperationErrorConstructorType<Op>;
  stream: RawFetch<Op>;
};

export type OperationApiArgType<F> = F extends OperationApi<infer Op>
  ? OperationArgType<Op>
  : never;

export type OperationApiReturnType<F> = F extends OperationApi<infer Op>
  ? OperationReturnType<Op>
  : never;

export type OperationApiErrorType<F> = F extends OperationApi<infer Op>
  ? OperationErrorConstructorType<Op>
  : never;

export type OpenapiClientMiddleware = (
  url: string,
  init: CustomRequestInit,
  next: Fetch,
) => Promise<OperationResponse>;

export type OpenapiClientConfig = {
  baseUrl?: string;
  init?: RequestInit;
  use?: OpenapiClientMiddleware[];
};

export type FetchRequest = {
  baseUrl: string;
  method: RequestMethod;
  mediaType?: RequestMediaType;
  path: string;
  payload: DefaultRequestPayload;
  init?: RequestInit;
  fetch: Fetch;
};

export type OperationResponse<S = any, R = any> = {
  readonly headers: Headers;
  readonly url: string;
  readonly ok: boolean;
  readonly status: S;
  readonly statusText: string;
  readonly data: R;
};

export class OperationError extends Error {
  readonly headers: Headers;
  readonly url: string;
  readonly status: number;
  readonly statusText: string;
  readonly data: any;

  constructor(response: Omit<OperationResponse, "ok">) {
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
