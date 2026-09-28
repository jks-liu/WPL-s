
import * as vscode from "vscode";
import { ColumnAPI } from "../const/URL";
import { IProfile } from "../model/target/target";
import { sendRequest } from "./http.service";
import { AccountService } from "./account.service";
import { IColumn } from "../model/publish/column.model";

export class ProfileService implements vscode.Disposable {
	public profile: IProfile | undefined;
	private readonly changeEmitter = new vscode.EventEmitter<IProfile | undefined>();
	public readonly onDidChangeProfile = this.changeEmitter.event;

	constructor(protected accountService: AccountService) {
	}

	public async fetchProfile(): Promise<void> {
		const profile = await this.accountService.fetchProfile();
		if (profile) this.setProfile(profile);
		else this.clearProfile();
	}

	public setProfile(profile: IProfile): void {
		this.profile = profile;
		this.changeEmitter.fire(profile);
	}

	public clearProfile(): void {
		this.profile = undefined;
		this.changeEmitter.fire(undefined);
	}

	public dispose(): void {
		this.changeEmitter.dispose();
	}

	get name(): string {
		// this.fetchProfile();
		return this.profile ? this.profile.name : undefined;
	}

	get headline(): string {
		return this.profile ? this.profile.headline : undefined;
	}

	get avatarUrl(): string {
		return this.profile ? this.profile.avatar_url : undefined;
	}

	async getColumns(): Promise<IColumn[]> {
		if (this.profile) {
			const response = await sendRequest({
				uri: ColumnAPI(this.profile.url_token),
				json: true,
				method: 'get'
			});
			if (!response || !Array.isArray(response.data)) {
				throw new Error("无法获取知乎专栏列表，请检查网络或重新登录");
			}
			return response.data.map(element => element.column);
		} else {
			vscode.window.showWarningMessage('请先登录！');
			return Promise.resolve(undefined);
		}
	}
}
