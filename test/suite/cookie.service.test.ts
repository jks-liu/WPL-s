import * as assert from "assert";
import {
	CookieService,
	createCookieHeader,
	type SecretStorage,
	type StoredCookie,
} from "../../src/service/cookie.service";

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

suite("Cookie Service", () => {
	test("stores only Zhihu cookies and creates a header for each host", async () => {
		const service = new CookieService(new MemorySecretStorage());
		await service.storeCookies([
			cookie("z_c0", "token==", ".zhihu.com"),
			cookie("www_only", "www", "www.zhihu.com"),
			cookie("column_only", "column", "zhuanlan.zhihu.com"),
			cookie("unrelated", "secret", ".example.com"),
		]);

		assert.strictEqual(
			await service.getCookieHeader("https://www.zhihu.com/api/v4/me"),
			"z_c0=token==; www_only=www",
		);
		assert.strictEqual(
			await service.getCookieHeader("https://zhuanlan.zhihu.com/api/articles/drafts"),
			"z_c0=token==; column_only=column",
		);
	});

	test("respects cookie path, secure flag and expiry", () => {
		const now = 2_000;
		const cookies = [
			cookie("root", "yes", ".zhihu.com", "/", false),
			cookie("api", "yes", ".zhihu.com", "/api", false),
			cookie("secure", "yes", ".zhihu.com", "/", true),
			{ ...cookie("expired", "no", ".zhihu.com"), expires: now - 1 },
		];

		assert.strictEqual(
			createCookieHeader(cookies, "https://www.zhihu.com/api/v4/me", now),
			"api=yes; root=yes; secure=yes",
		);
		assert.strictEqual(
			createCookieHeader(cookies, "http://www.zhihu.com/", now),
			"root=yes",
		);
	});

	test("does not replace stored credentials with an empty result", async () => {
		const service = new CookieService(new MemorySecretStorage());
		await service.storeCookies([cookie("z_c0", "token", ".zhihu.com")]);

		await assert.rejects(service.storeCookies([]), /没有返回可用的知乎 Cookie/);
		assert.strictEqual(await service.getCookieHeader("https://www.zhihu.com/"), "z_c0=token");
	});

	test("clears stored credentials", async () => {
		const service = new CookieService(new MemorySecretStorage());
		await service.storeCookies([cookie("z_c0", "token", ".zhihu.com")]);
		await service.clearCookie();

		assert.strictEqual(await service.getCookieHeader("https://www.zhihu.com/"), undefined);
	});

	test("merges rotated response cookies and removes expired cookies", async () => {
		const service = new CookieService(new MemorySecretStorage());
		await service.storeCookies([
			cookie("z_c0", "old-session", ".zhihu.com"),
			cookie("_xsrf", "old-xsrf", ".zhihu.com"),
		]);

		await service.mergeResponseCookies("https://www.zhihu.com/api/v4/me", [
			"_xsrf=new-xsrf; Domain=.zhihu.com; Path=/; Secure; HttpOnly; SameSite=Lax",
			"z_c0=; Domain=.zhihu.com; Path=/; Max-Age=0; Secure",
			"foreign=ignored; Domain=.example.com; Path=/",
		]);

		assert.strictEqual(
			await service.getCookieHeader("https://www.zhihu.com/api/v4/me"),
			"_xsrf=new-xsrf",
		);
	});
});

function cookie(
	name: string,
	value: string,
	domain: string,
	path = "/",
	secure = true,
): StoredCookie {
	return {
		name,
		value,
		domain,
		path,
		expires: -1,
		httpOnly: true,
		secure,
		sameSite: "Lax",
	};
}
