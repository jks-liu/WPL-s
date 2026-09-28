import * as vscode from "vscode";
import { Output } from "../global/logger";
import { type IProfile } from "../model/target/target";
import { type BrowserLogin } from "./browser-login.service";
import { type CookieStore } from "./cookie.service";
import { clearCache } from "./http.service";

interface AccountStore {
	fetchProfile(cookie?: string, signal?: AbortSignal): Promise<IProfile | undefined>;
	clearProfile(): void;
}

interface ProfileStore {
	setProfile(profile: IProfile): void;
	clearProfile(): void;
}

export interface AuthenticationUI {
	runLogin<T>(
		task: (
			progress: vscode.Progress<{ message?: string }>,
			cancellationToken: vscode.CancellationToken,
		) => Promise<T>,
	): Promise<T>;
	showInformationMessage(message: string): void;
	showWarningMessage(message: string): void;
	showErrorMessage(message: string): void;
}

const defaultAuthenticationUI: AuthenticationUI = {
	runLogin: task => Promise.resolve(vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: "登录知乎",
			cancellable: true,
		},
		task,
	)),
	showInformationMessage: message => { void vscode.window.showInformationMessage(message); },
	showWarningMessage: message => { void vscode.window.showWarningMessage(message); },
	showErrorMessage: message => { void vscode.window.showErrorMessage(message); },
};

export class AuthenticateService {
	constructor(
		private readonly profileService: ProfileStore,
		private readonly accountService: AccountStore,
		private readonly cookieService: CookieStore,
		private readonly browserLoginService: BrowserLogin,
		private readonly ui: AuthenticationUI = defaultAuthenticationUI,
	) {}

	public async logout(): Promise<void> {
		const results = await Promise.allSettled([
			this.cookieService.clearCookie(),
			this.browserLoginService.clearProfile(),
		]);

		clearCache();
		this.accountService.clearProfile();
		this.profileService.clearProfile();

		const failure = results.find(result => result.status === "rejected");
		if (failure?.status === "rejected") {
			Output(`清除知乎登录数据失败：${formatError(failure.reason)}`);
			this.ui.showWarningMessage("已退出当前会话，但部分专属浏览器数据未能删除。");
			return;
		}
		this.ui.showInformationMessage("已退出知乎登录并清除专属浏览器数据。");
	}

	public async login(): Promise<void> {
		const currentProfile = await this.accountService.fetchProfile();
		if (currentProfile) {
			this.finishLogin(currentProfile, "已保存的登录状态");
			return;
		}

		await this.cookieService.clearCookie();
		let authenticatedProfile: IProfile | undefined;

		try {
			const browserLogin = await this.ui.runLogin(
				async (progress, cancellationToken) => this.browserLoginService.login(
					async (cookieHeader, signal) => {
						authenticatedProfile = await this.accountService.fetchProfile(cookieHeader, signal);
						return Boolean(authenticatedProfile);
					},
					cancellationToken,
					progress,
				),
			);

			if (!browserLogin || !authenticatedProfile) {
				this.ui.showInformationMessage("知乎登录已取消。");
				return;
			}

			await this.cookieService.storeCookies(browserLogin.cookies);
			this.finishLogin(authenticatedProfile, browserLogin.browser);
		} catch (error) {
			const message = formatError(error);
			Output(`知乎登录失败：${message}`);
			this.ui.showErrorMessage(`知乎登录失败：${message}`);
		}
	}

	private finishLogin(profile: IProfile, source: string): void {
		clearCache();
		this.profileService.setProfile(profile);
		Output(`知乎登录成功（${source}）：${profile.name}`);
		this.ui.showInformationMessage(`你好，${profile.name}`);
	}
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
