import { SelfProfileAPI } from "../const/URL";
import { IProfile } from "../model/target/target";
import { HttpResponse, sendRequest } from "./http.service";

export class AccountService {
	public profile: IProfile | undefined;
	private fetchGeneration = 0;

	public async fetchProfile(cookie?: string, signal?: AbortSignal): Promise<IProfile | undefined> {
		const generation = ++this.fetchGeneration;
		const response = await sendRequest<IProfile>({
			uri: SelfProfileAPI,
			json: true,
			resolveWithFullResponse: true,
			cookie,
			signal,
		}) as HttpResponse<IProfile> | null;
		const profile = response?.statusCode === 200 && response.body?.id ? response.body : undefined;
		if (generation === this.fetchGeneration) {
			this.profile = profile;
		}
		return profile;
	}

	public async isAuthenticated(): Promise<boolean> {
		return Boolean(await this.fetchProfile());
	}

	public clearProfile(): void {
		this.fetchGeneration += 1;
		this.profile = undefined;
	}
}
