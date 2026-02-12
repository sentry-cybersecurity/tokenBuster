import { Template } from '@huggingface/jinja';

const DEFAULT_EOS_TOKEN = '</s>';

function isMultimodalTemplate(templateStr: string): boolean {
	return (
		/\bfor line in message\['content'\]/.test(templateStr) ||
		/\bfor content in message\['content'\]/.test(templateStr)
	);
}

function containsUnsupportedFilters(templateStr: string): boolean {
	return /\| *selectattr\b/.test(templateStr);
}

const textOnlyExample = {
	messages: [
		{ role: 'system', content: 'You are a helpful assistant.' },
		{ role: 'user', content: 'Hello, how are you?' },
		{ role: 'assistant', content: "I'm doing great. How can I help you today?" },
		{ role: 'user', content: 'Can you tell me a joke?' },
		{ role: 'assistant', content: "Why don't scientists trust atoms? Because they make up everything!" }
	],
	add_generation_prompt: true
};

const multimodalExample = {
	messages: [
		{
			role: 'user',
			content: [
				{ type: 'text', text: 'Can you explain this chart?' },
				{ type: 'audio' }  // mimicking multimodal
			]
		},
		{
			role: 'assistant',
			content: [
				{ type: 'text', text: 'Sure! This looks like a sales comparison.' }
			]
		}
	],
	add_generation_prompt: true
};

function patchTemplate(templateStr: string): string {
	return templateStr
		.replace(/message\[['"]title['"]\]\.strip\(\)/g, "(message['title'] or '')")
		.replace(/message\[['"]content['"]\]\.strip\(\)/g, "(message['content'] or '')")
		.replace(/message\[['"]title['"]\]\.lower\(\)/g, "(message['title'] or '')")
		.replace(/message\[['"]content['"]\]\.lower\(\)/g, "(message['content'] or '')")
		.replace(/message\[['"]content['"]\]/g, "(message['content'] or '')")
		.replace(/message\[['"]role['"]\]/g, "(message['role'] or '')")
		.replace(/line\[['"]text['"]\]/g, "(line['text'] or '')")
		.replace(/\beos_token\b/g, "(eos_token or '')")
		.replace(/\(\s*([a-zA-Z0-9_\[\]'"]+)\s*\)\s*\.\w+\(\)/g, '($1 or \'\')');
}

function sanitizeTemplateInput(input: any): Record<string, unknown> {
	return {
		messages: (input.messages || []).map((msg: any) => {
			const role = msg.role ?? 'user';

			const title = typeof msg.title === 'string' ? msg.title.trim() : undefined;

			let content: any;
			if (Array.isArray(msg.content)) {
				content = msg.content.map((item: any) => {
					if (item?.type === 'text' && typeof item.text === 'string') {
						return { ...item, text: item.text.trim() };
					}
					return item;
				});
			} else if (typeof msg.content === 'string') {
				content = msg.content.trim();
			} else {
				content = '';
			}

			return { role, title, content };
		}),
		add_generation_prompt: Boolean(input.add_generation_prompt),
		eos_token: DEFAULT_EOS_TOKEN,
		tools: Array.isArray(input.tools) ? input.tools : []
	};
}

export function getExampleHelloWorld(templateStr?: string): Record<string, unknown> | undefined {
	if (typeof templateStr !== 'string') {
		console.warn('[getExampleHelloWorld] Invalid template string');
		return undefined;
	}

	if (containsUnsupportedFilters(templateStr)) {
		console.warn('[getExampleHelloWorld] Unsupported Jinja filters like selectattr detected.');
		return textOnlyExample;
	}

	const safeTemplateStr = patchTemplate(templateStr);
	const template = new Template(safeTemplateStr);

	const input = isMultimodalTemplate(templateStr) ? multimodalExample : textOnlyExample;

	try {
		const rendered = template.render(sanitizeTemplateInput(input));
		if (
			rendered.includes('You are a helpful assistant.') ||
			rendered.includes('Sure! This looks like') ||
			rendered.includes('ASSISTANT:')
		) {
			return input;
		}
		return textOnlyExample;
	} catch (e) {
		console.error('[getExampleHelloWorld] Template render failed:', e);
		return textOnlyExample;
	}
}
