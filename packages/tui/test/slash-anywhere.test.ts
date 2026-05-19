import assert from "node:assert";
import { describe, it } from "node:test";
import {
	type AutocompleteProvider,
	type AutocompleteSuggestions,
	CombinedAutocompleteProvider,
} from "../src/autocomplete.js";
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

class TabRoutingAutocompleteProvider implements AutocompleteProvider {
	calls: boolean[] = [];

	async getSuggestions(
		_lines: string[],
		_cursorLine: number,
		_cursorCol: number,
		options: { signal: AbortSignal; force?: boolean },
	): Promise<AutocompleteSuggestions | null> {
		this.calls.push(options.force === true);
		if (options.force) {
			return {
				items: [{ value: "FORCED ", label: "FORCED" }],
				prefix: "/s",
			};
		}

		return {
			items: [{ value: "/skill:code-review ", label: "skill:code-review" }],
			prefix: "/s",
		};
	}

	applyCompletion(
		lines: string[],
		cursorLine: number,
		cursorCol: number,
		item: { value: string; label: string },
		prefix: string,
	): {
		lines: string[];
		cursorLine: number;
		cursorCol: number;
	} {
		const currentLine = lines[cursorLine] || "";
		const beforePrefix = currentLine.slice(0, cursorCol - prefix.length);
		const afterCursor = currentLine.slice(cursorCol);
		const nextLines = [...lines];
		nextLines[cursorLine] = `${beforePrefix}${item.value}${afterCursor}`;

		return {
			lines: nextLines,
			cursorLine,
			cursorCol: beforePrefix.length + item.value.length,
		};
	}
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

	it("shows skill commands for later first-line slash tokens after a prompt-start skill", async () => {
		const provider = new CombinedAutocompleteProvider(
			[
				{ name: "model", description: "Switch models" },
				{ name: "settings", description: "Open settings" },
				{ name: "skill:code-review", description: "Review code" },
				{ name: "skill:plan", description: "Plan work" },
			],
			"/tmp",
		);
		const prompt = "/skill:plan compare with /s";

		const result = await provider.getSuggestions([prompt], 0, prompt.length, {
			signal: new AbortController().signal,
		});

		assert.notStrictEqual(result, null);
		assert.strictEqual(result?.prefix, "/s");
		assert.deepStrictEqual(
			result?.items.map((item) => item.value),
			["skill:code-review", "skill:plan"],
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

	it("replaces only the later first-line slash token in a prompt-start skill prompt", () => {
		const provider = new CombinedAutocompleteProvider([], "/tmp");
		const prompt = "/skill:plan compare /skill:c";
		const result = provider.applyCompletion(
			[prompt],
			0,
			prompt.length,
			{ value: "skill:code-review", label: "skill:code-review" },
			"/skill:c",
		);

		assert.deepStrictEqual(result.lines, ["/skill:plan compare /skill:code-review "]);
		assert.strictEqual(result.cursorCol, "/skill:plan compare /skill:code-review ".length);
	});

	it("routes Tab to slash-skill completion for later inline tokens in prompt-start skill prompts", async () => {
		const provider = new TabRoutingAutocompleteProvider();
		const editor = new Editor(createTestTUI(), defaultEditorTheme);
		editor.setAutocompleteProvider(provider);
		editor.setText("/skill:plan compare /s");

		editor.handleInput("\t");
		await flushAutocomplete();

		assert.deepStrictEqual(provider.calls, [false]);
		assert.strictEqual(editor.isShowingAutocomplete(), true);
		assert.strictEqual(editor.getText(), "/skill:plan compare /s");

		editor.handleInput("\t");

		assert.strictEqual(editor.getText(), "/skill:plan compare /skill:code-review ");
		assert.strictEqual(editor.isShowingAutocomplete(), false);
	});

	it("preserves prompt-start slash-command argument completions for slash-prefixed arguments", async () => {
		const provider = new CombinedAutocompleteProvider(
			[
				{
					name: "load-skills",
					description: "Load skills",
					getArgumentCompletions: async (prefix) =>
						prefix.startsWith("/") ? [{ value: "/tmp/skills/", label: "/tmp/skills/" }] : null,
				},
				{ name: "skill:code-review", description: "Review code" },
			],
			"/tmp",
		);
		const prompt = "/load-skills /t";

		const result = await provider.getSuggestions([prompt], 0, prompt.length, {
			signal: new AbortController().signal,
		});

		assert.notStrictEqual(result, null);
		assert.strictEqual(result?.prefix, "/t");
		assert.deepStrictEqual(result?.items, [{ value: "/tmp/skills/", label: "/tmp/skills/" }]);
	});

	it("keeps Tab file-style argument routing for non-skill prompt-start slash commands", async () => {
		const provider = new TabRoutingAutocompleteProvider();
		const editor = new Editor(createTestTUI(), defaultEditorTheme);
		editor.setAutocompleteProvider(provider);
		editor.setText("/load-skills /s");

		editor.handleInput("\t");
		await flushAutocomplete();

		assert.deepStrictEqual(provider.calls, [true]);
		assert.strictEqual(editor.isShowingAutocomplete(), false);
		assert.strictEqual(editor.getText(), "/load-skills FORCED ");
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

	it("does not submit after selecting a later inline slash skill in a prompt-start skill prompt", async () => {
		const provider = new CombinedAutocompleteProvider(
			[
				{ name: "skill:code-review", description: "Review code" },
				{ name: "skill:plan", description: "Plan work" },
			],
			"/tmp",
		);
		const editor = new Editor(createTestTUI(), defaultEditorTheme);
		editor.setAutocompleteProvider(provider);

		let submitted: string | undefined;
		editor.onSubmit = (text) => {
			submitted = text;
		};

		for (const char of "/skill:plan compare /skill:c") {
			editor.handleInput(char);
		}
		await flushAutocomplete();

		assert.strictEqual(editor.isShowingAutocomplete(), true);
		editor.handleInput("\r");

		assert.strictEqual(submitted, undefined);
		assert.strictEqual(editor.getText(), "/skill:plan compare /skill:code-review ");
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
