import * as vscode from "vscode";
import { MediaTypes, SettingEnum } from "../const/ENUM";
import { ArticlePathReg, QuestionAnswerPathReg, QuestionPathReg } from "../const/REG";
import { AnswerAPI, AnswerURL, QuestionAPI, QuestionURL, ZhuanlanAPI, ZhuanlanURL } from "../const/URL";
import { PostAnswer } from "../model/publish/answer.model";
import { IColumn } from "../model/publish/column.model";
import { IProfile, ITarget } from "../model/target/target";
import { EventService } from "./event.service";
import { sendRequest } from "./http.service";
import { ProfileService } from "./profile.service";
import { WebviewService } from "./webview.service";
import MarkdownIt from "markdown-it";
import md5 from "md5";
import { PasteService } from "./paste.service";
import { PipeService } from "./pipe.service";
import { reportOperationError } from "../global/logger";

enum previewActions {
	openInBrowser = '去看看'
}

export class PublishService {
	public profile: IProfile;

	constructor(
		protected zhihuMdParser: MarkdownIt,
		protected defaultMdParser: MarkdownIt,
		protected webviewService: WebviewService,
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
				void this.completeQueuedPublish(e.hash, "恢复发布任务", () =>
					this.zhihuPostNewArticle(e.content, e.title, [])); // FIXME: tags
			}, e.date.getTime() - Date.now());
		})
	}

	private async completeQueuedPublish(hash: string, operation: string, task: () => Promise<unknown>): Promise<void> {
		try {
			await task();
		} catch (error) {
			reportOperationError(operation, error);
		} finally {
			try {
				this.eventService.destroyEvent(hash);
			} catch (error) {
				reportOperationError("更新发布任务记录", error);
			}
		}
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
		}, () => {
			return Promise.resolve(pipePromise);
		})
		await pipePromise;
		return this.zhihuMdParser.renderer.render(tokens, this.zhihuMdParser.options, {}) + "\n" + this.zhihuMdParser.render("\n\n>本文使用 [WPL/s](https://zhuanlan.zhihu.com/p/390528313) 发布 [@GitHub](https://github.com/jks-liu/WPL-s)");
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
zhihu-tags: tag1, tag 2, tag-3, 标签4, 标签以半角逗号分隔, 只有知乎已经存在的标签才能添加成功
注意: 所有的冒号是半角冒号，冒号后面有一个半角空格
---
`
		textEditor.edit(e => {
			e.insert(new vscode.Position(0, 0), meta_template);
		})
	}

	private async getQuestionIdOfAnswer(url: string): Promise<string> {	
		return sendRequest({
			uri: url,
			method: 'get',
			resolveWithFullResponse: true,
			headers: {},
		}).then(resp => resp.request.href.match(/(\/question\/(\d+))?\/answer\/(\d+)$/i)[2]);
	}


	async publish(textEditor: vscode.TextEditor, _edit: vscode.TextEditorEdit, draft: boolean) {
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
		const articleTags: string[] = meta['zhihu-tags'] ? meta['zhihu-tags'].split(',').map((x: string)=>x.trim()) : [];

		/// Post article
		if (url !== undefined) { // If url is provided
			// just publish answer in terms of what shebang indicates
			if (QuestionAnswerPathReg.test(url.pathname)) {
				// Link like https://www.zhihu.com/question/481576477/answer/2085827970
				// or https://www.zhihu.com/answer/2085827970
				// answer link, update answer
				const answerId = url.pathname.replace(QuestionAnswerPathReg, '$3');
				let questionId = url.pathname.replace(QuestionAnswerPathReg, '$2');
				if (questionId === "") {
					questionId = await this.getQuestionIdOfAnswer(url.href);
				}
				console.log('questionId', questionId, 'answerId', answerId);
				if (!this.eventService.registerEvent({
					content: html,
					type: MediaTypes.article,
					date: new Date(),
					hash: md5(html),
					handler: () => {
						return this.completeQueuedPublish(md5(html), draft ? "保存回答草稿" : "发布回答", () =>
							this.zhihuPostExistingAnswer(html, questionId, answerId, draft));
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
						return this.completeQueuedPublish(md5(html), draft ? "保存回答草稿" : "发布回答", () =>
							this.zhihuPostNewAnswer(html, questionId, draft));
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
						return this.completeQueuedPublish(md5(html), draft ? "保存文章草稿" : "发布文章", () =>
							this.zhihuPostExistingArticle(html, articleId, title, articleTags, column, titleImage, draft));
					}
				})) this.promptSameContentWarn()
			}
		} else { // url is not provided: publish a new article
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
						return this.completeQueuedPublish(md5(html + title), draft ? "保存文章草稿" : "发布文章", () =>
							this.zhihuPostNewArticle(html, title, articleTags, column, titleImage, draft));
					}
				})) this.promptSameContentWarn()
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

	public async zhihuPostExistingAnswer(html: string, questionId:string,  answerId: string, draft: boolean): Promise<void> {
		// No matter draft or not, new answer use post, existing answer use put
		const url = draft ? `${QuestionAPI}/${questionId}/draft` : `${AnswerAPI}/${answerId}`

		const resp = await sendRequest({
			uri: url,
			method: 'put',
			body: {
				content: html,
				reward_setting: { "can_reward": false, "tagline": "" },
			},
			json: true,
			resolveWithFullResponse: true,
			headers: {},
		});
		if (!resp) throw new Error("回答请求失败，请检查网络连接");
		if (resp.statusCode !== 200) throw requestStatusError("回答请求", resp.statusCode);
		if (draft) {
			this.promptSuccessMsg(`${AnswerURL}/${answerId}#draft`);
			return;
		}
		this.promptSuccessMsg(`${AnswerURL}/${answerId}`);
		const pane = vscode.window.createWebviewPanel('zhihu', 'zhihu', vscode.ViewColumn.One, { enableScripts: true, enableCommandUris: true, enableFindWidget: true });
		void sendRequest<string>({ uri: `${AnswerURL}/${answerId}` }).then(content => {
			if (content) pane.webview.html = content;
			else reportOperationError("预览已发布回答", new Error("页面加载失败，请检查网络连接"));
		});
	}

	public async zhihuPostNewAnswer(html: string, questionId: string, draft: boolean): Promise<void> {
		// No matter draft or not, new answer use post, existing answer use put
		const url = draft ? `${QuestionAPI}/${questionId}/draft` : `${QuestionAPI}/${questionId}/answers`

		const resp = await sendRequest({
			uri: url,
			method: 'post',
			body: new PostAnswer(html),
			json: true,
			resolveWithFullResponse: true,
			headers: {}
		});
		if (!resp) throw new Error("回答请求失败，请检查网络连接");
		if (resp.statusCode === 400 || resp.statusCode === 403) {
			throw new Error(`回答请求被拒绝（HTTP ${resp.statusCode}）；如果已回答该问题，请在 zhihu-url 中填写已有回答链接`);
		}
		if (resp.statusCode !== 200) throw requestStatusError("回答请求", resp.statusCode);
		if (draft) {
			this.promptSuccessMsg(`${QuestionURL}/${questionId}#draft`);
			return;
		}
		const newUrl = `${AnswerURL}/${resp.body.id}`;
		this.addMeta(vscode.window.activeTextEditor, "zhihu-url", newUrl);
		this.promptSuccessMsg(newUrl);
	}

	private async zhihuArticleUpdateTags(articleId: string, tags: string[]) {
		// 1. Get topics (i.e. tags)
		const resp = await sendRequest({
			uri: `${ZhuanlanAPI}/${articleId}/draft`,
			json: true,
			method: 'get',
			headers: {}
		})
		if (!resp || !Array.isArray(resp.topics)) {
			throw new Error("无法读取文章标签，请检查网络或登录状态");
		}
		const currentTopics = resp.topics;
		console.log("Current topics: ", currentTopics.map(t => t.name));
		
		// 2. Delete topics which are not in the new tags
		await Promise.all(currentTopics.map(async topic => {
			if (!tags.map(x => x.toLowerCase()).includes(topic.name.toLowerCase())) {
				await sendRequest({
					uri: `${ZhuanlanAPI}/${articleId}/topics/${topic.id}`,
					method: 'delete',
					headers: {}
				})
				console.log(`Deleted topic ${topic.name}`);
			}
		}))

		// 3. Add new topics
		await Promise.all(tags.map(async tag => {
			if (!currentTopics.find(t => t.name.toLowerCase() == tag.toLowerCase())) {
				// 3.1 get info of tag
				const topicResp = await sendRequest({
					uri: `https://zhuanlan.zhihu.com/api/autocomplete/topics?token=${encodeURI(tag)}&max_matches=2&use_similar=0&topic_filter=1`,
					json: true,
					method: 'get',
					headers: {},
				})
				if (!Array.isArray(topicResp)) throw new Error(`无法查询标签「${tag}」`);
				if (topicResp.length>0 && topicResp[0].name.toLowerCase() == tag.toLowerCase()) {
					// 3.2 add tag
					await sendRequest({
						uri: `${ZhuanlanAPI}/${articleId}/topics`,
						method: 'post',
						body: topicResp[0],
						headers: {},
						json: true
					})
					console.log(`Added topic ${tag}`);
				} else {
					console.log(`Cannot find topic ${tag}`);
				}
			}
		}))
	}

	public async zhihuPostNewArticle(content: string, title: string, tags: string[],
		column?: IColumn, titleImage?: string, draft: boolean = false) {
		const created = await sendRequest<ITarget>({
			uri: `${ZhuanlanAPI}/drafts`,
			json: true,
			method: 'post',
			resolveWithFullResponse: true,
			body: { "title": "h", "delta_time": 0 },
			headers: {
				'origin': 'https://zhuanlan.zhihu.com',
				'referer': 'https://zhuanlan.zhihu.com/write',
				'x-requested-with': 'fetch'
			}
		})
		if (!created) throw new Error("创建文章草稿请求失败，请检查网络连接");
		if (created.statusCode >= 300 || !created.body?.id) {
			throw requestStatusError("创建文章草稿", created.statusCode);
		}
		const postResp = created.body;

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
			headers: {},
			resolveWithFullResponse: true,
		})
		if (!resp) throw new Error("保存文章内容请求失败，请检查网络连接");
		if (resp.statusCode >= 300) throw requestStatusError("保存文章内容", resp.statusCode);

		void this.zhihuArticleUpdateTags(`${postResp.id}`, tags)
			.catch(error => reportOperationError("更新文章标签", error));

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
		if (!resp) throw new Error("发布文章请求失败，请检查网络连接");
		if (resp.statusCode >= 300) throw requestStatusError("发布文章", resp.statusCode);
		this.addMeta(vscode.window.activeTextEditor, "zhihu-url", `${ZhuanlanURL}${postResp.id}`);
		this.promptSuccessMsg(`${ZhuanlanURL}${postResp.id}`, title)
		return resp;
	}

	public async zhihuPostExistingArticle(content: string, articleId: string, title: string, tags: string[],
			column?: IColumn, titleImage?: string, draft: boolean = false) {
		void this.zhihuArticleUpdateTags(articleId, tags)
			.catch(error => reportOperationError("更新文章标签", error));

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
			headers: {},
			resolveWithFullResponse: true,
		})
		if (!resp) throw new Error("保存文章内容请求失败，请检查网络连接");
		if (resp.statusCode >= 300) throw requestStatusError("保存文章内容", resp.statusCode);

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
		if (!resp) throw new Error("发布文章请求失败，请检查网络连接");
		if (resp.statusCode >= 300) throw requestStatusError("发布文章", resp.statusCode);
		this.promptSuccessMsg(`${ZhuanlanURL}${articleId}`, title)
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

function requestStatusError(operation: string, statusCode: number): Error {
	const hint = statusCode === 401 || statusCode === 403
		? "，登录可能已失效，请重新登录"
		: "";
	return new Error(`${operation}失败（HTTP ${statusCode}${hint}）`);
}
