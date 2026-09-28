
import * as path from "path";
import { compileFile } from "pug";
import * as vscode from "vscode";
import { MediaTypes, SettingEnum, WebviewEvents } from "../const/ENUM";
import { TemplatePath, ZhihuIconPath } from "../const/PATH";
import { AnswerAPI, AnswerURL, QuestionAPI, QuestionURL, ZhuanlanURL, ArticleAPI } from "../const/URL";
import { IArticle } from "../model/article/article-detail";
import { IQuestionAnswerTarget, IQuestionTarget, ITarget } from "../model/target/target";
import { sendRequest } from "./http.service";
import { getExtensionPath, getSubscriptions } from "../global/globa-var";

export interface IWebviewPugRender {
	viewType?: string,
	title?: string,
	showOptions?: vscode.ViewColumn | { viewColumn: vscode.ViewColumn, preserveFocus?: boolean },
	options?: vscode.WebviewOptions & vscode.WebviewPanelOptions,
	pugTemplatePath: string,
	pugObjects?: any,
	iconPath?: any
}

export class WebviewService {

	/**
	 * Create and show a webview provided by pug
	 */
	public renderHtml(w: IWebviewPugRender, panel?: vscode.WebviewPanel): vscode.WebviewPanel {
		if (panel == undefined) {
			panel = vscode.window.createWebviewPanel(
				w.viewType ? w.viewType : 'zhihu',
				w.title ? w.title : '知乎',
				w.showOptions ? w.showOptions : vscode.ViewColumn.One,
				w.options ? w.options : { enableScripts: true }
			);
		}
		const compiledFunction = compileFile(
			w.pugTemplatePath
		);
		panel.iconPath = vscode.Uri.file(w.iconPath ? w.iconPath : path.join(
			getExtensionPath(),
			ZhihuIconPath));
		panel.webview.html = compiledFunction(w.pugObjects);
		return panel;
	}

	public async openWebview(object: ITarget & any) {
		if (object.type == MediaTypes.question) {

			const includeContent = "data[*].is_normal,content,voteup_count;";
			let offset = 0;
			let questionAPI = `${QuestionAPI}/${object.id}?include=detail%2cexcerpt`;
			let answerAPI = `${QuestionAPI}/${object.id}/answers?include=${includeContent}?offset=${offset}`;
			let question: IQuestionTarget = await sendRequest({
				uri: questionAPI,
				json: true,
			});
			let body: { data: IQuestionAnswerTarget[] } = await sendRequest({
				uri: answerAPI,
				json: true,
			});
			let useVSTheme = vscode.workspace.getConfiguration('zhihu').get(SettingEnum.useVSTheme);

			let panel = this.renderHtml({
				title: "知乎问题",
				pugTemplatePath: path.join(
					getExtensionPath(),
					TemplatePath,
					"questions-answers.pug"
				),
				pugObjects: {
					answers: body.data.map(t => {  
						t.content = this.actualSrcNormalize(t.content);
						return t;
					}),
					title: question.title,
					subTitle: question.detail,
					useVSTheme: useVSTheme
				}
			})
			this.registerEvent(panel, `${QuestionURL}/${question.id}`);
		} else if (object.type == MediaTypes.answer) {
			let body: IQuestionAnswerTarget = await sendRequest({
				uri: `${AnswerAPI}/${object.id}?include=data[*].content,excerpt,voteup_count`,
				json: true,
			})
			let useVSTheme = vscode.workspace.getConfiguration('zhihu').get(SettingEnum.useVSTheme);
			body.content = this.actualSrcNormalize(body.content);
			let panel = this.renderHtml({
				title: "知乎回答",
				pugTemplatePath: path.join(
					getExtensionPath(),
					TemplatePath,
					"questions-answers.pug"
				),
				pugObjects: {
					answers: [
						body
					],
					title: object.question.name,
					useVSTheme
				}
			})
			this.registerEvent(panel, `${AnswerURL}/${body.id}`)
		} else if (object.type == MediaTypes.article) {
			let article: IArticle = await sendRequest({
				uri: `${object.url}?include=voteup_count`,
				json: true,
				headers: null
			});
			let useVSTheme = vscode.workspace.getConfiguration('zhihu').get(SettingEnum.useVSTheme);
			article.content = this.actualSrcNormalize(article.content);
			let panel = this.renderHtml({
				title: "知乎文章",
				pugTemplatePath: path.join(
					getExtensionPath(),
					TemplatePath,
					"article.pug"
				),
				pugObjects: {
					article: article,
					title: article.title,
					useVSTheme
				}
			})
			this.registerEvent(panel, `${ZhuanlanURL}${article.id}`)
		}
	}

	private registerEvent(panel: vscode.WebviewPanel, link?: string) {
		panel.webview.onDidReceiveMessage(e => {
			if (e.command == WebviewEvents.open) {
				vscode.env.openExternal(vscode.Uri.parse(link));
			} else if (e.command == WebviewEvents.share) {
				vscode.env.clipboard.writeText(link).then(() => {
					vscode.window.showInformationMessage('链接已复制至粘贴板。');
				})
			} else if (e.command == WebviewEvents.upvoteAnswer) {
				sendRequest({
					uri: `${AnswerAPI}/${e.id}/voters`,
					method: 'post',
					headers: {},
					json: true,
					body: { type: "up" },
					resolveWithFullResponse: true
				}).then(r => {if(r.statusCode == 200) vscode.window.showInformationMessage('点赞成功！')
				else if(r.statusCode == 403) vscode.window.showWarningMessage('你已经投过票了！')})
			} else if (e.command == WebviewEvents.upvoteArticle) {
				sendRequest({
					uri: `${ArticleAPI}/${e.id}/voters`,
					method: 'post',
					headers: {},
					json: true,
					body: { voting: 1 },
					resolveWithFullResponse: true
				}).then(r => { if(r.statusCode == 200) vscode.window.showInformationMessage('点赞成功！')
					else if(r.statusCode == 403) vscode.window.showWarningMessage('你已经投过票了！');
				})
			}
		}, undefined, getSubscriptions())
	}

	private actualSrcNormalize(html: string): string {
		return html.replace(/<\/?noscript>/g, '');
	}
}
