'use client';

import { useState, useEffect } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { EditorView } from '@codemirror/view';
import copy from 'copy-to-clipboard';
import LoadingOverlay from '@/components/LoadingOverlay';

type OutputViewerProps = {
  content: string;
  error?: string;
  modelId?: string;
  chatInputs?: { role: string; content: string; customRole?: string }[];
  loading?: boolean;
};

const GPT_MODEL_REGEX = /^gpt(?:-3\.5|-4)?(?:-turbo)?/i;
const isGptModel = (modelId?: string) =>
  !!modelId && GPT_MODEL_REGEX.test(modelId);

function transformChatInputsForGpt(
  messages: { role: string; content: string; customRole?: string }[],
  model: string
): string {
  const isGpt3 = model === 'gpt-3.5-turbo';
  const msgSep = isGpt3 ? '\n' : '';
  const roleSep = isGpt3 ? '\n' : '<|im_sep|>';

  const body = messages
    .map(({ role, customRole, content }) => {
      const roleLabel = customRole || role;
      return `<|im_start|>${roleLabel}${roleSep}${content}<|im_end|>`;
    })
    .join(msgSep);

  return [body, `<|im_start|>assistant${roleSep}`].join(msgSep);
}

export default function OutputViewer({
  content,
  error,
  modelId,
  chatInputs, // ✅ properly destructured
  loading = false,
}: OutputViewerProps) {
  const [copied, setCopied] = useState(false);
  const [wrapLines, setWrapLines] = useState(true);
  const [renderedContent, setRenderedContent] = useState(content);
  const [isSpecialTokensModalOpen, setIsSpecialTokensModalOpen] = useState(false);
  const [specialTokens, setSpecialTokens] = useState<string[]>([]);
  const [specialTokensError, setSpecialTokensError] = useState<string | null>(null);
  const [isSpecialTokensLoading, setIsSpecialTokensLoading] = useState(false);

  useEffect(() => {
    if (isGptModel(modelId) && chatInputs && chatInputs.length > 0) {
      const transformed = transformChatInputsForGpt(chatInputs, modelId!);
      setRenderedContent(transformed);
    } else {
      setRenderedContent(content);
    }
  }, [chatInputs, content, modelId]);

  const handleCopy = () => {
    copy(renderedContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  useEffect(() => {
    if (!isSpecialTokensModalOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsSpecialTokensModalOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isSpecialTokensModalOpen]);

  const fetchSpecialTokens = async () => {
    if (!modelId || !modelId.includes('/')) {
      setSpecialTokens([]);
      setSpecialTokensError('No valid model selected.');
      return;
    }

    const encodedModelId = modelId
      .split('/')
      .map(part => encodeURIComponent(part))
      .join('/');

    try {
      setIsSpecialTokensLoading(true);
      setSpecialTokensError(null);

      const res = await fetch(`/api/hf/${encodedModelId}/tokenizer.json`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        throw new Error(`Failed to load tokenizer.json (${res.status})`);
      }

      const data = await res.json();
      const addedTokens = Array.isArray(data?.added_tokens) ? data.added_tokens : [];
      const contentOnly = addedTokens
        .map((token: { content?: unknown }) => token?.content)
        .filter((token: unknown): token is string => typeof token === 'string');

      setSpecialTokens(contentOnly);
    } catch (err: any) {
      setSpecialTokens([]);
      setSpecialTokensError(err?.message || 'Failed to load special tokens.');
    } finally {
      setIsSpecialTokensLoading(false);
    }
  };

  const openSpecialTokensModal = () => {
    setIsSpecialTokensModalOpen(true);
    fetchSpecialTokens();
  };

  return (
    <>
      <div className="relative flex flex-col h-full w-full dark:bg-white/5 rounded-md border border-gray-400 dark:border-white/20 shadow-inner overflow-hidden">
        <div className="flex justify-between items-center px-3 py-2 text-sm dark:text-white/60 border-b dark:border-white/10 bg-white dark:bg-gray-900">
          <span>Rendered Output</span>
          <div className="flex items-center gap-2">
            <button
              onClick={openSpecialTokensModal}
              title="View Special Tokens"
              className="text-xs px-2 py-1 border rounded dark:border-white/30 dark:text-white relative cursor-pointer"
            >
              Special Tokens
            </button>
            <button
              onClick={handleCopy}
              title="Copy"
              className="text-xs px-2 py-1 border rounded dark:border-white/30 dark:text-white relative cursor-pointer"
            >
              {copied ? (
                <span className="text-green-500">Copied!</span>
              ) : (
                <>📋 Copy</>
              )}
            </button>
            <button
              onClick={() => setWrapLines((prev) => !prev)}
              title="Toggle Line Wrap"
              className="text-xs px-2 py-1 border rounded dark:border-white/30 dark:text-white relative cursor-pointer"
            >
              {wrapLines ? '↩️ Unwrap' : '➡️ Wrap'}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <CodeMirror
            value={renderedContent}
            height="100%"
            readOnly
            extensions={[...(wrapLines ? [EditorView.lineWrapping] : [])]}
            theme="dark"
          />
        </div>

        {error && (
          <div className="text-xs text-red-500 px-3 py-1 border-t border-red-500 dark:border-red-300 bg-red-50 dark:bg-red-950">
            {error}
          </div>
        )}

        <LoadingOverlay show={loading} />
      </div>

      {isSpecialTokensModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center p-3 md:p-6">
          <div className="w-full max-w-3xl h-[70vh] bg-white dark:bg-gray-950 rounded-lg border border-gray-300 dark:border-white/20 shadow-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-300 dark:border-white/20">
              <div className="dark:text-white">
                <h2 className="text-sm md:text-base font-semibold">Special Tokens</h2>
                <p className="text-xs opacity-70">
                  Count: {specialTokens.length}
                </p>
              </div>
              <button
                onClick={() => setIsSpecialTokensModalOpen(false)}
                className="text-xs md:text-sm px-3 py-1 rounded border border-gray-400 dark:border-white/30 dark:text-white cursor-pointer"
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-auto p-4">
              {isSpecialTokensLoading ? (
                <p className="text-sm dark:text-white/80">Loading special tokens...</p>
              ) : specialTokensError ? (
                <p className="text-sm text-red-500">{specialTokensError}</p>
              ) : specialTokens.length === 0 ? (
                <p className="text-sm dark:text-white/80">No special tokens found in `added_tokens`.</p>
              ) : (
                <div className="space-y-2">
                  {specialTokens.map((token, index) => (
                    <div
                      key={`${token}-${index}`}
                      className="px-3 py-2 rounded border border-gray-300 dark:border-white/20 bg-gray-50 dark:bg-gray-900 font-mono text-xs md:text-sm dark:text-white break-all"
                    >
                      {token}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
