
import { join } from "path";
import * as vscode from "vscode";
import { MediaTypes, SettingEnum } from "../const/ENUM";
import { TemplatePath } from "../const/PATH";
import { ArticlePathReg, QuestionAnswerPathReg, QuestionPathReg, ZhihuPicReg } from "../const/REG";
import { AnswerAPI, AnswerURL, QuestionAPI, ZhuanlanAPI, ZhuanlanURL } from "../const/URL";
import { PostAnswer } from "../model/publish/answer.model";
import { IColumn } from "../model/publish/column.model";
import { IProfile, ITarget, ITopicTarget } from "../model/target/target";
import { CollectionService, ICollectionItem } from "./collection.service";
import { EventService } from "./event.service";
import { HttpService, sendRequest } from "./http.service";
import { ProfileService } from "./profile.service";
import { WebviewService } from "./webview.service";
import * as MarkdownIt from "markdown-it";
import md5 = require("md5");
import { PasteService } from "./paste.service";
import { PipeService } from "./pipe.service";
import { getExtensionPath } from "../global/globa-var";

enum previewActions {
	openInBrowser = '去看看'
}

interface TimeObject {
	hour: number,
	minute: number,

	/**
	 * interval in millisec
	 */
	date: Date
}

export class PublishService {
	public profile: IProfile;

	constructor(
		protected zhihuMdParser: MarkdownIt,
		protected defualtMdParser: MarkdownIt,
		protected webviewService: WebviewService,
		protected collectionService: CollectionService,
		protected eventService: EventService,
		protected profileService: ProfileService,
		protected pasteService: PasteService,
		protected pipeService: PipeService
	) {
		this.registerPublishEvents();
	}

	/**
	 * When extension starts, all publish events should be re-registered,
	 * this is what pre-log tech comes in. 
	 */
	private registerPublishEvents() {
		const events = this.eventService.getEvents();
		events.forEach(e => {
			e.timeoutId = setTimeout(() => {
				this.postArticle(e.content, e.title);
				this.eventService.destroyEvent(e.hash);
			}, e.date.getTime() - Date.now());
		})
	}

	preview(textEdtior: vscode.TextEditor, edit: vscode.TextEditorEdit) {
		let text = textEdtior.document.getText();
		const url: URL = this.shebangParser(text);
		// get rid of shebang line
		if (url) text = text.slice(text.indexOf('\n') + 1);
		const html = this.zhihuMdParser.render(text);
		this.webviewService.renderHtml({
			title: '预览',
			pugTemplatePath: join(getExtensionPath(), TemplatePath, 'pre-publish.pug'),
			pugObjects: {
				title: '答案预览',
				content: html
			},
			showOptions: {
				viewColumn: vscode.ViewColumn.Beside,
				preserveFocus: true
			}
		});
	}

	async publish(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit) {
		const text = textEditor.document.getText();
		// text = text + "\n\n>本文使用 [WPL/s](https://zhuanlan.zhihu.com/p/390528313) 发布 [@GitHub](https://github.com/jks-liu/WPL-s)";

		/// Render markdown

		// Running render on markdown without meta will return meta from the previous run
		// Refer to https://github.com/CaliStyle/markdown-it-meta/issues/5
		(this.zhihuMdParser as any).meta = undefined;
		const tokens = this.zhihuMdParser.parse(text, {});
		// convert local and outer link to zhihu link
		const pipePromise = this.pipeService.sanitizeMdTokens(tokens);
		vscode.window.withProgress({
			location: vscode.ProgressLocation.Window,
			cancellable: false,
			title: '图片上传中...'
		}, (progress, token) => {
			return Promise.resolve(pipePromise);
		})
		await pipePromise;
		const html = this.zhihuMdParser.renderer.render(tokens, {}, {});
		const meta = (this.zhihuMdParser as any).meta;
		console.log(typeof meta, meta, meta.title, meta.title === undefined, meta['zhihu-title']);
	
		/// Parse meta info
		if (meta.title === undefined) {
			vscode.window.showErrorMessage('请输入标题');
			return;
		}

		const title: string = meta.title;
		let titleImage: string|undefined = meta['zhihu-title-image'];
		const url: URL|undefined = meta['zhihu-url'] && new URL(meta['zhihu-url']);
		if (titleImage !== undefined) {
			titleImage = await this.pasteService.uploadImageFromLink(titleImage);
			console.log('titleImage', titleImage);
		}

		/// Post article
		if (url !== undefined) { // If url is provided
			// just publish answer in terms of what shebang indicates
			if (QuestionAnswerPathReg.test(url.pathname)) {
				// Link like https://www.zhihu.com/question/481576477/answer/2085827970
				// answer link, update answer
				const answerId = url.pathname.replace(QuestionAnswerPathReg, '$3');
				if (!this.eventService.registerEvent({
					content: html,
					type: MediaTypes.article,
					date: new Date(),
					hash: md5(html),
					handler: () => {
						this.putAnswer(html, answerId);
						this.eventService.destroyEvent(md5(html));
					}
				})) this.promptSameContentWarn()
			} else if (QuestionPathReg.test(url.pathname)) {
				// Link like https://www.zhihu.com/question/481576477
				// question link, post new answer
				const questionId = url.pathname.replace(QuestionPathReg, '$1');
				if (!this.eventService.registerEvent({
					content: html,
					type: MediaTypes.question,
					date: new Date(),
					hash: md5(html),
					handler: () => {
						this.postAnswer(html, questionId);
						this.eventService.destroyEvent(md5(html));
					}
				})) this.promptSameContentWarn()
			} else if (ArticlePathReg.test(url.pathname)) {
				// Link like https://zhuanlan.zhihu.com/p/390528313
				const articleId = url.pathname.replace(ArticlePathReg, '$1');
				// if (!title) {
				// 	title = await this._getTitle();
				// }
				const column = await this._selectColumn();
				if (!column) {
					vscode.window
				}
				if (!this.eventService.registerEvent({
					content: html,
					type: MediaTypes.question,
					date: new Date(),
					title: title,
					hash: md5(html),
					handler: () => {
						this.putArticle(html, articleId, title, column, titleImage);
						this.eventService.destroyEvent(md5(html));
					}
				})) this.promptSameContentWarn()
			}
		} else { // url is not provided
			const selectFrom: MediaTypes = await vscode.window.showQuickPick<vscode.QuickPickItem & { value: MediaTypes }>(
				[
					{ label: '发布新文章', description: '', value: MediaTypes.article },
					{ label: '从收藏夹中选取', description: '', value: MediaTypes.answer }
				]
			).then(item => item.value);

			if (selectFrom === MediaTypes.article) {
				// user select to publish new article
				// if (!title) {
				// 	title = await this._getTitle();					
				// }
				const column = await this._selectColumn();
				if (!title) return;
				if (!this.eventService.registerEvent({
					content: html,
					type: MediaTypes.article,
					title,
					date: new Date(),
					hash: md5(html + title),
					handler: () => {
						this.postArticle(html, title, column, titleImage);
						this.eventService.destroyEvent(md5(html + title));
					}
				})) this.promptSameContentWarn()
				// else this.promptEventRegistedInfo(timeObject)

			} else if (selectFrom === MediaTypes.answer) {
				// user select from collection
				// shebang not found, then prompt a quick pick to select a question from collections
				const selectedTarget: ICollectionItem | undefined = await vscode.window.showQuickPick<vscode.QuickPickItem & ICollectionItem>(
					this.collectionService.getTargets(MediaTypes.question).then(
						(targets) => targets.map(t => ({ label: t.title ? t.title : t.excerpt, description: t.excerpt, id: t.id, type: t.type }))
					)
				).then(item => (item ? { id: item.id, type: item.type } : undefined));
				if (!selectedTarget) return;
				if (!this.eventService.registerEvent({
					content: html,
					type: MediaTypes.article,
					date: new Date(),
					hash: md5(html),
					handler: () => {
						this.postAnswer(html, selectedTarget.id);
						this.eventService.destroyEvent(md5(html));
					}
				})) this.promptSameContentWarn();
			}
		}
	}

	private removeTitleAndBgFromContent(tokens, openIndex: number, bgIndex: number, html: string) {
		tokens = tokens.filter(this._removeTitleAndBg(openIndex, bgIndex));
		html = this.zhihuMdParser.renderer.render(tokens, {}, {});
		return { tokens, html };
	}

	private _removeTitleAndBg(openIndex: number, bgIndex: number) {
		return (t, i) => Math.abs(openIndex + 1 - i) > 1 && bgIndex != i;
	}

	private promptSameContentWarn() {
		vscode.window.showWarningMessage(`你已经有一篇一模一样的内容还未发布！`);
	}

	private async _getTitle(): Promise<string | undefined> {
		return vscode.window.showInputBox({
			ignoreFocusOut: true,
			prompt: "输入标题：",
			placeHolder: "",
		});
	}

	// private async _getTopics(): Promise<ITopicTarget[] | undefined> {
	// 	topics
	// 	vscode.window.showQuickPick<vscode.QuickPickItem & { value: ITopicTarget }>(
	// 		[{ label: '不发布到专栏', value: undefined }].concat(columns.map(c => ({ label: c.title, value: c }))), 
	// 		{
	// 		ignoreFocusOut: true,
		
	// 		}
	// 	).then(item => item.value);
	// }

	private async _selectColumn(): Promise<IColumn | undefined> {
		const columns = await this.profileService.getColumns();
		if (!columns || columns.length === 0) return;
		return vscode.window.showQuickPick<vscode.QuickPickItem & { value: IColumn }>(
			[{ label: '不发布到专栏', value: undefined }].concat(columns.map(c => ({ label: c.title, value: c }))), 
			{
			ignoreFocusOut: true,
		
			}
		).then(item => item.value);
	}

	public putAnswer(html: string, answerId: string) {
		sendRequest({
			uri: `${AnswerAPI}/${answerId}`,
			method: 'put',
			body: {
				content: html,
				reward_setting: { "can_reward": false, "tagline": "" },
			},
			json: true,
			resolveWithFullResponse: true,
			headers: {},
		}).then(resp => {
			if (resp.statusCode === 200) {
				const newUrl = `${AnswerURL}/${answerId}`;
				this.promptSuccessMsg(newUrl);
				const pane = vscode.window.createWebviewPanel('zhihu', 'zhihu', vscode.ViewColumn.One, { enableScripts: true, enableCommandUris: true, enableFindWidget: true });
				sendRequest({ uri: `${AnswerURL}/${answerId}`, gzip: true }).then(
					resp => {
						pane.webview.html = resp
					}
				);
			} else {
				vscode.window.showWarningMessage(`发布失败！错误代码 ${resp.statusCode}`)
			}
		})
	}

	public postAnswer(html: string, questionId: string) {
		sendRequest({
			uri: `${QuestionAPI}/${questionId}/answers`,
			method: 'post',
			body: new PostAnswer(html),
			json: true,
			resolveWithFullResponse: true,
			headers: {}
		}).then(resp => {
			if (resp.statusCode == 200) {
				const newUrl = `${AnswerURL}/${resp.body.id}`;
				this.promptSuccessMsg(newUrl);
				// const pane = vscode.window.createWebviewPanel('zhihu', 'zhihu', vscode.ViewColumn.One, { enableScripts: true, enableCommandUris: true, enableFindWidget: true });
				// sendRequest({ uri: `${AnswerURL}/${resp.body.id}`, gzip: true }).then(
				// 	resp => {
				// 		pane.webview.html = resp
				// 	}
				// );
				const editor = vscode.window.activeTextEditor;
				const uri = editor.document.uri;
				editor.edit(e => {
					e.replace(editor.document.lineAt(0).range, `#! ${newUrl}\n`)
				})
			} else {
				if (resp.statusCode == 400 || resp.statusCode == 403) {
					vscode.window.showWarningMessage(`发布失败，你已经在该问题下发布过答案，请将头部链接更改为\
					已回答的问题下的链接。`)
				} else {
					vscode.window.showWarningMessage(`发布失败！错误代码 ${resp.statusCode}`)
				}
			}
		})
	}

	public async postArticle(content: string, title?: string, column?: IColumn, titleImage?: string) {
		if (!title) {
			title = await vscode.window.showInputBox({
				ignoreFocusOut: true,
				prompt: "输入文章标题：",
				placeHolder: ""
			})
		}
		if (!title) return;

		const postResp: ITarget = await sendRequest({
			uri: `${ZhuanlanAPI}/drafts`,
			json: true,
			method: 'post',
			body: { "title": "h", "delta_time": 0 },
			headers: {
				'authority': 'zhuanlan.zhihu.com',
				'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4101.0 Safari/537.36 Edg/83.0.474.0',
				'origin': 'https://zhuanlan.zhihu.com',
				'sec-fetch-site': 'same-origin',
				'sec-fetch-mode': 'cors',
				'sec-fetch-dest': 'empty',
				'referer': 'https://zhuanlan.zhihu.com/write',
				'x-requested-with': 'fetch'
			}
		})

		let patchResp = await sendRequest({
			uri: `${ZhuanlanAPI}/${postResp.id}/draft`,
			json: true,
			method: 'patch',
			body: {
				content: content,
				title: title,
				titleImage,
				isTitleImageFullScreen: vscode.workspace.getConfiguration('zhihu').get(SettingEnum.isTitleImageFullScreen)
			},
			headers: {}
		})

		const resp = await sendRequest({
			uri: `${ZhuanlanAPI}/${postResp.id}/publish`,
			json: true,
			method: 'put',
			body: { "column": column, "commentPermission": "anyone" },
			headers: {},
			resolveWithFullResponse: true
		})
		if (resp.statusCode < 300) {
			const editor = vscode.window.activeTextEditor;
			editor.edit(e => {
				e.insert(new vscode.Position(0, 0), `#! ${ZhuanlanURL}${postResp.id}\n`)
			})
			this.promptSuccessMsg(`${ZhuanlanURL}${postResp.id}`, title)
		} else {
			vscode.window.showWarningMessage(`文章发布失败，错误代码${resp.statusCode}`)
		}
		return resp;
	}

	public async putArticle(content: string, articleId: string, title?: string, column?: IColumn, titleImage?: string) {
		if (!title) {
			title = await vscode.window.showInputBox({
				ignoreFocusOut: true,
				prompt: "修改文章标题：",
				placeHolder: ""
			})
		}
		if (!title) return;

		let patchResp = await sendRequest({
			uri: `${ZhuanlanAPI}/${articleId}/draft`,
			json: true,
			method: 'patch',
			body: {
				content: content,
				title: title,
				titleImage,
				isTitleImageFullScreen: vscode.workspace.getConfiguration('zhihu').get(SettingEnum.isTitleImageFullScreen)
			},
			headers: {}
		})

		const resp = await sendRequest({
			uri: `${ZhuanlanAPI}/${articleId}/publish`,
			json: true,
			method: 'put',
			body: { "column": column, "commentPermission": "anyone" },
			headers: {},
			resolveWithFullResponse: true
		})
		if (resp.statusCode < 300) {
			this.promptSuccessMsg(`${ZhuanlanURL}${articleId}`, title)
		} else {
			vscode.window.showWarningMessage(`文章发布失败，错误代码${resp.statusCode}`)
		}
		return resp;
	}

	private promptSuccessMsg(url: string, title?: string) {
		vscode.window.showInformationMessage(`${title ? '"' + title + '"' : ''} 发布成功！\n`, { modal: true },
			previewActions.openInBrowser
		).then(r => r ? vscode.env.openExternal(vscode.Uri.parse(url)) : undefined);
	}

	shebangParser(text: string): URL {
		const shebangRegExp = /#[!！]\s*((https?:\/\/)?(.+))$/i
		let lf = text.indexOf('\n');
		if (lf < 0) lf = text.length;
		let link = text.slice(0, lf);
		link = link.indexOf('\r') > 0 ? link.slice(0, link.length - 1) : link;
		if (!shebangRegExp.test(link)) return undefined;
		const url = new URL(link.replace(shebangRegExp, '$1'));
		if (/^(\w)+\.zhihu\.com$/.test(url.host)) return url;
		else return undefined;
		// shebangRegExp = /(https?:\/\/)/i
	}
}
