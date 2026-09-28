import MarkdownIt from "markdown-it";
import meta from "markdown-it-meta";
import * as vscode from "vscode";
import { SelfProfileAPI } from "./const/URL";
import * as CacheManager from "./global/cache";
import { Output } from "./global/logger";
import { AtPeople, ZhihuCompletionProvider } from "./lang/completion-provider";
import { AccountService } from "./service/account.service";
import { AuthenticateService } from "./service/authenticate.service";
import { BrowserLoginService } from "./service/browser-login.service";
import { CookieService } from "./service/cookie.service";
import { EventService } from "./service/event.service";
import { clearCache, initHttpService } from "./service/http.service";
import { PasteService } from "./service/paste.service";
import { PipeService } from "./service/pipe.service";
import { ProfileService } from "./service/profile.service";
import { PublishService } from "./service/publish.service";
import { showReleaseNote } from "./service/release-note.service";
import { SearchService } from "./service/search.service";
import { WebviewService } from "./service/webview.service";
import { ActionsTreeviewProvider } from "./treeview/actions-treeview-provider";

export function createRuntime(context: vscode.ExtensionContext, actionsProvider: ActionsTreeviewProvider) {
	const cookieService = new CookieService(context.secrets);
	initHttpService(cookieService);

	const zhihuMarkdownPlugin: MarkdownIt.PluginSimple = require("markdown-it-zhihu-common").default;
	const zhihuMdParser = new MarkdownIt({ html: true }).use(zhihuMarkdownPlugin).use(meta);
	const defaultMdParser = new MarkdownIt();
	const accountService = new AccountService();
	const eventService = new EventService();
	const browserLoginService = new BrowserLoginService(context);
	const profileService = new ProfileService(accountService);
	const webviewService = new WebviewService();
	const searchService = new SearchService(webviewService);
	const authenticateService = new AuthenticateService(
		profileService, accountService, cookieService, browserLoginService,
	);
	const pasteService = new PasteService();
	const pipeService = new PipeService(pasteService);
	const publishService = new PublishService(
		zhihuMdParser, defaultMdParser, webviewService, eventService,
		profileService, pasteService, pipeService,
	);

	context.subscriptions.push(
		browserLoginService,
		profileService,
		profileService.onDidChangeProfile(profile => {
			actionsProvider.setProfile(profile);
			void vscode.commands.executeCommand("setContext", "zhihu.authenticated", Boolean(profile));
		}),
		vscode.languages.registerCompletionItemProvider("markdown", new ZhihuCompletionProvider(), "@"),
	);

	// The saved account is checked only after commands and the view have been registered.
	void (async () => {
		if (!await cookieService.getCookieHeader(SelfProfileAPI)) return;
		const profile = await accountService.fetchProfile();
		if (profile && accountService.profile === profile && !profileService.profile) {
			profileService.setProfile(profile);
		}
	})().catch(error => {
		Output(`恢复知乎登录状态失败：${error instanceof Error ? error.message : String(error)}`);
	});

	const releaseNoteTimer = setTimeout(() => {
		void showReleaseNote().catch(error => {
			Output(`无法显示更新说明：${error instanceof Error ? error.message : String(error)}`);
		});
	}, 0);
	context.subscriptions.push({ dispose: () => clearTimeout(releaseNoteTimer) });

	return {
		openWebView: (object: Parameters<WebviewService["openWebview"]>[0]) => webviewService.openWebview(object),
		search: () => searchService.getSearchItems(),
		clearCache: () => {
			clearCache();
			CacheManager.clearCache();
		},
		login: () => authenticateService.login(),
		logout: () => authenticateService.logout(),
		publish: (editor: vscode.TextEditor, edit: vscode.TextEditorEdit, draft: boolean) =>
			publishService.publish(editor, edit, draft),
		uploadImageFromClipboard: () => pasteService.uploadImageFromClipboard(),
		uploadImageFromPath: (uri?: vscode.Uri) => pasteService.uploadImageFromPath(uri),
		uploadImageFromExplorer: () => pasteService.uploadImageFromExplorer(),
		atPeople: () => AtPeople(),
	};
}

export type ExtensionRuntime = ReturnType<typeof createRuntime>;
