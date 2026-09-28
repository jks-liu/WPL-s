/**
 * API for Aliyun OSS File Upload
 */
export const ImageUpload = 'https://api.zhihu.com/images';


/**
 * Image-hosting domain for zhihu
 * `https://pic4.zhimg.com/80/${file_name}_hd.png`
 */
export const ImageHostAPI = 'https://pic4.zhimg.com/80';

/**
 * Get info about myself
 */
export const SelfProfileAPI = 'https://www.zhihu.com/api/v4/me';

/**
 * AnswerAPI = `https://www.zhihu.com/api/v4/answers/${answerId}`
 * Voters = `https://www.zhihu.com/api/v4/answers/${answerId}/voters`
 */
export const AnswerAPI = 'https://www.zhihu.com/api/v4/answers';

/**
 * Answer URL 'https://www.zhihu.com/answers'
 */
export const AnswerURL = 'https://www.zhihu.com/answer';

/**
 * QuestionAPI = 'https://www.zhihu.com/api/v4/questions/${questionId}'
 */
export const QuestionAPI = 'https://www.zhihu.com/api/v4/questions'

/**
 * QuestionURL = 'https://www.zhihu.com/question/${question'
 */
export const QuestionURL = 'https://www.zhihu.com/question'

/**
 * ArticleAPI = 'https://zhuanlan.zhihu.com/api/articles/${articleId}/publish'
 * 
 * `POST` https://zhuanlan.zhihu.com/api/articles/drafts for creation
 * 
 * `PATCH` https://zhuanlan.zhihu.com/api/articles/${articleId}/draft` for patching
 * 
 * `PUT` https://zhuanlan.zhihu.com/api/articles/${articleId}/publish for publishing 
 */

export const ZhuanlanAPI = 'https://zhuanlan.zhihu.com/api/articles';

/**
 * get columns info
 * @param urltoken urlToken of people
 */
export function ColumnAPI(urltoken: string) {
	return `https://www.zhihu.com/api/v4/members/${urltoken}/column-contributions?include=data%5B*%5D.column.intro%2Cfollowers%2Carticles_count&offset=0&limit=20`
}

/**
 * Html Page: 'https://zhuanlan.zhihu.com/p/${articleId}'
 */
export const ZhuanlanURL = 'https://zhuanlan.zhihu.com/p/';

/**
 * ArticleAPI = 'https://www.zhihu.com/api/v4/articles/${articleId}'
 */
export const ArticleAPI = 'https://www.zhihu.com/api/v4/articles'

/**
 * Search All items in Zhihu
 */
export const SearchAPI: string = "https://www.zhihu.com/api/v4/search_v3";

export function AtAutoCompleteURL(token: string): string {
	return encodeURI(`https://www.zhihu.com/people/autocomplete?token=${token}&max_matches=10&use_similar=0`);
}
