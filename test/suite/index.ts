import { glob } from "glob";
import Mocha from "mocha";
import * as path from "path";

export async function run(): Promise<void> {
	const mocha = new Mocha({ ui: "tdd" });
	const testsRoot = path.resolve(__dirname, "..");
	const files = await glob("**/*.test.js", { cwd: testsRoot });
	files.forEach(file => mocha.addFile(path.resolve(testsRoot, file)));

	await new Promise<void>((resolve, reject) => {
		mocha.run(failures => failures > 0
			? reject(new Error(`${failures} tests failed.`))
			: resolve());
	});
}
