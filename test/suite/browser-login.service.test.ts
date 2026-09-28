import * as assert from "assert";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import * as path from "path";
import type { BrowserContext, Cookie, Page } from "playwright-core";
import * as vscode from "vscode";
import {
	BrowserLoginService,
	type BrowserLoginTimings,
	type PersistentBrowserLaunchOptions,
	type PersistentBrowserLauncher,
} from "../../src/service/browser-login.service";

suite("Browser Login Service", () => {
	test("opens a visible persistent browser and extracts Zhihu cookies", async () => {
		const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "wpls-browser-test-"));
		let launchedProfile = "";
		let launchOptions: PersistentBrowserLaunchOptions | undefined;
		let navigatedTo = "";
		let closeListener: (() => void) | undefined;
		let closeCalls = 0;
		let validationCalls = 0;

		const page = {
			goto: async (url: string) => {
				navigatedTo = url;
				return null;
			},
			bringToFront: async () => undefined,
		} as unknown as Page;
		const cookies: Cookie[] = [{
			name: "z_c0",
			value: "token==",
			domain: ".zhihu.com",
			path: "/",
			expires: -1,
			httpOnly: true,
			secure: true,
			sameSite: "Lax",
		}, {
			name: "third_party",
			value: "ignored",
			domain: ".example.com",
			path: "/",
			expires: -1,
			httpOnly: false,
			secure: true,
			sameSite: "Lax",
		}];
		const browserContext = {
			pages: () => [page],
			newPage: async () => page,
			cookies: async () => cookies,
			once: (event: string, listener: () => void) => {
				if (event === "close") {
					closeListener = listener;
				}
				return browserContext;
			},
			close: async () => {
				closeCalls += 1;
				closeListener?.();
			},
		} as unknown as BrowserContext;
		const launcher: PersistentBrowserLauncher = {
			launchPersistentContext: async (userDataDir, options) => {
				launchedProfile = userDataDir;
				launchOptions = options;
				return browserContext;
			},
		};
		const extensionContext = {
			globalStorageUri: vscode.Uri.file(temporaryDirectory),
		} as vscode.ExtensionContext;
		const timings: BrowserLoginTimings = {
			loginTimeoutMs: 1_000,
			cookiePollIntervalMs: 0,
			validationRetryIntervalMs: 0,
		};
		const service = new BrowserLoginService(extensionContext, launcher, timings);
		const cancellation = new vscode.CancellationTokenSource();

		try {
			const result = await service.login(
				async cookieHeader => {
					validationCalls += 1;
					return validationCalls > 1 && cookieHeader === "z_c0=token==";
				},
				cancellation.token,
				{ report: () => undefined },
			);

			assert.strictEqual(
				normalizePathForComparison(path.dirname(launchedProfile)),
				normalizePathForComparison(temporaryDirectory),
			);
			assert.strictEqual(path.basename(launchedProfile), "zhihu-browser-profile");
			assert.strictEqual(launchOptions?.headless, false);
			assert.ok(launchOptions?.channel === "chrome" || launchOptions?.channel === "msedge");
			assert.strictEqual(navigatedTo, "https://www.zhihu.com/signin");
			assert.strictEqual(result?.cookies[0].value, "token==");
			assert.strictEqual(result?.cookies.length, 1);
			assert.strictEqual(validationCalls, 2, "unchanged cookies should be retried after a transient failure");
			assert.strictEqual(closeCalls, 1);
		} finally {
			cancellation.dispose();
			service.dispose();
			await rm(temporaryDirectory, { recursive: true, force: true });
		}
	});

	test("logout waits for an in-flight launch before deleting the profile", async () => {
		const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "wpls-browser-race-test-"));
		let resolveLaunch: ((context: BrowserContext) => void) | undefined;
		let closeCalls = 0;
		const browserContext = {
			close: async () => { closeCalls += 1; },
		} as unknown as BrowserContext;
		const launcher: PersistentBrowserLauncher = {
			launchPersistentContext: async () => new Promise<BrowserContext>(resolve => {
				resolveLaunch = resolve;
			}),
		};
		const extensionContext = {
			globalStorageUri: vscode.Uri.file(temporaryDirectory),
		} as vscode.ExtensionContext;
		const service = new BrowserLoginService(extensionContext, launcher);
		const cancellation = new vscode.CancellationTokenSource();

		try {
			const loginPromise = service.login(
				async () => true,
				cancellation.token,
				{ report: () => undefined },
			);
			while (!resolveLaunch) {
				await new Promise(resolve => setTimeout(resolve, 0));
			}

			const clearPromise = service.clearProfile();
			resolveLaunch(browserContext);

			assert.strictEqual(await loginPromise, undefined);
			await clearPromise;
			assert.strictEqual(closeCalls, 1);
			await assert.rejects(
				Promise.resolve(vscode.workspace.fs.stat(
					vscode.Uri.joinPath(extensionContext.globalStorageUri, "zhihu-browser-profile"),
				)),
			);
		} finally {
			cancellation.dispose();
			service.dispose();
			await rm(temporaryDirectory, { recursive: true, force: true });
		}
	});
});

function normalizePathForComparison(value: string): string {
	const normalized = path.resolve(value);
	return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}
