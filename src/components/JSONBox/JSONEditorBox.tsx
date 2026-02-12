'use client';

import { useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { linter, Diagnostic, lintGutter } from '@codemirror/lint';
import { EditorView, lineNumbers } from '@codemirror/view';
import { foldGutter } from '@codemirror/language';
import JSON5 from 'json5';
import copy from 'copy-to-clipboard';
import LoadingOverlay from '@/components/LoadingOverlay';

type ExampleOption = {
  key: string;
  label: string;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  exampleValue?: string;
  onReset?: () => void;
  exampleOptions: ExampleOption[];
  selectedExampleKey: string;
  onExampleChange: (key: string) => void;
  exampleError?: string;
  disabled?: boolean; // ✅ added
  loading?: boolean;
};

export default function JSONEditorBox({
  value,
  onChange,
  exampleValue = '',
  onReset,
  exampleOptions,
  selectedExampleKey,
  onExampleChange,
  exampleError,
  disabled = false, // ✅ default to false
  loading = false,
}: Props) {
  const [error, setError] = useState('');
  const [wrapLines, setWrapLines] = useState(true);
  const [copied, setCopied] = useState(false);

  const jsonLinter = () => {
    return (view: EditorView): Diagnostic[] => {
      const diagnostics: Diagnostic[] = [];
      const text = view.state.doc.toString();

      try {
        JSON5.parse(text);
        setError('');
      } catch (e: any) {
        let pos = 0;
        const errorMessage = e.message || 'Unknown error';
        const line = e.lineNumber;
        const column = e.columnNumber;

        if (typeof line === 'number' && typeof column === 'number') {
          let runningPos = 0;
          let currentLine = 1;
          for (let i = 0; i < text.length; i++) {
            if (currentLine === line && runningPos === column - 1) {
              pos = i;
              break;
            }
            if (text[i] === '\n') {
              currentLine++;
              runningPos = 0;
            } else {
              runningPos++;
            }
          }
        }

        diagnostics.push({
          from: Math.max(0, pos - 1),
          to: Math.min(text.length, pos + 1),
          severity: 'error',
          message: `JSON Error: ${errorMessage}`,
        });
        setError(errorMessage);
      }

      return diagnostics;
    };
  };

  const handleCopy = () => {
    copy(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleReset = () => {
    onChange(exampleValue);
    onReset?.();
  };

  return (
    <div className="relative flex flex-col h-full w-full dark:bg-white/5 rounded-md border border-gray-400 dark:border-white/20 shadow-inner overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-center px-3 py-2 text-sm dark:text-white/60 border-b dark:border-white/10 bg-white dark:bg-gray-900">
        <span>JSON Input</span>
        <div className="flex items-center gap-2">
          {/* Example selector dropdown */}
          <select
            value={selectedExampleKey}
            onChange={e => onExampleChange(e.target.value)}
            className="text-xs px-2 py-1 border rounded dark:border-white/30 dark:text-white bg-white dark:bg-gray-800 cursor-pointer"
            title="Select example input"
            disabled={disabled || loading}
          >
            {exampleOptions.map(opt => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>

          {!disabled && exampleValue && value !== exampleValue && (
            <button
              onClick={handleReset}
              title="Reset to example"
              className="text-xs px-2 py-1 border rounded dark:border-white/30 dark:text-white relative cursor-pointer"
            >
              ⟲ Reset
            </button>
          )}

          {!disabled && (
            <>
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
                onClick={() => setWrapLines(prev => !prev)}
                title="Toggle Line Wrap"
                className="text-xs px-2 py-1 border rounded dark:border-white/30 dark:text-white relative cursor-pointer"
              >
                {wrapLines ? '↩️ Unwrap' : '➡️ Wrap'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Error for unsupported example */}
      {exampleError && (
        <div className="text-xs px-3 py-2 text-yellow-600 dark:text-yellow-300 bg-yellow-50 dark:bg-yellow-900 border-b border-yellow-400 dark:border-yellow-600">
          ⚠️ {exampleError}
        </div>
      )}

      {/* Disabled notice or CodeMirror editor */}
      {disabled ? (
        <div className="flex-1 overflow-auto p-4 text-sm text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800">
        GPT message composition is enabled. JSON input is not used in this mode.
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <CodeMirror
            value={value}
            height="100%"
            extensions={[
              lineNumbers(),
              javascript(),
              linter(jsonLinter()),
              lintGutter(),
              foldGutter(),
              ...(wrapLines ? [EditorView.lineWrapping] : []),
            ]}
            theme="dark"
            onChange={(val: string) => {
              onChange(val);
            }}
          />
        </div>
      )}

      {!disabled && error && (
        <div className="text-xs text-red-500 px-3 py-1 border-t border-red-500 dark:border-red-300 bg-red-50 dark:bg-red-950">
          {error}
        </div>
      )}

      <LoadingOverlay show={loading} />
    </div>
  );
}
