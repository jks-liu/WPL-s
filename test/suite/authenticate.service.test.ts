import * as assert from "assert";
import * as vscode from "vscode";
import { AuthenticateService, type AuthenticationUI } from "../../src/service/authenticate.service";
import { type BrowserLogin } from "../../src/service/browser-login.service";
import { type CookieStore, type StoredCookie } from "../../src/service/cookie.service";
import { type IProfile } from "../../src/model/target/target";

const profile = { id: "person-id", name: "测试用户" } as IProfile;
const loginCookies: StoredCookie[] = [{
	name: "z_c0",
	value: "session",
	domain: ".zhihu.com",
	path: "/",
	expires: -1,
	httpOnly: true,
	secure: true,
	sameSite: "Lax",
}];

class TestAuthenticationUI implements AuthenticationUI {
	public readonly informationMessages: string[] = [];
	public readonly warningMessages: string[] = [];
	public readonly errorMessages: string[] = [];

	public async runLogin<T>(
		task: (
			progress: vscode.Progress<{ message?: string }>,
			cancellationToken: vscode.CancellationToken,
		) => Promise<T>,
	): Promise<T> {
		const cancellation = new vscode.CancellationTokenSource();
		try {
			return await task({ report: () => undefined }, cancellation.token);
		} finally {
			cancellation.dispose();
		}
	}

	public showInformationMessage(message: string): void {
		this.informationMessages.push(message);
	}

	public showWarningMessage(message: string): void {
		this.warningMessages.push(message);
	}

	public showErrorMessage(message: string): void {
		this.errorMessages.push(message);
	}
}

suite("Authenticate Service", () => {
	test("reuses a valid stored login without opening a browser", async () => {
		let browserCalls = 0;
		let cookieClearCalls = 0;
		let selectedProfile: IProfile | undefined;
		const account = {
			fetchProfile: async () => profile,
			clearProfile: () => undefined,
		};
		const browser = browserLogin({ login: async () => { browserCalls += 1; return undefined; } });
		const cookies = cookieStore({ clearCookie: async () => { cookieClearCalls += 1; } });
		const ui = new TestAuthenticationUI();
		const service = new AuthenticateService(
			{ setProfile: value => { selectedProfile = value; }, clearProfile: () => undefined },
			account,
			cookies,
			browser,
			ui,
		);

		await service.login();

		assert.strictEqual(browserCalls, 0);
		assert.strictEqual(cookieClearCalls, 0);
		assert.strictEqual(selectedProfile, profile);
	});

	test("stores Playwright cookies only after profile validation succeeds", async () => {
		let storedCookies: readonly StoredCookie[] | undefined;
		let cookieClearCalls = 0;
		let selectedProfile: IProfile | undefined;
		const account = {
			fetchProfile: async (cookie?: string, signal?: AbortSignal) => {
				if (!cookie) return undefined;
				assert.strictEqual(cookie, "z_c0=session");
				assert.ok(signal);
				return profile;
			},
			clearProfile: () => undefined,
		};
		const browser = browserLogin({
			login: async validate => {
				const valid = await validate("z_c0=session", new AbortController().signal);
				return valid ? { browser: "Microsoft Edge", cookies: loginCookies } : undefined;
			},
		});
		const cookies = cookieStore({
			clearCookie: async () => { cookieClearCalls += 1; },
			storeCookies: async value => { storedCookies = value; },
		});
		const ui = new TestAuthenticationUI();
		const service = new AuthenticateService(
			{ setProfile: value => { selectedProfile = value; }, clearProfile: () => undefined },
			account,
			cookies,
			browser,
			ui,
		);

		await service.login();

		assert.strictEqual(cookieClearCalls, 1);
		assert.deepStrictEqual(storedCookies, loginCookies);
		assert.strictEqual(selectedProfile, profile);
		assert.deepStrictEqual(ui.errorMessages, []);
	});

	test("does not store cookies when browser login is cancelled", async () => {
		let storeCalls = 0;
		const ui = new TestAuthenticationUI();
		const service = new AuthenticateService(
			{ setProfile: () => undefined, clearProfile: () => undefined },
			{ fetchProfile: async () => undefined, clearProfile: () => undefined },
			cookieStore({ storeCookies: async () => { storeCalls += 1; } }),
			browserLogin({ login: async () => undefined }),
			ui,
		);

		await service.login();

		assert.strictEqual(storeCalls, 0);
		assert.ok(ui.informationMessages.includes("知乎登录已取消。"));
	});

	test("logout clears both stored cookies and the dedicated browser profile", async () => {
		let cookieClearCalls = 0;
		let browserClearCalls = 0;
		let accountClearCalls = 0;
		let profileClearCalls = 0;
		const ui = new TestAuthenticationUI();
		const service = new AuthenticateService(
			{ setProfile: () => undefined, clearProfile: () => { profileClearCalls += 1; } },
			{ fetchProfile: async () => undefined, clearProfile: () => { accountClearCalls += 1; } },
			cookieStore({ clearCookie: async () => { cookieClearCalls += 1; } }),
			browserLogin({ clearProfile: async () => { browserClearCalls += 1; } }),
			ui,
		);

		await service.logout();

		assert.strictEqual(cookieClearCalls, 1);
		assert.strictEqual(browserClearCalls, 1);
		assert.strictEqual(accountClearCalls, 1);
		assert.strictEqual(profileClearCalls, 1);
	});
});

function browserLogin(overrides: Partial<BrowserLogin>): BrowserLogin {
	return {
		login: async () => undefined,
		clearProfile: async () => undefined,
		...overrides,
	};
}

function cookieStore(overrides: Partial<CookieStore>): CookieStore {
	return {
		getCookieHeader: async () => undefined,
		storeCookies: async () => undefined,
		mergeResponseCookies: async () => undefined,
		clearCookie: async () => undefined,
		...overrides,
	};
}
