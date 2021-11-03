import * as vscode from "vscode";
import { MediaTypes, SettingEnum } from "../const/ENUM";
import { ArticlePathReg, QuestionAnswerPathReg, QuestionPathReg } from "../const/REG";
import { AnswerAPI, AnswerURL, QuestionAPI, ZhuanlanAPI, ZhuanlanURL } from "../const/URL";
import { PostAnswer } from "../model/publish/answer.model";
import { IColumn } from "../model/publish/column.model";
import { IProfile, ITarget } from "../model/target/target";
import { CollectionService, ICollectionItem } from "./collection.service";
import { EventService } from "./event.service";
import { sendRequest } from "./http.service";
import { ProfileService } from "./profile.service";
import { WebviewService } from "./webview.service";
import * as MarkdownIt from "markdown-it";
import md5 = require("md5");
import { PasteService } from "./paste.service";
import { PipeService } from "./pipe.service";

enum previewActions {
	openInBrowser = '去看看'
}

export class PublishService {
	public profile: IProfile;

	constructor(
		protected zhihuMdParser: MarkdownIt,
		protected defaultMdParser: MarkdownIt,
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
				this.zhihuPostNewArticle(e.content, e.title);
				this.eventService.destroyEvent(e.hash);
			}, e.date.getTime() - Date.now());
		})
	}

	private isZhihuArticle(meta: any): boolean {
		const url: URL|undefined = meta['zhihu-url'] && new URL(meta['zhihu-url']);
		if (url === undefined)
			return true;
		
		if (QuestionAnswerPathReg.test(url.pathname) || QuestionPathReg.test(url.pathname))
			return false;

		return true;
	}

	private async renderZhihuMarkdown(textEditor: vscode.TextEditor): Promise<string> {
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
		return this.zhihuMdParser.renderer.render(tokens, {}, {}) + "\n" + this.zhihuMdParser.render("\n\n>本文使用 [WPL/s](https://zhuanlan.zhihu.com/p/390528313) 发布 [@GitHub](https://github.com/jks-liu/WPL-s)");
	}

	private addMeta(textEditor: vscode.TextEditor, key: string, value: string) {
		if (!textEditor.document.lineAt(0).text.startsWith('---'))
			return;

		for (let i = 1; i < textEditor.document.lineCount; ++i) {
			const line = textEditor.document.lineAt(i);
			if (line.text.startsWith(`${key}:`)) {
				textEditor.edit(e => {
					e.replace(line.range, `${key}: ${value}`);
				})
				return;
			}

			// key does not exist, insert it
			if (line.text.startsWith('---')) {
				textEditor.edit(e => {
					e.insert(line.range.start, `${key}: ${value}\n`);
				})
				return;
			}
		}		
	}

	private insertDefaultMeta(textEditor: vscode.TextEditor) {
		const meta_template = `---
title: 请输入标题（若是回答的话，请删除本行）
zhihu-url: 请输入知乎链接（删除本行发表新的知乎专栏文章）
zhihu-title-image: 请输入专栏文章题图（若无需题图，删除本行）
注意: 所有的冒号是半角冒号，冒号后面有一个半角空格
---
`
		textEditor.edit(e => {
			e.insert(new vscode.Position(0, 0), meta_template);
		})
	}


	async publish(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, draft: boolean) {	
		const html = await this.renderZhihuMarkdown(textEditor);
		const meta = (this.zhihuMdParser as any).meta;
	
		/// Parse meta info
		if (meta === undefined) {
			vscode.window.showErrorMessage('WPL/s 使用元数据，请查看文档并添加元数据');
			this.insertDefaultMeta(textEditor);
			return;
		}

		let title: string|undefined = meta.title;
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
						this.zhihuPostExistingAnswer(html, answerId);
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
						this.zhihuPostNewAnswer(html, questionId);
						this.eventService.destroyEvent(md5(html));
					}
				})) this.promptSameContentWarn()
			} else if (ArticlePathReg.test(url.pathname)) {
				// Link like https://zhuanlan.zhihu.com/p/390528313
				const articleId = url.pathname.replace(ArticlePathReg, '$1');
				if (!title) {
					title = await this._getTitle();
					if (title) {
						this.addMeta(textEditor, 'title', title);
					} else {
						vscode.window.showErrorMessage('标题不对，中止');
						return;
					}
				}
				const column = await this._selectColumn();
				if (!this.eventService.registerEvent({
					content: html,
					type: MediaTypes.question,
					date: new Date(),
					title: title,
					hash: md5(html),
					handler: () => {
						this.zhihuPostExistingArticle(html, articleId, title, column, titleImage, draft);
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
				if (!title) {
					title = await this._getTitle();
					if (title) {
						this.addMeta(textEditor, 'title', title);
					} else {
						vscode.window.showErrorMessage('标题不对，中止');
						return;
					}
				}
				const column = await this._selectColumn();
				if (!title) return;
				if (!this.eventService.registerEvent({
					content: html,
					type: MediaTypes.article,
					title,
					date: new Date(),
					hash: md5(html + title),
					handler: () => {
						this.zhihuPostNewArticle(html, title, column, titleImage, draft);
						this.eventService.destroyEvent(md5(html + title));
					}
				})) this.promptSameContentWarn()

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
						this.zhihuPostNewAnswer(html, selectedTarget.id);
						this.eventService.destroyEvent(md5(html));
					}
				})) this.promptSameContentWarn();
			}
		}
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

	public zhihuPostExistingAnswer(html: string, answerId: string) {
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

	public zhihuPostNewAnswer(html: string, questionId: string) {
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
				this.addMeta(vscode.window.activeTextEditor, "zhihu-url", newUrl);
				this.promptSuccessMsg(newUrl);
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

	public async zhihuPostNewArticle(content: string, title: string, column?: IColumn, titleImage?: string, draft: boolean = false) {
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

		let resp = await sendRequest({
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

		if (draft) {
			this.addMeta(vscode.window.activeTextEditor, "zhihu-url", `${ZhuanlanURL}${postResp.id}`);
			this.promptSuccessMsg(`${ZhuanlanURL}${postResp.id}/edit`, `Draft: ${title}`)
			return resp;
		}

		resp = await sendRequest({
			uri: `${ZhuanlanAPI}/${postResp.id}/publish`,
			json: true,
			method: 'put',
			body: { "column": column, "commentPermission": "anyone" },
			headers: {},
			resolveWithFullResponse: true
		})
		if (resp.statusCode < 300) {
			this.addMeta(vscode.window.activeTextEditor, "zhihu-url", `${ZhuanlanURL}${postResp.id}`);
			this.promptSuccessMsg(`${ZhuanlanURL}${postResp.id}`, title)
		} else {
			vscode.window.showWarningMessage(`文章发布失败，错误代码${resp.statusCode}`)
		}
		return resp;
	}

	public async zhihuPostExistingArticle(content: string, articleId: string, title: string, column?: IColumn, titleImage?: string, draft: boolean = false) {
		let resp = await sendRequest({
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

		if (draft) {
			this.promptSuccessMsg(`${ZhuanlanURL}${articleId}/edit`, `Draft: ${title}`)
			return resp;
		}

		resp = await sendRequest({
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
