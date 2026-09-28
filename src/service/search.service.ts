import * as vscode from "vscode";
import { SearchTypes } from "../const/ENUM";
import { SearchAPI } from "../const/URL";
import { ISearchItem, ISearchResults } from "../model/search-results";
import { removeHtmlTag } from "../util/md-html-utils";
import { sendRequest } from "./http.service";
import { WebviewService } from "./webview.service";

export const SearchDict = [
	{ value: SearchTypes.general, ch: "综合" },
	{ value: SearchTypes.question, ch: "问题" },
];

export class SearchService {
	constructor(private readonly webviewService: WebviewService) {}

	public async getSearchResults(keyword: string, searchType: string): Promise<ISearchItem[]> {
		const query = new URLSearchParams({
			t: searchType,
			q: keyword,
			offset: "0",
			limit: "10",
		});
		const result = await sendRequest<ISearchResults>({
			uri: `${SearchAPI}?${query}`,
			json: true,
		});
		if (!result || !Array.isArray(result.data)) {
			throw new Error("知乎搜索请求失败，请检查网络连接");
		}
		return result.data.filter(item => item.type === "search_result");
	}

	public async getSearchItems(): Promise<void> {
		const selectedSearchType = await vscode.window.showQuickPick<vscode.QuickPickItem & { value: string }>(
			SearchDict.map(type => ({ value: type.value, label: type.ch, description: "" })),
			{ placeHolder: "你要搜什么?" },
		).then(item => item?.value);
		if (!selectedSearchType) {
			return;
		}

		const keyword = await vscode.window.showInputBox({
			ignoreFocusOut: true,
			prompt: "输入关键字, 搜索知乎内容",
		});
		if (!keyword) {
			return;
		}

		const searchResults = await this.getSearchResults(keyword, selectedSearchType);
		const selectedItem = await vscode.window.showQuickPick<vscode.QuickPickItem & { value: ISearchItem }>(
			searchResults.map(item => ({
				value: item,
				label: removeHtmlTag(item.highlight.title),
				description: removeHtmlTag(item.highlight.description),
			})),
			{ placeHolder: "选择你想要的结果:" },
		).then(item => item?.value);
		if (selectedItem) {
			await this.webviewService.openWebview(selectedItem.object);
		}
	}
}
