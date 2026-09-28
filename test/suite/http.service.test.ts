import * as assert from "assert";
import { HttpService, type HttpResponse } from "../../src/service/http.service";
import { CookieService, type CookieProvider, type SecretStorage } from "../../src/service/cookie.service";

class MemorySecretStorage implements SecretStorage {
	private readonly values = new Map<string, string>();

	public get(key: string): Promise<string | undefined> {
		return Promise.resolve(this.values.get(key));
	}

	public store(key: string, value: string): Promise<void> {
		this.values.set(key, value);
		return Promise.resolve();
	}

	public delete(key: string): Promise<void> {
		this.values.delete(key);
		return Promise.resolve();
	}
}

suite("HTTP Service", () => {
	test("adds the scoped Cookie and XSRF headers", async () => {
		let requestHeaders: Headers | undefined;
		const cookieProvider: CookieProvider = {
			getCookieHeader: async () => "z_c0=token==; _xsrf=csrf-token",
		};
		const fetchFunction = (async (_input: string | URL | Request, init?: RequestInit) => {
			requestHeaders = new Headers(init?.headers);
			return new Response(JSON.stringify({ id: "profile" }), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		}) as typeof fetch;
		const service = new HttpService(cookieProvider, fetchFunction);

		await service.sendRequest({ uri: "https://www.zhihu.com/api/v4/me", json: true });

		assert.strictEqual(requestHeaders?.get("cookie"), "z_c0=token==; _xsrf=csrf-token");
		assert.strictEqual(requestHeaders?.get("x-xsrftoken"), "csrf-token");
	});

	test("uses an explicit cookie and preserves an explicit XSRF header", async () => {
		let requestHeaders: Headers | undefined;
		let mergeCalls = 0;
		const cookieProvider: CookieProvider = {
			getCookieHeader: async () => "stored=yes; _xsrf=stored-csrf",
			mergeResponseCookies: async () => { mergeCalls += 1; },
		};
		const fetchFunction = (async (_input: string | URL | Request, init?: RequestInit) => {
			requestHeaders = new Headers(init?.headers);
			return new Response(null, {
				status: 204,
				headers: { "set-cookie": "_xsrf=anonymous; Domain=.zhihu.com; Path=/" },
			});
		}) as typeof fetch;
		const service = new HttpService(cookieProvider, fetchFunction);

		await service.sendRequest({
			uri: "https://www.zhihu.com/api/v4/me",
			cookie: "fresh=yes; _xsrf=fresh-csrf",
			headers: { "x-xsrftoken": "explicit-csrf" },
		});

		assert.strictEqual(requestHeaders?.get("cookie"), "fresh=yes; _xsrf=fresh-csrf");
		assert.strictEqual(requestHeaders?.get("x-xsrftoken"), "explicit-csrf");
		assert.strictEqual(mergeCalls, 0, "temporary validation cookies must not update the stored session");
	});

	test("serializes JSON and returns a full response", async () => {
		let requestBody: BodyInit | null | undefined;
		let requestHeaders: Headers | undefined;
		const cookieProvider: CookieProvider = { getCookieHeader: async () => undefined };
		const fetchFunction = (async (_input: string | URL | Request, init?: RequestInit) => {
			requestBody = init?.body;
			requestHeaders = new Headers(init?.headers);
			return new Response(JSON.stringify({ id: 42 }), {
				status: 201,
				headers: { "x-test": "ok" },
			});
		}) as typeof fetch;
		const service = new HttpService(cookieProvider, fetchFunction);

		const response = await service.sendRequest<{ id: number }>({
			uri: "https://zhuanlan.zhihu.com/api/articles/drafts",
			method: "post",
			json: true,
			body: { title: "test" },
			resolveWithFullResponse: true,
		}) as HttpResponse<{ id: number }>;

		assert.strictEqual(requestBody, JSON.stringify({ title: "test" }));
		assert.strictEqual(requestHeaders?.get("content-type"), "application/json; charset=UTF-8");
		assert.ok(requestHeaders?.get("user-agent"));
		assert.strictEqual(response.statusCode, 201);
		assert.deepStrictEqual(response.body, { id: 42 });
		assert.strictEqual(response.request.href, "https://zhuanlan.zhihu.com/api/articles/drafts");
	});

	test("caches responses until clearCache is called", async () => {
		let calls = 0;
		const cookieProvider: CookieProvider = { getCookieHeader: async () => undefined };
		const fetchFunction = (async () => {
			calls += 1;
			return new Response(String(calls), { status: 200 });
		}) as typeof fetch;
		const service = new HttpService(cookieProvider, fetchFunction);
		const request = { uri: "https://www.zhihu.com/api/test", enableCache: true };

		assert.strictEqual(await service.sendRequest(request), "1");
		assert.strictEqual(await service.sendRequest(request), "1");
		service.clearCache();
		assert.strictEqual(await service.sendRequest(request), "2");
	});

	test("stores Set-Cookie updates through CookieService", async () => {
		const cookieService = new CookieService(new MemorySecretStorage());
		const fetchFunction = (async () => new Response("ok", {
			status: 200,
			headers: { "set-cookie": "_xsrf=rotated; Domain=.zhihu.com; Path=/; Secure; SameSite=Lax" },
		})) as typeof fetch;
		const service = new HttpService(cookieService, fetchFunction);

		await service.sendRequest({ uri: "https://www.zhihu.com/api/v4/me" });

		assert.strictEqual(
			await cookieService.getCookieHeader("https://www.zhihu.com/api/v4/me"),
			"_xsrf=rotated",
		);
	});

	test("returns binary responses as Buffer", async () => {
		const cookieProvider: CookieProvider = { getCookieHeader: async () => undefined };
		const fetchFunction = (async () => new Response(Uint8Array.from([1, 2, 3]))) as typeof fetch;
		const service = new HttpService(cookieProvider, fetchFunction);

		const result = await service.sendRequest({
			uri: "https://pic.zhihu.com/image.png",
			encoding: null,
		});

		assert.deepStrictEqual(result, Buffer.from([1, 2, 3]));
	});

	test("aborts requests after the configured timeout", async () => {
		let observedSignal: AbortSignal | undefined;
		const cookieProvider: CookieProvider = { getCookieHeader: async () => undefined };
		const fetchFunction = (async (_input: string | URL | Request, init?: RequestInit) => {
			observedSignal = init?.signal ?? undefined;
			return new Promise<Response>((_resolve, reject) => {
				observedSignal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
			});
		}) as typeof fetch;
		const service = new HttpService(cookieProvider, fetchFunction);

		const result = await service.sendRequest({
			uri: "https://www.zhihu.com/api/never",
			timeoutMs: 5,
		});

		assert.strictEqual(result, null);
		assert.strictEqual(observedSignal?.aborted, true);
	});
});
