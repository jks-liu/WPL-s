import type MarkdownIt from "markdown-it";
import * as vscode from "vscode";
import { setContext } from "./global/globa-var";
import { Output, reportOperationError, showOutput } from "./global/logger";
import type { ExtensionRuntime } from "./runtime";
import { ActionsTreeviewProvider } from "./treeview/actions-treeview-provider";

export function activate(context: vscode.ExtensionContext) {
	setContext(context);
	Output("Extension bootstrap activated");

	const actionsProvider = new ActionsTreeviewProvider();
	let runtimePromise: Promise<ExtensionRuntime> | undefined;

	function initialize(): Promise<ExtensionRuntime> {
		if (!runtimePromise) {
			actionsProvider.setLoading();
			runtimePromise = import("./runtime.js")
				.then(module => module.createRuntime(context, actionsProvider))
				.then(runtime => {
					actionsProvider.setReady();
					Output("Extension services ready");
					return runtime;
				})
				.catch(error => {
					runtimePromise = undefined;
					const message = error instanceof Error ? error.message : String(error);
					actionsProvider.setError(message);
					Output(`知乎扩展初始化失败：${error instanceof Error ? error.stack ?? error.message : String(error)}`);
					void vscode.window.showErrorMessage(`知乎扩展初始化失败：${message}`, "查看日志", "重试")
						.then(action => {
							if (action === "查看日志") showOutput();
							if (action === "重试") void initialize().catch(() => undefined);
						});
					throw error;
				});
		}
		return runtimePromise;
	}

	async function withRuntime<T>(operation: string, action: (runtime: ExtensionRuntime) => T): Promise<T | undefined> {
		const runtime = await initialize().catch(() => undefined);
		if (!runtime) return undefined;
		try {
			return await action(runtime);
		} catch (error) {
			reportOperationError(operation, error);
			return undefined;
		}
	}

	context.subscriptions.push(
		actionsProvider,
		vscode.window.registerTreeDataProvider("zhihu-actions", actionsProvider),
		vscode.commands.registerCommand("zhihu.showLog", () => showOutput()),
		vscode.commands.registerCommand("zhihu.retryInitialization", () => initialize().catch(() => undefined)),
		vscode.commands.registerCommand("zhihu.openWebView", object => withRuntime("打开知乎内容", runtime => runtime.openWebView(object))),
		vscode.commands.registerCommand("zhihu.search", () => withRuntime("搜索知乎", runtime => runtime.search())),
		vscode.commands.registerCommand("zhihu.clearCache", () => withRuntime("清除缓存", runtime => runtime.clearCache())),
		vscode.commands.registerCommand("zhihu.login", () => withRuntime("登录知乎", runtime => runtime.login())),
		vscode.commands.registerCommand("zhihu.logout", () => withRuntime("退出知乎", runtime => runtime.logout())),
		vscode.commands.registerTextEditorCommand("zhihu.publish", (editor, edit) =>
			withRuntime("发布内容", runtime => runtime.publish(editor, edit, false))),
		vscode.commands.registerTextEditorCommand("zhihu.drafts", (editor, edit) =>
			withRuntime("保存草稿", runtime => runtime.publish(editor, edit, true))),
		vscode.commands.registerCommand("zhihu.uploadImageFromClipboard", () =>
			withRuntime("上传剪贴板图片", runtime => runtime.uploadImageFromClipboard())),
		vscode.commands.registerCommand("zhihu.uploadImageFromPath", uri =>
			withRuntime("上传图片", runtime => runtime.uploadImageFromPath(uri))),
		vscode.commands.registerCommand("zhihu.uploadImageFromExplorer", () =>
			withRuntime("上传图片", runtime => runtime.uploadImageFromExplorer())),
		vscode.commands.registerCommand("zhihu.atPeople", () => withRuntime("查找知乎用户", runtime => runtime.atPeople())),
	);
	void vscode.commands.executeCommand("setContext", "zhihu.authenticated", false);

	// Let the view and commands become available before loading the publishing services.
	const initializationTimer = setTimeout(() => {
		void initialize().catch(() => undefined);
	}, 0);
	context.subscriptions.push({ dispose: () => clearTimeout(initializationTimer) });

	return {
		whenReady: () => initialize(),
		extendMarkdownIt(md: MarkdownIt) {
			return md.use(require("@vscode/markdown-it-katex").default);
		},
	};
}
