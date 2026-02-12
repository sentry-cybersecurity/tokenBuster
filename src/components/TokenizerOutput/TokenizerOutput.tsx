'use client';

import { useEffect, useState } from 'react';
import { tokenize, getTokenDetails } from '@/utils/models/tokenizer';
import LoadingOverlay from '@/components/LoadingOverlay';

interface TokenEditorProps {
  input: string;
  model: string;
  type: 'tiktoken' | 'xenova';
  externalLoading?: boolean;
}

type TokenWithId = { id: number; text: string };

export default function TokenEditor({ input, model, type, externalLoading = false }: TokenEditorProps) {
  const [, setTokens] = useState<number[]>([]);
  const [editedTokens, setEditedTokens] = useState<string>('');
  const [tokenDetails, setTokenDetails] = useState<TokenWithId[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => setIsHydrated(true), []);

  useEffect(() => {
    if (!isHydrated || !input || !model || !type) return;

    (async () => {
      try {
        setIsLoading(true);
        const tokenIds = await tokenize(input, model, type);
        setTokens(tokenIds);
        setEditedTokens(tokenIds.join(', '));
        const details = await getTokenDetails(tokenIds, model, type);
        setTokenDetails(details);
        setError(null);
      } catch (err: any) {
        console.error(err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [input, model, type, isHydrated]);

  const handleTokenChange = async (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const raw = e.target.value;
    setEditedTokens(raw);

    try {
      setIsLoading(true);
      const newTokenIds = raw.split(',').map(x => parseInt(x.trim())).filter(x => !isNaN(x));
      setTokens(newTokenIds);
      const details = await getTokenDetails(newTokenIds, model, type);
      setTokenDetails(details);
      setError(null);
    } catch (err: any) {
      setError('Failed to detokenize: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const formatText = (text: string) =>
    text.replace(/ /g, '·').replace(/\n/g, '\\n');

  if (!isHydrated) return null;

  return (
    <div className="relative p-4 border border-white/30 bg-gray-50 dark:bg-gray-900 dark:text-white rounded space-y-4">
      <div>
        <label className="block mb-1 font-bold">Edit Token IDs</label>
        <textarea
          className="w-full h-20 p-2 rounded dark:bg-gray-800 border border-gray-600 text-sm font-mono"
          value={editedTokens}
          onChange={handleTokenChange}
          disabled={externalLoading || isLoading}
        />
      </div>

      <div className="flex flex-col h-full max-h-[40vh]">
        <label className="block mb-1 font-bold">Rendered Output</label>
        <div className="border border-gray-600 dark:bg-gray-800 p-2 rounded overflow-auto h-50 font-mono whitespace-pre-wrap break-words text-[15px] leading-tight">
          {tokenDetails.length > 0 ? (
            tokenDetails.map((t, i) => (
              <span key={i} className="relative group inline-block px-[2px]">
                <span className="hover:bg-blue-500 hover:text-white rounded cursor-default transition">
                  {formatText(t.text)}
                </span>
                <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 px-2 py-[1px] text-[14px] bg-gray-700 text-white rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-20 pointer-events-none">
                  {t.id}
                </div>
              </span>
            ))
          ) : (
            'Nothing rendered yet.'
          )}
        </div>
      </div>

      {error && (
        <div className="text-red-400 font-mono text-xs mt-1">{error}</div>
      )}

      <LoadingOverlay show={externalLoading || isLoading} />
    </div>
  );
}
