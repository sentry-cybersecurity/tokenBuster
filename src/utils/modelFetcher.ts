export function isModelFetcherEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_MODEL_FETCHER !== 'false';
}

