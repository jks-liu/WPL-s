const eslint = require("@eslint/js");
const globals = require("globals");
const tsParser = require("@typescript-eslint/parser");

module.exports = [
	{
		ignores: ["dist/**", "out/**", "node_modules/**"],
	},
	{
		files: ["src/**/*.ts", "test/**/*.ts"],
		languageOptions: {
			globals: {
				...globals.node,
				...globals.browser,
				...globals.mocha,
			},
			parser: tsParser,
			parserOptions: {
				ecmaVersion: 2022,
				sourceType: "module",
			},
		},
		rules: {
			...eslint.configs.recommended.rules,
			"no-unused-vars": "off",
			"no-redeclare": "off",
			"no-undef": "off",
		},
	},
];
