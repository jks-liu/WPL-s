
import * as vscode from "vscode";
import { IProfile } from "../model/target/target";
import { PasteService } from "./paste.service";
import { ZhihuPicReg } from "../const/REG";
import Token = require("markdown-it/lib/token");

export class PipeService {
	public profile: IProfile;

	constructor(protected pasteService: PasteService) {
	}

	/**
	 * convert all cors or local resources into under-zhihu resources
	 * @param tokens 
	 */
	public async sanitizeMdTokens(tokens: Token[]): Promise<Token[]> {
		const images = this.findCorsImage(tokens);
		for (const img of images) {
			img.attrs[0][1] = await this.pasteService.uploadImageFromLink(img.attrs[0][1]);
		}

		// Image in zhihu link card
		for (let i = 0; i < tokens.length; i++) {
            if (tokens[i].type === 'inline' && tokens[i].children) {
                const children = tokens[i].children as Token[];
                for (let i = 0; i < children.length; i++) {
					if (children[i].type === 'link_open') {
						const image_path = children[i].attrGet("data-image")
						if (image_path  !== undefined && image_path !== null) {
                        	children[i].attrSet("data-image", await this.pasteService.uploadImageFromLink(image_path));
						}
					}
                }
            }
        }
		return Promise.resolve(tokens);
	}

	private findCorsImage(tokens) {
		let images = [];
		tokens.forEach(t => images = images.concat(this._findCorsImage(t)));
		return images;
	}

	private _findCorsImage(token) {
		let images = [];
		if (token.type == 'image') {
			if (!ZhihuPicReg.test(token.attrs[0][1]))
				images.push(token);
		}
		if (token.children) {
			token.children.forEach(t => images = images.concat(this._findCorsImage(t)))
		}
		return images;
	}

}