import { TiktokenModel } from '@dqbd/tiktoken';



export type TokenizerType = 'tiktoken' | 'xenova';

export function getTokenizerType(modelId: string): TokenizerType {
  const lower = modelId.toLowerCase();
  if (
    lower.startsWith('gpt') ||
    lower.includes('text-davinci') ||
    lower.includes('turbo') ||
    lower.includes('openai')
  ) {
    return 'tiktoken';
  }
  return 'xenova';
}

function isGptModel(modelId: string): boolean {
  return /^gpt(?:-3\.5|-4)?(?:-turbo)?/i.test(modelId) || modelId.includes('openai');
}

export async function tokenize(
  input: string,
  model: string,
  type: TokenizerType
): Promise<number[]> {
  if (typeof input !== 'string' || !model || !type) {
    throw new Error('Missing or invalid tokenizer arguments.');
  }

  if (type === 'tiktoken') {
    const { encoding_for_model, get_encoding } = await import('@dqbd/tiktoken');
    let encoding;


    try {
      encoding =
        model === "gpt-3.5-turbo" || model === "gpt-4" || model === "gpt-4-32k"
          ? get_encoding("cl100k_base", {
              "<|im_start|>": 100264,
              "<|im_end|>": 100265,
              "<|im_sep|>": 100266,
            })
          : model === "gpt-4o"
          ? get_encoding("o200k_base", {
              "<|im_start|>": 200264,
              "<|im_end|>": 200265,
              "<|im_sep|>": 200266,
            })
          : // @ts-expect-error r50k broken?
            encoding_for_model(model);
    } catch {
      encoding = get_encoding('cl100k_base');
    }

    const tokens = encoding.encode(input,"all");
    return Array.from(tokens);
  }

  if (type === 'xenova') {
    if (typeof window === 'undefined') {
      throw new Error('Xenova tokenizer must run in the browser');
    }

    const { AutoTokenizer, env } = await import('@xenova/transformers');

    if (!(env as any)._configured) {
      env.localModelPath = '';
      env.allowLocalModels = true;
      env.allowRemoteModels = false;
      env.remoteHost = window.location.origin;
      env.remotePathTemplate = '/api/hf/{model}';
      (env as any)._configured = true;
    }

    const localPath = `/api/hf/${sanitizeModelId(model)}`;
    const tokenizer = await AutoTokenizer.from_pretrained(localPath, {
      local_files_only: true,
    });

    const output = await tokenizer.encode(input);
    if (!output || !Array.isArray(output)) {
      throw new Error(`[Xenova] Unexpected tokenizer output for model: ${model}`);
    }

    return output;
  }

  throw new Error(`Unsupported tokenizer type: ${type}`);
}

export async function detokenize(
  tokenIds: number[],
  model: string,
  type: TokenizerType
): Promise<string> {
  if (!Array.isArray(tokenIds) || tokenIds.some(id => typeof id !== 'number')) {
    throw new Error('Invalid tokenIds provided for detokenization');
  }

  if (type === 'tiktoken') {
    const { encoding_for_model, get_encoding } = await import('@dqbd/tiktoken');
    let encoding;

    try {
      encoding =
        model === 'gpt-3.5-turbo' || model === 'gpt-4' || model === 'gpt-4-32k'
          ? encoding_for_model(model, {
              '<|im_start|>': 100264,
              '<|im_end|>': 100265,
              '<|im_sep|>': 100266,
            })
          : model === 'gpt-4o'
          ? encoding_for_model('gpt-4o', {
              '<|im_start|>': 200264,
              '<|im_end|>': 200265,
              '<|im_sep|>': 200266,
            })
          : encoding_for_model(model as TiktokenModel);
    } catch {
      encoding = get_encoding('cl100k_base');
    }


    const decodedBytes: Uint8Array = encoding.decode(new Uint32Array(tokenIds));;
    const decoded = new TextDecoder('utf-8').decode(decodedBytes);  
    encoding.free();
    return decoded;
  }


  if (type === 'xenova') {
    if (typeof window === 'undefined') {
      throw new Error('Xenova tokenizer must run in the browser');
    }

    const { AutoTokenizer, env } = await import('@xenova/transformers');

    if (!(env as any)._configured) {
      env.localModelPath = '';
      env.allowLocalModels = true;
      env.allowRemoteModels = false;
      env.remoteHost = window.location.origin;
      env.remotePathTemplate = '/api/hf/{model}';
      (env as any)._configured = true;
    }

    const localPath = `/api/hf/${sanitizeModelId(model)}`;
    const tokenizer = await AutoTokenizer.from_pretrained(localPath, {
      local_files_only: true,
    });

    const decoded = await tokenizer.decode(tokenIds, { skip_special_tokens: false });
    return decoded;
  }

  throw new Error(`Unsupported tokenizer type: ${type}`);
}

function sanitizeModelId(modelId: string): string {
  const match = modelId.match(/^([^/]+)\/([^/]+)$/);
  if (!match) {
    throw new Error(`Invalid model ID format. Expected 'org/model', got: ${modelId}`);
  }

  const [, org, model] = match;
  const safeOrg = org.replace(/[^a-zA-Z0-9-_]/g, '-');
  const safeModel = model.replace(/[^a-zA-Z0-9-_.]/g, '-');

  return `${safeOrg}/${safeModel}`;
}


export async function getTokenDetails(
  tokenIds: number[],
  model: string,
  type: TokenizerType
): Promise<{ id: number; text: string }[]> {
  if (type === 'tiktoken') {
    const { encoding_for_model, get_encoding } = await import('@dqbd/tiktoken');
    let encoding;

    try {
      encoding =
        model === 'gpt-3.5-turbo' || model === 'gpt-4' || model === 'gpt-4-32k'
          ? encoding_for_model(model, {
              '<|im_start|>': 100264,
              '<|im_end|>': 100265,
              '<|im_sep|>': 100266,
            })
          : model === 'gpt-4o'
          ? encoding_for_model('gpt-4o', {
              '<|im_start|>': 200264,
              '<|im_end|>': 200265,
              '<|im_sep|>': 200266,
            })
          : encoding_for_model(model as TiktokenModel);
    } catch {
      encoding = get_encoding('cl100k_base');
    }

    const details = tokenIds.map(id => {
      const bytes = encoding.decode_single_token_bytes(id);
      const text = new TextDecoder('utf-8').decode(bytes);
      return { id, text };
    });

    encoding.free();
    return details;
  }

  if (type === 'xenova') {
    const { AutoTokenizer, env } = await import('@xenova/transformers');
    if (!(env as any)._configured) {
      env.localModelPath = '';
      env.allowLocalModels = true;
      env.allowRemoteModels = false;
      env.remoteHost = window.location.origin;
      env.remotePathTemplate = '/api/hf/{model}';
      (env as any)._configured = true;
    }

    const tokenizer = await AutoTokenizer.from_pretrained(`/api/hf/${sanitizeModelId(model)}`, {
      local_files_only: true,
    });

    const details = await Promise.all(
      tokenIds.map(async id => {
        const text = await tokenizer.decode([id], { skip_special_tokens: false });
        return { id, text };
      })
    );

    return details;
  }

  throw new Error(`Unsupported tokenizer type: ${type}`);
}
