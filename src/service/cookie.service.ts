import type * as vscode from "vscode";

const COOKIE_SECRET_KEY = "zhihu.cookie";

export interface StoredCookie {
	name: string;
	value: string;
	domain: string;
	path: string;
	expires: number;
	httpOnly: boolean;
	secure: boolean;
	sameSite: "Strict" | "Lax" | "None";
}

export interface CookieProvider {
	getCookieHeader(uri: string): Promise<string | undefined>;
	mergeResponseCookies?(uri: string, setCookieHeaders: readonly string[]): Promise<void>;
}

export interface CookieStore extends CookieProvider {
	storeCookies(cookies: readonly StoredCookie[]): Promise<void>;
	mergeResponseCookies(uri: string, setCookieHeaders: readonly string[]): Promise<void>;
	clearCookie(): Promise<void>;
}

export type SecretStorage = Pick<vscode.SecretStorage, "get" | "store" | "delete">;

export class CookieService implements CookieStore {
	constructor(private readonly secrets: SecretStorage) {}

	public async getCookies(): Promise<StoredCookie[]> {
		const serialized = await this.secrets.get(COOKIE_SECRET_KEY);
		if (!serialized) {
			return [];
		}

		try {
			const value: unknown = JSON.parse(serialized);
			return Array.isArray(value) ? sanitizeCookies(value) : [];
		} catch {
			return [];
		}
	}

	public async getCookieHeader(uri: string): Promise<string | undefined> {
		return createCookieHeader(await this.getCookies(), uri);
	}

	public async storeCookies(cookies: readonly StoredCookie[]): Promise<void> {
		const sanitized = sanitizeCookies(cookies);
		if (sanitized.length === 0) {
			throw new Error("浏览器没有返回可用的知乎 Cookie");
		}
		await this.secrets.store(COOKIE_SECRET_KEY, JSON.stringify(sanitized));
	}

	public async mergeResponseCookies(uri: string, setCookieHeaders: readonly string[]): Promise<void> {
		let requestUrl: URL;
		try {
			requestUrl = new URL(uri);
		} catch {
			return;
		}

		const mutations = setCookieHeaders
			.map(header => parseSetCookie(header, requestUrl))
			.filter((mutation): mutation is CookieMutation => mutation !== undefined);
		if (mutations.length === 0) {
			return;
		}

		let cookies = await this.getCookies();
		for (const mutation of mutations) {
			const { cookie } = mutation;
			cookies = cookies.filter(current => !sameCookie(current, cookie));
			if (!mutation.remove) {
				cookies.push(cookie);
			}
		}

		const sanitized = sanitizeCookies(cookies);
		if (sanitized.length === 0) {
			await this.secrets.delete(COOKIE_SECRET_KEY);
		} else {
			await this.secrets.store(COOKIE_SECRET_KEY, JSON.stringify(sanitized));
		}
	}

	public async clearCookie(): Promise<void> {
		await this.secrets.delete(COOKIE_SECRET_KEY);
	}
}

export function createCookieHeader(
	cookies: readonly StoredCookie[],
	uri: string,
	nowSeconds = Date.now() / 1000,
): string | undefined {
	let url: URL;
	try {
		url = new URL(uri);
	} catch {
		return undefined;
	}

	const matchingCookies = sanitizeCookies(cookies)
		.filter(cookie => cookieMatches(cookie, url, nowSeconds))
		.sort((left, right) => right.path.length - left.path.length);

	return matchingCookies.length > 0
		? matchingCookies.map(cookie => `${cookie.name}=${cookie.value}`).join("; ")
		: undefined;
}

function sanitizeCookies(values: readonly unknown[]): StoredCookie[] {
	const cookies: StoredCookie[] = [];
	const seen = new Set<string>();

	for (const value of values) {
		const cookie = sanitizeCookie(value);
		if (!cookie || !isZhihuDomain(cookie.domain)) {
			continue;
		}

		const key = `${cookie.name}\u0000${cookie.domain}\u0000${cookie.path}`;
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		cookies.push(cookie);
	}

	return cookies;
}

function sanitizeCookie(value: unknown): StoredCookie | undefined {
	if (!value || typeof value !== "object") {
		return undefined;
	}

	const cookie = value as Partial<StoredCookie>;
	if (
		typeof cookie.name !== "string"
		|| !/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(cookie.name)
		|| typeof cookie.value !== "string"
		|| /[\r\n;]/.test(cookie.value)
		|| typeof cookie.domain !== "string"
		|| typeof cookie.path !== "string"
	) {
		return undefined;
	}

	return {
		name: cookie.name,
		value: cookie.value,
		domain: cookie.domain.toLowerCase(),
		path: cookie.path.startsWith("/") ? cookie.path : "/",
		expires: typeof cookie.expires === "number" ? cookie.expires : -1,
		httpOnly: cookie.httpOnly === true,
		secure: cookie.secure === true,
		sameSite: cookie.sameSite === "Strict" || cookie.sameSite === "None" ? cookie.sameSite : "Lax",
	};
}

function cookieMatches(cookie: StoredCookie, url: URL, nowSeconds: number): boolean {
	if (cookie.secure && url.protocol !== "https:") {
		return false;
	}
	if (cookie.expires > 0 && cookie.expires <= nowSeconds) {
		return false;
	}
	if (!domainMatches(cookie.domain, url.hostname.toLowerCase())) {
		return false;
	}
	return pathMatches(cookie.path, url.pathname || "/");
}

function domainMatches(cookieDomain: string, hostname: string): boolean {
	const domain = cookieDomain.replace(/^\./, "");
	return cookieDomain.startsWith(".")
		? hostname === domain || hostname.endsWith(`.${domain}`)
		: hostname === domain;
}

function pathMatches(cookiePath: string, requestPath: string): boolean {
	if (requestPath === cookiePath) {
		return true;
	}
	if (!requestPath.startsWith(cookiePath)) {
		return false;
	}
	return cookiePath.endsWith("/") || requestPath.charAt(cookiePath.length) === "/";
}

function isZhihuDomain(domain: string): boolean {
	const normalized = domain.toLowerCase().replace(/^\./, "");
	return normalized === "zhihu.com" || normalized.endsWith(".zhihu.com");
}

interface CookieMutation {
	cookie: StoredCookie;
	remove: boolean;
}

function parseSetCookie(header: string, requestUrl: URL): CookieMutation | undefined {
	const parts = header.split(";");
	const nameValue = parts.shift()?.trim();
	if (!nameValue) {
		return undefined;
	}

	const separator = nameValue.indexOf("=");
	if (separator <= 0) {
		return undefined;
	}

	const attributes = new Map<string, string>();
	const flags = new Set<string>();
	for (const part of parts) {
		const attribute = part.trim();
		const attributeSeparator = attribute.indexOf("=");
		if (attributeSeparator < 0) {
			flags.add(attribute.toLowerCase());
		} else {
			attributes.set(
				attribute.slice(0, attributeSeparator).trim().toLowerCase(),
				attribute.slice(attributeSeparator + 1).trim(),
			);
		}
	}

	const requestHost = requestUrl.hostname.toLowerCase();
	const domainAttribute = attributes.get("domain")?.toLowerCase().replace(/^\./, "");
	if (domainAttribute && requestHost !== domainAttribute && !requestHost.endsWith(`.${domainAttribute}`)) {
		return undefined;
	}
	const domain = domainAttribute ? `.${domainAttribute}` : requestHost;
	const path = normalizeResponseCookiePath(attributes.get("path"), requestUrl.pathname);
	const maxAge = Number.parseInt(attributes.get("max-age") ?? "", 10);
	const expiresDate = Date.parse(attributes.get("expires") ?? "");
	const expires = Number.isFinite(maxAge)
		? Math.floor(Date.now() / 1000) + maxAge
		: Number.isFinite(expiresDate) ? expiresDate / 1000 : -1;
	const sameSite = attributes.get("samesite")?.toLowerCase();
	const cookie = sanitizeCookie({
		name: nameValue.slice(0, separator).trim(),
		value: nameValue.slice(separator + 1),
		domain,
		path,
		expires,
		httpOnly: flags.has("httponly"),
		secure: flags.has("secure"),
		sameSite: sameSite === "strict" ? "Strict" : sameSite === "none" ? "None" : "Lax",
	});
	if (!cookie || !isZhihuDomain(cookie.domain)) {
		return undefined;
	}

	return {
		cookie,
		remove: (Number.isFinite(maxAge) && maxAge <= 0) || (cookie.expires > 0 && cookie.expires <= Date.now() / 1000),
	};
}

function normalizeResponseCookiePath(attributePath: string | undefined, requestPath: string): string {
	if (attributePath?.startsWith("/")) {
		return attributePath;
	}
	const lastSlash = requestPath.lastIndexOf("/");
	return lastSlash <= 0 ? "/" : requestPath.slice(0, lastSlash);
}

function sameCookie(left: StoredCookie, right: StoredCookie): boolean {
	return left.name === right.name && left.domain === right.domain && left.path === right.path;
}
