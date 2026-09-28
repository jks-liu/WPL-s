import MarkdownIt from "markdown-it";
import * as assert from 'assert';
import markdown_it_zhihu from "markdown-it-zhihu-common";
import { readFileSync } from "fs";
import { fixturePath } from "./test-support";
import { join } from "path";

const samplesPath = join(fixturePath, 'publishTest');

suite('Markdown Parser Test', () => {
    const zhihuMdParser = new MarkdownIt({ html: true }).use(markdown_it_zhihu);
	// Dependency Injection

	test('parse test', () => {
        let testMd = readFileSync(join(samplesPath, 'test.md'), 'utf8');
        let assertHtml = readFileSync(join(samplesPath, 'test_assert.html'), 'utf8');
		const normalizeLineEndings = (value: string) => value.replace(/\r/g, "").trimEnd();
		assert.equal(
			normalizeLineEndings(zhihuMdParser.render(testMd, {})),
			normalizeLineEndings(assertHtml),
		);
	});

});
