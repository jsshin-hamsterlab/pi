import assert from "node:assert";
import { describe, it } from "node:test";
import { CombinedAutocompleteProvider } from "../src/autocomplete.js";
import { Editor } from "../src/components/editor.js";
import { TUI } from "../src/tui.js";
import { defaultEditorTheme } from "./test-themes.js";
import { VirtualTerminal } from "./virtual-terminal.js";

function createTestTUI(cols = 80, rows = 24): TUI {
	return new TUI(new VirtualTerminal(cols, rows));
}

async function flushAutocomplete(): Promise<void> {
	await Promise.resolve();
	await new Promise((resolve) => setImmediate(resolve));
}

describe("slash completion anywhere", () => {
	it("shows only skill commands for mid-line slash tokens", async () => {
		const provider = new CombinedAutocompleteProvider(
			[
				{ name: "model", description: "Switch models" },
				{ name: "settings", description: "Open settings" },
				{ name: "skill:code-review", description: "Review code" },
				{ name: "skill:plan", description: "Plan work" },
			],
			"/tmp",
		);

		const result = await provider.getSuggestions(["review this /s"], 0, 14, {
			signal: new AbortController().signal,
		});

		assert.notStrictEqual(result, null);
		assert.strictEqual(result?.prefix, "/s");
		assert.deepStrictEqual(
			result?.items.map((item) => item.value),
			["skill:code-review", "skill:plan"],
		);
	});

	it("treats second-line slash tokens as skill references instead of built-in commands", async () => {
		const provider = new CombinedAutocompleteProvider(
			[
				{ name: "model", description: "Switch models" },
				{ name: "skill:code-review", description: "Review code" },
			],
			"/tmp",
		);

		const result = await provider.getSuggestions(["first line", "/s"], 1, 2, {
			signal: new AbortController().signal,
		});

		assert.notStrictEqual(result, null);
		assert.deepStrictEqual(
			result?.items.map((item) => item.value),
			["skill:code-review"],
		);
	});

	it("replaces only the mid-line slash token on completion", () => {
		const provider = new CombinedAutocompleteProvider([], "/tmp");
		const result = provider.applyCompletion(
			["review /skill:c now"],
			0,
			15,
			{ value: "skill:code-review", label: "skill:code-review" },
			"/skill:c",
		);

		assert.deepStrictEqual(result.lines, ["review /skill:code-review now"]);
		assert.strictEqual(result.cursorCol, "review /skill:code-review".length);
	});

	it("does not submit after selecting a mid-line slash skill reference", async () => {
		const provider = new CombinedAutocompleteProvider(
			[{ name: "skill:code-review", description: "Review code" }],
			"/tmp",
		);
		const editor = new Editor(createTestTUI(), defaultEditorTheme);
		editor.setAutocompleteProvider(provider);

		let submitted: string | undefined;
		editor.onSubmit = (text) => {
			submitted = text;
		};

		for (const char of "review /skill:c") {
			editor.handleInput(char);
		}
		await flushAutocomplete();

		editor.handleInput("\r");

		assert.strictEqual(submitted, undefined);
		assert.strictEqual(editor.getText(), "review /skill:code-review ");
	});

	it("still submits after selecting a prompt-start slash command", async () => {
		const provider = new CombinedAutocompleteProvider([{ name: "model", description: "Switch models" }], "/tmp");
		const editor = new Editor(createTestTUI(), defaultEditorTheme);
		editor.setAutocompleteProvider(provider);

		let submitted: string | undefined;
		editor.onSubmit = (text) => {
			submitted = text;
		};

		for (const char of "/mo") {
			editor.handleInput(char);
		}
		await flushAutocomplete();

		editor.handleInput("\r");

		assert.strictEqual(submitted, "/model");
		assert.strictEqual(editor.getText(), "");
	});
});
