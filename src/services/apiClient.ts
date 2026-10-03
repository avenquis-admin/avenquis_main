export interface ApiRequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
}

export interface ApiResponse<T = unknown> {
  data: T;
  status: number;
  message?: string;
  ok: boolean;
}

export type ApiErrorType =
  | 'NETWORK_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'VALIDATION_ERROR'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR'
  | 'UNKNOWN_ERROR';

export class ApiError extends Error {
  status: number;
  code?: string;
  type: ApiErrorType;
  details?: unknown;
  validationErrors?: unknown;

  constructor(
    message: string,
    status: number,
    type: ApiErrorType,
    code?: string,
    details?: unknown,
    validationErrors?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.type = type;
    this.code = code;
    this.details = details;
    this.validationErrors = validationErrors;
  }
}

const TOKEN_KEY = 'avenquis_platform_token';

export function getDataMode(): 'api' | 'mock' {
  const env = (import.meta as unknown as {
    env: Record<string, string>;
  }).env;

  return env?.VITE_DATA_MODE === 'mock'
    ? 'mock'
    : 'api';
}

class ApiClient {
  private baseURL: string;

  constructor() {
    const env = (import.meta as unknown as {
      env: Record<string, string>;
    }).env;

    this.baseURL =
      env?.VITE_API_BASE_URL ||
      'http://127.0.0.1:8101/api/v1';
  }

  public setBaseURL(url: string) {
    this.baseURL = url;
  }

  public getBaseURL(): string {
    return this.baseURL;
  }

  private buildUrl(
    endpoint: string,
    params?: Record<
      string,
      string | number | boolean | undefined
    >,
  ): string {
    const cleanEndpoint = endpoint.replace(/^\/+/, '');
    const baseURL = this.baseURL.endsWith('/')
      ? this.baseURL
      : `${this.baseURL}/`;

    const url = new URL(cleanEndpoint, baseURL);

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.append(
            key,
            String(value),
          );
        }
      }
    }

    return url.toString();
  }

  private determineErrorType(
    status: number,
  ): ApiErrorType {
    if (status === 401) return 'UNAUTHORIZED';
    if (status === 403) return 'FORBIDDEN';
    if (status === 404) return 'NOT_FOUND';
    if (status === 409) return 'CONFLICT';
    if (status === 422) return 'VALIDATION_ERROR';
    if (status === 429) return 'RATE_LIMITED';
    if (status >= 500) return 'SERVER_ERROR';

    return 'UNKNOWN_ERROR';
  }

  public async request<T = unknown>(
    endpoint: string,
    options: ApiRequestOptions = {},
  ): Promise<ApiResponse<T>> {
    const {
      params,
      headers,
      ...restOptions
    } = options;

    const url = this.buildUrl(
      endpoint,
      params,
    );

    let token: string | null = null;

    try {
      token = localStorage.getItem(TOKEN_KEY);
    } catch {
      token = null;
    }

    const defaultHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Client-Application':
        'Avenquis-Control-Panel',
    };

    if (token) {
      defaultHeaders.Authorization =
        `Bearer ${token}`;
    }

    const config: RequestInit = {
      ...restOptions,
      credentials: 'include',
      headers: {
        ...defaultHeaders,
        ...(headers || {}),
      },
    };

    try {
      const response = await fetch(
        url,
        config,
      );

      let responseData: unknown = null;

      if (response.status !== 204) {
        const contentType =
          response.headers.get(
            'content-type',
          );

        if (
          contentType?.includes(
            'application/json',
          )
        ) {
          responseData =
            await response.json();
        } else {
          responseData =
            await response.text();
        }
      }

      if (!response.ok) {
        const errorData = responseData as
          | {
              message?: string;
              code?: string;
              error?: {
                message?: string;
                code?: string;
              };
              details?: unknown;
              validationErrors?: unknown;
            }
          | null;

        const message =
          errorData?.error?.message ||
          errorData?.message ||
          `Request failed with status ${response.status}`;

        throw new ApiError(
          message,
          response.status,
          this.determineErrorType(
            response.status,
          ),
          errorData?.error?.code ||
            errorData?.code,
          errorData?.details,
          errorData?.validationErrors,
        );
      }

      return {
        data: responseData as T,
        status: response.status,
        ok: true,
      };
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError(
        error instanceof Error
          ? error.message
          : 'Network request failed',
        0,
        'NETWORK_ERROR',
      );
    }
  }

  public get<T = unknown>(
    endpoint: string,
    options: ApiRequestOptions = {},
  ) {
    return this.request<T>(endpoint, {
      ...options,
      method: 'GET',
    });
  }

  public post<T = unknown>(
    endpoint: string,
    body?: unknown,
    options: ApiRequestOptions = {},
  ) {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body:
        body === undefined
          ? undefined
          : JSON.stringify(body),
    });
  }

  public patch<T = unknown>(
    endpoint: string,
    body?: unknown,
    options: ApiRequestOptions = {},
  ) {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body:
        body === undefined
          ? undefined
          : JSON.stringify(body),
    });
  }

  public put<T = unknown>(
    endpoint: string,
    body?: unknown,
    options: ApiRequestOptions = {},
  ) {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body:
        body === undefined
          ? undefined
          : JSON.stringify(body),
    });
  }

  public delete<T = unknown>(
    endpoint: string,
    options: ApiRequestOptions = {},
  ) {
    return this.request<T>(endpoint, {
      ...options,
      method: 'DELETE',
    });
  }
}

export const apiClient = new ApiClient();
