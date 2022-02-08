import { Fetcher } from "./fetcher.ts";

import type {
  ApiResponse,
  FetchArgType,
  FetchErrorType,
  FetchReturnType,
  Middleware,
  OpArgType,
  OpDefaultReturnType,
  OpErrorType,
  OpReturnType,
  TypedFetch,
} from "./types.ts";

import { ApiError } from "./types.ts";

export type {
  ApiResponse,
  FetchArgType,
  FetchErrorType,
  FetchReturnType,
  Middleware,
  OpArgType,
  OpDefaultReturnType,
  OpErrorType,
  OpReturnType,
  TypedFetch,
};

export { ApiError, Fetcher };
