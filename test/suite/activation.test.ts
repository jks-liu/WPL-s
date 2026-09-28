import * as assert from "assert";
import * as vscode from "vscode";
import MarkdownIt from "markdown-it";

suite("Extension activation", () => {
	test("activates when the Zhihu activity bar is opened", async function () {
		this.timeout(10000);
		const extension = vscode.extensions.getExtension("jks-liu.wpls");
		assert.ok(extension);
		await vscode.commands.executeCommand("workbench.view.extension.zhihu-explorer");
		await vscode.commands.executeCommand("zhihu-actions.focus");
		for (let attempt = 0; attempt < 20 && !extension.isActive; attempt++) {
			await new Promise(resolve => setTimeout(resolve, 100));
		}
		assert.strictEqual(extension.isActive, true, "opening the view must activate WPL/s");
		assert.ok((await vscode.commands.getCommands(true)).includes("zhihu.login"));
	});

	test("registers writing and login commands without loading removed views", async function () {
		this.timeout(10000);
		const extension = vscode.extensions.getExtension("jks-liu.wpls");
		assert.ok(extension, "the extension must be available in the test host");
		await extension.activate();
		assert.strictEqual(extension.isActive, true);
		const contributions = extension.packageJSON.contributes;
		assert.ok(contributions.viewsContainers.activitybar.some((container: { id: string }) =>
			container.id === "zhihu-explorer"));
		assert.deepStrictEqual(
			contributions.views["zhihu-explorer"].map((view: { id: string }) => view.id),
			["zhihu-actions"],
		);
		assert.deepStrictEqual(
			contributions.menus["view/title"].map((item: { command: string }) => item.command),
			["zhihu.login", "zhihu.search", "zhihu.logout"],
		);
		assert.deepStrictEqual(
			contributions.menus["view/title"].map((item: { when: string }) => item.when),
			[
				"view == zhihu-actions && !zhihu.authenticated",
				"view == zhihu-actions",
				"view == zhihu-actions && zhihu.authenticated",
			],
		);

		const commands = await vscode.commands.getCommands(true);
		for (const command of ["zhihu.login", "zhihu.logout", "zhihu.publish", "zhihu.drafts"]) {
			assert.ok(commands.includes(command), `${command} must be registered`);
		}
		for (const command of ["zhihu.refreshFeed", "zhihu.refreshHotstories", "zhihu.refreshCollection"]) {
			assert.ok(!commands.includes(command), `${command} must be removed`);
		}
	});

	test("extends Markdown preview with KaTeX", async function () {
		this.timeout(10000);
		const extension = vscode.extensions.getExtension("jks-liu.wpls");
		assert.ok(extension);
		const api = await extension.activate() as { extendMarkdownIt(md: MarkdownIt): MarkdownIt };
		const markdown = new MarkdownIt();
		assert.strictEqual(api.extendMarkdownIt(markdown), markdown);
		assert.match(markdown.render("$x$"), /katex/);
	});

	test("loads publishing services after bootstrap", async function () {
		this.timeout(10000);
		const extension = vscode.extensions.getExtension("jks-liu.wpls");
		assert.ok(extension);
		const api = await extension.activate() as { whenReady(): Promise<unknown> };
		assert.ok(await api.whenReady());
		assert.ok((await vscode.commands.getCommands(true)).includes("zhihu.retryInitialization"));
	});
});
