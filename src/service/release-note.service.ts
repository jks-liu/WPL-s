
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { ReleaseNotesPath } from "../const/PATH";
import { getGlobalState, getExtensionPath } from "../global/globa-var";

export async function showReleaseNote(): Promise<void> {
	let fileNames: string[] = fs.readdirSync(path.join(getExtensionPath(), ReleaseNotesPath))
	let mdFileReg = /^(\d)\.(\d)\.(\d)\.md$/;
	let latestVer = fileNames.filter(name => mdFileReg.test(name)).reduce((prev, curr) => {
		return curr > prev ? curr : prev;
	}, "");
	if (!latestVer) return;
	let usrLatestVer = getGlobalState().get('latestVersion');
	if (!usrLatestVer || usrLatestVer < latestVer) {
		await vscode.commands.executeCommand("markdown.showPreview", vscode.Uri.file(path.join(
			getExtensionPath(), ReleaseNotesPath, latestVer
		)), null, {
			sideBySide: false,
			locked: true
		});
		await getGlobalState().update('latestVersion', latestVer);
	}
}

