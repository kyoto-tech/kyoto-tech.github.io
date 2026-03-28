import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import eslintPluginAstro from "eslint-plugin-astro";
import jsxA11y from "eslint-plugin-jsx-a11y";
export default [
	js.configs.recommended,
	...eslintPluginAstro.configs.recommended,
	...eslintPluginAstro.configs["flat/jsx-a11y-recommended"],
	{
		plugins: {
			"jsx-a11y": jsxA11y
		},
		rules: {
			quotes: ["error", "double", { allowTemplateLiterals: true, avoidEscape: true }],
			"no-console": ["warn", { allow: ["warn", "error", "info"] }],
			"max-lines": ["warn", { max: 500, skipBlankLines: true, skipComments: true }]
		}
	},
	{
		files: ["**/*.{ts,tsx}"],
		languageOptions: {
			parser: tsParser
		}
	},
	{
		files: ["src/pages/api/**/*.ts"],
		languageOptions: {
			parser: tsParser,
			globals: {
				Request: "readonly",
				Response: "readonly",
				fetch: "readonly",
				console: "readonly",
			}
		}
	},
	{
		files: ["scripts/**/*.{js,ts,tsx}", "tmp/**/*.{js,ts,tsx}"],
		rules: {
			"no-console": "off"
		}
	},
	{
		ignores: ["scripts/tmp/**", "scripts/**", "tmp/**", "dist/**", "node_modules/**", ".astro/**"]
	}
];
