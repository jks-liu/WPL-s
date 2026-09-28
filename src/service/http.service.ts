import { DefaultHTTPHeader } from "../const/HTTP";
import { Output } from "../global/logger";
import { type CookieProvider } from "./cookie.service";

export interface HttpRequestOptions {
	uri: string;
	method?: string;
	headers?: Record<string, string> | null;
	body?: unknown;
	json?: boolean;
	encoding?: string | null;
	resolveWithFullResponse?: boolean;
	enableCache?: boolean;
	cookie?: string;
	signal?: AbortSignal;
	timeoutMs?: number;
}

export interface HttpResponse<T = unknown> {
	statusCode: number;
	body: T;
	request: { href: string };
}

export class HttpService {
	private readonly cache = new Map<string, HttpResponse>();

	constructor(
		private readonly cookieProvider: CookieProvider,
		private readonly fetchFunction: typeof fetch = globalThis.fetch,
	) {}

	public async sendRequest<T = any>(options: HttpRequestOptions): Promise<T | HttpResponse<T> | null> {
		const returnFullResponse = options.resolveWithFullResponse === true;
		try {
			let response = options.enableCache ? this.cache.get(options.uri) : undefined;
			if (!response) {
				response = await this.fetchResponse<T>(options);
				if (options.enableCache) {
					this.cache.set(options.uri, response);
				}
			}
			return returnFullResponse ? response as HttpResponse<T> : response.body as T;
		} catch (error) {
			Output(`请求失败：${formatError(error)}`);
			return null;
		}
	}

	public clearCache(): void {
		this.cache.clear();
	}

	private async fetchResponse<T>(options: HttpRequestOptions): Promise<HttpResponse<T>> {
		const headers = new Headers(options.headers === null ? {} : DefaultHTTPHeader);
		for (const [name, value] of Object.entries(options.headers ?? {})) {
			headers.set(name, value);
		}
		const cookie = options.cookie ?? await this.cookieProvider.getCookieHeader(options.uri);
		if (cookie) {
			headers.set("cookie", cookie);
			const xsrfToken = getCookieValue(cookie, "_xsrf");
			if (xsrfToken && !headers.has("x-xsrftoken")) {
				headers.set("x-xsrftoken", xsrfToken);
			}
		}

		const body = createRequestBody(options.body, options.json === true, headers);
		const requestCancellation = createRequestCancellation(options.signal, options.timeoutMs);
		let response: Response;
		try {
			response = await this.fetchFunction(options.uri, {
				method: options.method?.toUpperCase() ?? "GET",
				headers,
				body,
				signal: requestCancellation.signal,
			});
		} finally {
			requestCancellation.dispose();
		}

		const setCookieHeaders = getSetCookieHeaders(response.headers);
		if (options.cookie === undefined && setCookieHeaders.length > 0 && this.cookieProvider.mergeResponseCookies) {
			try {
				await this.cookieProvider.mergeResponseCookies(response.url || options.uri, setCookieHeaders);
			} catch (error) {
				Output(`保存响应 Cookie 失败：${formatError(error)}`);
			}
		}

		let responseBody: unknown;
		if (options.encoding === null) {
			responseBody = Buffer.from(await response.arrayBuffer());
		} else if (options.json) {
			const text = await response.text();
			responseBody = text ? JSON.parse(text) : undefined;
		} else {
			responseBody = await response.text();
		}

		return {
			statusCode: response.status,
			body: responseBody as T,
			request: { href: response.url || options.uri },
		};
	}
}

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

function createRequestCancellation(
	parentSignal: AbortSignal | undefined,
	timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
): { signal: AbortSignal; dispose: () => void } {
	const controller = new AbortController();
	const effectiveTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0
		? timeoutMs
		: DEFAULT_REQUEST_TIMEOUT_MS;
	const timeout = setTimeout(() => controller.abort(), effectiveTimeout);
	const abortFromParent = () => controller.abort(parentSignal?.reason);

	if (parentSignal?.aborted) {
		abortFromParent();
	} else {
		parentSignal?.addEventListener("abort", abortFromParent, { once: true });
	}

	return {
		signal: controller.signal,
		dispose: () => {
			clearTimeout(timeout);
			parentSignal?.removeEventListener("abort", abortFromParent);
		},
	};
}

let httpService: HttpService | undefined;

export function initHttpService(cookieProvider: CookieProvider): void {
	httpService = new HttpService(cookieProvider);
}

export function sendRequest<T = any>(options: HttpRequestOptions & { resolveWithFullResponse: true }): Promise<HttpResponse<T> | null>;
export function sendRequest<T = any>(options: HttpRequestOptions): Promise<T | null>;
export function sendRequest<T = any>(options: HttpRequestOptions): Promise<T | HttpResponse<T> | null> {
	if (!httpService) {
		throw new Error("HttpService 尚未初始化");
	}
	return httpService.sendRequest<T>(options);
}

export function clearCache(): void {
	httpService?.clearCache();
}

function createRequestBody(body: unknown, json: boolean, headers: Headers): BodyInit | undefined {
	if (body === undefined || body === null) {
		return undefined;
	}
	if (typeof body === "string" || body instanceof URLSearchParams || Buffer.isBuffer(body)) {
		return body as BodyInit;
	}
	if (json) {
		if (!headers.has("content-type")) {
			headers.set("content-type", "application/json; charset=UTF-8");
		}
		return JSON.stringify(body);
	}
	return new URLSearchParams(body as Record<string, string>);
}

function getCookieValue(cookieHeader: string, name: string): string | undefined {
	for (const pair of cookieHeader.split(";")) {
		const separator = pair.indexOf("=");
		if (separator > 0 && pair.slice(0, separator).trim() === name) {
			return pair.slice(separator + 1).trim();
		}
	}
	return undefined;
}

function getSetCookieHeaders(headers: Headers): string[] {
	const extendedHeaders = headers as Headers & { getSetCookie?: () => string[] };
	const separateHeaders = extendedHeaders.getSetCookie?.();
	if (separateHeaders && separateHeaders.length > 0) {
		return separateHeaders;
	}

	const combinedHeader = headers.get("set-cookie");
	return combinedHeader
		? combinedHeader.split(/,(?=\s*[!#$%&'*+\-.^_`|~0-9A-Za-z]+=)/)
		: [];
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
