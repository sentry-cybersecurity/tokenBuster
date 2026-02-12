# TokenBuster
A chat template to tokenizer playground that supports **4k+** models like DeepSeek, Qwen, Perplexity AI, etc.

## Local Setup

```bash
npm install
npm run dev
```

## Docker Compose (Web + Model Fetcher)

This project can run as two containers:
- `model-fetcher`: syncs models from Hugging Face and serves model files over HTTP.
- `web`: Next.js UI that fetches models/metadata/tokenizers through API calls to `model-fetcher`.

### Start

```bash
docker compose up --build
```

Then open `http://localhost:3000`.

### Optional env

- `HF_API_KEY` or `HF_TOKEN`: token used by the fetcher when syncing private/rate-limited models.
- `SYNC_INTERVAL_MIN`: fetch interval in minutes (default `5`).

## Patches in Xenova/Transformers library

Xenova/transformers npm library is a JavaScript library that allows you to run Hugging Face Transformers models directly in the browser or in Node.js using WebAssembly, without requiring Python. It supports tasks like tokenization, text classification, question answering, and more. All client-side and serverless.

---
&copy; Vr3ll4
