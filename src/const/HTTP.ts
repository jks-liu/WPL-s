export const DefaultHTTPHeader = {
	'accept-encoding': 'gzip',
	'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
		'(KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
	'accept': 'application/json, text/plain, */*',
}

export const ZhihuOSSAgent = {
	options: {
		accessKeyId: "",
		accessKeySecret: "",
		stsToken: "",
		bucket: "zhihu-pics",
		endpoint: "zhihu-pics-upload.zhimg.com",
		region: "oss-cn-hangzhou",
		internal: false,
		secure: true,
		cname: true,
	}
};
