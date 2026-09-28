import * as path from "path";
import {
	chromium,
	type BrowserContext,
	type Cookie,
} from "playwright-core";
import * as vscode from "vscode";
import { SelfProfileAPI } from "../const/URL";
import { Output } from "../global/logger";
import { createCookieHeader, type StoredCookie } from "./cookie.service";

const ZHIHU_SIGN_IN_URL = "https://www.zhihu.com/signin";
const BROWSER_PROFILE_DIRECTORY = "zhihu-browser-profile";

export interface BrowserLoginTimings {
	loginTimeoutMs: number;
	cookiePollIntervalMs: number;
	validationRetryIntervalMs: number;
}

const DEFAULT_LOGIN_TIMINGS: BrowserLoginTimings = {
	loginTimeoutMs: 10 * 60 * 1000,
	cookiePollIntervalMs: 1_000,
	validationRetryIntervalMs: 5_000,
};

export type CookieValidator = (cookieHeader: string, signal: AbortSignal) => Promise<boolean>;

export interface BrowserLoginResult {
	browser: string;
	cookies: StoredCookie[];
}

export interface BrowserLogin {
	login(
		validate: CookieValidator,
		cancellationToken: vscode.CancellationToken,
		progress: vscode.Progress<{ message?: string }>,
	): Promise<BrowserLoginResult | undefined>;
	clearProfile(): Promise<void>;
}

interface BrowserCandidate {
	label: string;
	channel?: "chrome" | "msedge";
	executablePath?: string;
}

export interface PersistentBrowserLauncher {
	launchPersistentContext(
		userDataDir: string,
		options: PersistentBrowserLaunchOptions,
	): Promise<BrowserContext>;
}

export type PersistentBrowserLaunchOptions = NonNullable<
	Parameters<typeof chromium.launchPersistentContext>[1]
>;

export class BrowserLoginService implements BrowserLogin, vscode.Disposable {
	private readonly profileUri: vscode.Uri;
	private activeContext: BrowserContext | undefined;
	private activeLoginCancellation: AbortController | undefined;
	private activeLoginPromise: Promise<BrowserLoginResult | undefined> | undefined;
	private loginInProgress = false;

	constructor(
		private readonly extensionContext: vscode.ExtensionContext,
		private readonly browserLauncher: PersistentBrowserLauncher = chromium,
		private readonly timings: BrowserLoginTimings = DEFAULT_LOGIN_TIMINGS,
	) {
		this.profileUri = vscode.Uri.joinPath(extensionContext.globalStorageUri, BROWSER_PROFILE_DIRECTORY);
	}

	public login(
		validate: CookieValidator,
		cancellationToken: vscode.CancellationToken,
		progress: vscode.Progress<{ message?: string }>,
	): Promise<BrowserLoginResult | undefined> {
		if (this.loginInProgress || this.activeContext) {
			return Promise.reject(new Error("知乎登录窗口已经打开"));
		}

		this.loginInProgress = true;
		const serviceCancellation = new AbortController();
		this.activeLoginCancellation = serviceCancellation;
		const loginPromise = this.runLogin(validate, cancellationToken, progress, serviceCancellation.signal)
			.finally(() => {
				this.loginInProgress = false;
				if (this.activeLoginCancellation === serviceCancellation) {
					this.activeLoginCancellation = undefined;
				}
				if (this.activeLoginPromise === loginPromise) {
					this.activeLoginPromise = undefined;
				}
			});
		this.activeLoginPromise = loginPromise;
		return loginPromise;
	}

	private async runLogin(
		validate: CookieValidator,
		cancellationToken: vscode.CancellationToken,
		progress: vscode.Progress<{ message?: string }>,
		serviceSignal: AbortSignal,
	): Promise<BrowserLoginResult | undefined> {
		if (vscode.env.uiKind !== vscode.UIKind.Desktop || vscode.env.remoteName) {
			throw new Error("专属浏览器登录目前只支持本地桌面版 VS Code，不支持 Web 或 Remote 工作区");
		}

		await vscode.workspace.fs.createDirectory(this.extensionContext.globalStorageUri);
		progress.report({ message: "正在启动专属浏览器…" });
		const launched = await this.launchBrowser(serviceSignal, cancellationToken);
		if (!launched) {
			return undefined;
		}
		const browserContext = launched.context;
		this.activeContext = browserContext;
		if (serviceSignal.aborted) {
			await browserContext.close().catch(() => undefined);
			this.activeContext = undefined;
			return undefined;
		}

		let browserClosed = false;
		browserContext.once("close", () => {
			browserClosed = true;
		});
		const cancellation = cancellationToken.onCancellationRequested(() => {
			void browserContext.close().catch(() => undefined);
		});

		try {
			if (cancellationToken.isCancellationRequested) {
				return undefined;
			}

			const page = browserContext.pages()[0] ?? await browserContext.newPage();
			try {
				await page.goto(ZHIHU_SIGN_IN_URL, {
					waitUntil: "domcontentloaded",
					timeout: 60_000,
				});
				await page.bringToFront();
			} catch (error) {
				Output(`知乎登录页尚未完全加载：${formatError(error)}`);
			}

			progress.report({ message: "请在浏览器窗口中完成知乎登录" });
			return await this.waitForAuthenticatedCookies(
				browserContext,
				launched.label,
				validate,
				cancellationToken,
				serviceSignal,
				() => browserClosed,
			);
		} finally {
			cancellation.dispose();
			if (!browserClosed) {
				await browserContext.close().catch(() => undefined);
			}
			if (this.activeContext === browserContext) {
				this.activeContext = undefined;
			}
		}
	}

	public async clearProfile(): Promise<void> {
		this.activeLoginCancellation?.abort();
		if (this.activeContext) {
			await this.activeContext.close().catch(() => undefined);
			this.activeContext = undefined;
		}
		await this.activeLoginPromise?.catch(() => undefined);

		try {
			await vscode.workspace.fs.delete(this.profileUri, { recursive: true, useTrash: false });
		} catch (error) {
			if (!(error instanceof vscode.FileSystemError) || error.code !== "FileNotFound") {
				throw error;
			}
		}
	}

	public dispose(): void {
		this.activeLoginCancellation?.abort();
		this.activeLoginCancellation = undefined;
		this.activeLoginPromise = undefined;
		void this.activeContext?.close().catch(() => undefined);
		this.activeContext = undefined;
	}

	private async launchBrowser(
		serviceSignal: AbortSignal,
		cancellationToken: vscode.CancellationToken,
	): Promise<{ context: BrowserContext; label: string } | undefined> {
		const failures: string[] = [];
		for (const candidate of getBrowserCandidates()) {
			if (serviceSignal.aborted || cancellationToken.isCancellationRequested) {
				return undefined;
			}
			try {
				const context = await this.browserLauncher.launchPersistentContext(this.profileUri.fsPath, {
					headless: false,
					channel: candidate.channel,
					executablePath: candidate.executablePath,
					locale: "zh-CN",
					acceptDownloads: false,
					timeout: 30_000,
				});
				return { context, label: candidate.label };
			} catch (error) {
				if (serviceSignal.aborted || cancellationToken.isCancellationRequested) {
					return undefined;
				}
				failures.push(`${candidate.label}: ${formatError(error)}`);
			}
		}

		throw new Error(
			"无法启动 Chrome 或 Edge。请安装其中一个浏览器，或在设置中指定 zhihu.browserExecutablePath。"
			+ `\n${failures.join("\n")}`,
		);
	}

	private async waitForAuthenticatedCookies(
		browserContext: BrowserContext,
		browser: string,
		validate: CookieValidator,
		cancellationToken: vscode.CancellationToken,
		serviceSignal: AbortSignal,
		isBrowserClosed: () => boolean,
	): Promise<BrowserLoginResult | undefined> {
		const deadline = Date.now() + this.timings.loginTimeoutMs;
		let previousFingerprint = "";
		let previousValidationAt = 0;

		while (!cancellationToken.isCancellationRequested && !serviceSignal.aborted && !isBrowserClosed()) {
			if (Date.now() >= deadline) {
				throw new Error("等待知乎登录超时，请重新执行登录命令");
			}

			try {
				const cookies = toStoredCookies(await browserContext.cookies())
					.filter(cookie => isZhihuCookieDomain(cookie.domain));
				const cookieHeader = createCookieHeader(cookies, SelfProfileAPI);
				const fingerprint = cookieFingerprint(cookies);
				const now = Date.now();
				if (
					cookieHeader
					&& (fingerprint !== previousFingerprint || now - previousValidationAt >= this.timings.validationRetryIntervalMs)
				) {
					previousFingerprint = fingerprint;
					previousValidationAt = now;
					const controller = new AbortController();
					const cancellation = cancellationToken.onCancellationRequested(() => controller.abort());
					const cancelFromService = () => controller.abort();
					serviceSignal.addEventListener("abort", cancelFromService, { once: true });
					try {
						const valid = await validate(cookieHeader, controller.signal);
						if (
							valid
							&& !cancellationToken.isCancellationRequested
							&& !serviceSignal.aborted
							&& !isBrowserClosed()
						) {
							return { browser, cookies };
						}
					} finally {
						cancellation.dispose();
						serviceSignal.removeEventListener("abort", cancelFromService);
					}
				}
			} catch (error) {
				if (isBrowserClosed() || cancellationToken.isCancellationRequested) {
					return undefined;
				}
				Output(`检查知乎登录状态失败：${formatError(error)}`);
			}

			await delay(this.timings.cookiePollIntervalMs, cancellationToken, serviceSignal);
		}

		return undefined;
	}
}

export function toStoredCookies(cookies: readonly Cookie[]): StoredCookie[] {
	return cookies.map(cookie => ({
		name: cookie.name,
		value: cookie.value,
		domain: cookie.domain,
		path: cookie.path,
		expires: cookie.expires,
		httpOnly: cookie.httpOnly,
		secure: cookie.secure,
		sameSite: cookie.sameSite,
	}));
}

function getBrowserCandidates(): BrowserCandidate[] {
	const configuration = vscode.workspace.getConfiguration("zhihu");
	const executablePath = configuration.get<string>("browserExecutablePath", "").trim();
	if (executablePath) {
		return [{ label: path.basename(executablePath), executablePath }];
	}

	const preferredChannel = configuration.get<"auto" | "chrome" | "msedge">("browserChannel", "auto");
	if (preferredChannel !== "auto") {
		return [{ label: preferredChannel === "chrome" ? "Google Chrome" : "Microsoft Edge", channel: preferredChannel }];
	}

	return process.platform === "win32"
		? [
			{ label: "Microsoft Edge", channel: "msedge" },
			{ label: "Google Chrome", channel: "chrome" },
		]
		: [
			{ label: "Google Chrome", channel: "chrome" },
			{ label: "Microsoft Edge", channel: "msedge" },
		];
}

function cookieFingerprint(cookies: readonly StoredCookie[]): string {
	return cookies
		.map(cookie => `${cookie.domain}\u0000${cookie.path}\u0000${cookie.name}\u0000${cookie.value}`)
		.sort()
		.join("\u0001");
}

function isZhihuCookieDomain(domain: string): boolean {
	const normalized = domain.toLowerCase().replace(/^\./, "");
	return normalized === "zhihu.com" || normalized.endsWith(".zhihu.com");
}

function delay(
	milliseconds: number,
	cancellationToken: vscode.CancellationToken,
	serviceSignal?: AbortSignal,
): Promise<void> {
	return new Promise(resolve => {
		let cancellation: vscode.Disposable | undefined;
		const finish = () => {
			clearTimeout(timeout);
			cancellation?.dispose();
			serviceSignal?.removeEventListener("abort", finish);
			resolve();
		};
		const timeout = setTimeout(() => {
			finish();
		}, milliseconds);
		cancellation = cancellationToken.onCancellationRequested(() => {
			finish();
		});
		serviceSignal?.addEventListener("abort", finish, { once: true });
	});
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
