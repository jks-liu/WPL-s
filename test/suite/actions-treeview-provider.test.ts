import * as assert from "assert";
import * as vscode from "vscode";
import { type IProfile } from "../../src/model/target/target";
import { ActionsTreeviewProvider } from "../../src/treeview/actions-treeview-provider";

suite("Zhihu actions view", () => {
	test("shows initialization and failure states with a retry action", () => {
		const provider = new ActionsTreeviewProvider();
		assert.strictEqual(provider.getChildren()[0].label, "正在初始化知乎扩展…");
		provider.setError("测试错误");
		const items = provider.getChildren();
		assert.strictEqual(items[0].label, "初始化失败");
		assert.strictEqual(items[0].tooltip, "测试错误");
		assert.deepStrictEqual(items.slice(1).map(item => item.command?.command), [
			"zhihu.retryInitialization", "zhihu.showLog",
		]);
		provider.dispose();
	});

	test("shows login and search only when signed out", () => {
		const provider = new ActionsTreeviewProvider();
		provider.setReady();
		const items = provider.getChildren();
		assert.deepStrictEqual(items.map(item => item.command?.command), [
			"zhihu.login", "zhihu.search",
		]);
		assert.ok(items.every(item => item.collapsibleState === vscode.TreeItemCollapsibleState.None));
		assert.deepStrictEqual(provider.getChildren(items[0]), []);
		provider.dispose();
	});

	test("shows the account name and logout only when signed in", () => {
		const provider = new ActionsTreeviewProvider();
		provider.setReady();
		let updates = 0;
		const subscription = provider.onDidChangeTreeData(() => { updates += 1; });
		provider.setProfile({ id: "person-id", name: "测试用户" } as IProfile);
		const items = provider.getChildren();
		assert.strictEqual(items[0].label, "已登录：测试用户");
		assert.strictEqual(items[0].command, undefined);
		assert.deepStrictEqual(items.map(item => item.command?.command), [
			undefined, "zhihu.search", "zhihu.logout",
		]);
		provider.setProfile(undefined);
		assert.deepStrictEqual(provider.getChildren().map(item => item.command?.command), [
			"zhihu.login", "zhihu.search",
		]);
		assert.strictEqual(updates, 2);
		subscription.dispose();
		provider.dispose();
	});
});
