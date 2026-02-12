'use client';

import { useState, useEffect } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { StreamLanguage } from '@codemirror/language';
import { jinja2 } from '@codemirror/legacy-modes/mode/jinja2';
import { lineNumbers, EditorView } from '@codemirror/view';
import copy from 'copy-to-clipboard';
import LoadingOverlay from '@/components/LoadingOverlay';

const GPT_MODEL_REGEX = /^gpt(?:-3\.5|-4)?(?:-turbo)?/i;
const isGptModel = (modelId: string) => GPT_MODEL_REGEX.test(modelId);
const ROLE_OPTIONS = ['system', 'user', 'assistant', 'custom'];

type ChatEntry = {
  role: string;
  content: string;
  customRole?: string;
};

type TemplateBoxProps = {
  modelId: string;
  formattedTemplates: any[];
  selectedTemplate: any;
  showFormattedTemplate: boolean;
  onModelIdChange: (id: string) => void;
  onTemplateChange: (name: string) => void;
  onTemplateEdit: (value: string) => void;
  onFormatToggle: () => void;
  wrapLines: boolean;
  onWrapLinesToggle: () => void;
  chatInputs: ChatEntry[];
  setChatInputs: React.Dispatch<React.SetStateAction<ChatEntry[]>>;
  isModelLoading?: boolean;
};

export default function TemplateBox({
  modelId,
  formattedTemplates,
  selectedTemplate,
  showFormattedTemplate,
  onModelIdChange,
  onTemplateChange,
  onTemplateEdit,
  onFormatToggle,
  wrapLines,
  onWrapLinesToggle,
  chatInputs,
  setChatInputs,
  isModelLoading = false,
}: TemplateBoxProps) {
  const [copied, setCopied] = useState(false);
  const [modelList, setModelList] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    let isActive = true;

    const arraysEqual = (a: string[], b: string[]) =>
      a.length === b.length && a.every((value, index) => value === b[index]);

    const fetchModels = async () => {
      try {
        const res = await fetch('/api/models', { cache: 'no-store' });
        const data = await res.json();
        if (Array.isArray(data)) {
          const filtered = data.filter((m) => !m.includes('❌'));
          if (!isActive) return;
          setModelList((prev) => (arraysEqual(prev, filtered) ? prev : filtered));
        }
      } catch (err) {
        console.error('Failed to load model list:', err);
      }
    };

    fetchModels();
    const intervalId = setInterval(fetchModels, 15000);

    return () => {
      isActive = false;
      clearInterval(intervalId);
    };
  }, []);

  const handleReset = () => {
    if (!selectedTemplate) return;
    onTemplateEdit(
      showFormattedTemplate
        ? selectedTemplate.formattedTemplateUnedited
        : selectedTemplate.templateUnedited
    );
  };

  const handleCopy = () => {
    const value = showFormattedTemplate
      ? selectedTemplate?.formattedTemplate ?? ''
      : selectedTemplate?.template ?? '';
    copy(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const filteredModels = modelList
    .filter((m) => !m.includes('❌'))
    .filter((m) => m.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="relative flex flex-col h-full w-full dark:bg-white/5 rounded-md border border-gray-400 dark:border-white/20 shadow-inner overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-center px-3 py-2 text-sm dark:text-white/60 border-b dark:border-white/10 bg-white dark:bg-gray-900">
        <span>Chat Template</span>
        <div className="flex items-center gap-2">
          {/* Model Dropdown */}
          <div className="relative">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="text-xs px-2 py-1 border rounded dark:border-white/30 dark:text-white bg-white dark:bg-gray-800 min-w-[180px] text-left cursor-pointer"
            >
              {modelId || 'Select model'}
            </button>
            {dropdownOpen && (
              <div className="absolute bg-white dark:bg-gray-900 border border-gray-400 dark:border-white/20 mt-1 max-h-64 overflow-auto z-50 w-full rounded text-xs">
                <div className="sticky top-0 bg-white dark:bg-gray-900 z-10">
                  <input
                    type="text"
                    autoFocus
                    placeholder="Search model..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full px-2 py-1 border-b dark:border-white/20 dark:bg-gray-800 dark:text-white"
                  />
                </div>

                {(search ? filteredModels : modelList).map((m) => (
                  <div
                    key={m}
                    className="px-2 py-1 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700"
                    onClick={() => {
                      onModelIdChange(m);
                      setSearch('');
                      setDropdownOpen(false);
                    }}
                  >
                    {m}
                  </div>
                ))}

                {search && filteredModels.length === 0 && (
                  <div className="px-2 py-1 text-gray-500">No matches</div>
                )}
              </div>
            )}
          </div>

          <span className="text-xs px-2 py-1 border rounded dark:border-white/30 dark:text-white bg-white dark:bg-gray-800">
            Models: {modelList.length}
          </span>

          {formattedTemplates.length > 1 && (
            <select
              value={selectedTemplate?.name}
              onChange={(e) => onTemplateChange(e.target.value)}
              className="text-xs px-2 py-1 border rounded dark:border-white/30 dark:text-white bg-white dark:bg-gray-800 cursor-pointer"
            >
              {formattedTemplates.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>
          )}

          {selectedTemplate &&
            ((showFormattedTemplate
              ? selectedTemplate.formattedTemplate !== selectedTemplate.formattedTemplateUnedited
              : selectedTemplate.template !== selectedTemplate.templateUnedited)) && (
              <button
                onClick={handleReset}
                className="text-xs px-2 py-1 border rounded dark:border-white/30 dark:text-white"
              >
                ⟲ Reset
              </button>
            )}

          <button
            onClick={(e) => {
              if (isGptModel(modelId)) {
                e.preventDefault();
                e.stopPropagation();
                return;
              }
              handleCopy();
            }}
            disabled={isGptModel(modelId) || isModelLoading}
            className={`text-xs px-2 py-1 border rounded dark:border-white/30 dark:text-white ${
              isGptModel(modelId) || isModelLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
            }`}
          >
            {copied ? (
              <span className="text-green-500">Copied!</span>
            ) : (
              <>📋 Copy</>
            )}
          </button>


          <button
            className="text-xs px-2 py-1 border rounded dark:border-white/30 dark:text-white cursor-pointer"
            onClick={onFormatToggle}
            disabled={isModelLoading}
          >
            <span className={showFormattedTemplate ? 'opacity-100' : 'opacity-40'}>
              Formatted
            </span>
          </button>

          <button
            className="text-xs px-2 py-1 border rounded dark:border-white/30 dark:text-white cursor-pointer"
            onClick={onWrapLinesToggle}
            disabled={isModelLoading}
          >
            {wrapLines ? '↩️ Unwrap' : '➡️ Wrap'}
          </button>
        </div>
      </div>

      {/* GPT Inputs */}
      {isGptModel(modelId) && (
        <div className="flex-1 flex flex-col h-full overflow-auto bg-gray-50 dark:bg-gray-800 border-b border-gray-300 dark:border-white/20">
          <div className="p-3">
            <p className="text-sm mb-2 text-gray-700 dark:text-white/70 font-semibold">
              GPT Message Inputs
            </p>
            {chatInputs.map((entry, i) => (
  <div key={i} className="mb-4">
    <div className="flex items-center gap-2 mb-1">
      <select
        value={entry.role}
        onChange={(e) => {
          const newRole = e.target.value;
          setChatInputs((prev) => {
            const updated = [...prev];
            updated[i].role = newRole;
            if (newRole !== 'custom') updated[i].customRole = undefined;
            return updated;
          });
        }}
        className="text-xs px-2 py-1 border rounded dark:border-white/30 dark:text-white bg-white dark:bg-gray-800"
      >
        {ROLE_OPTIONS.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
      {entry.role === 'custom' && (
        <input
          type="text"
          placeholder="Enter custom role"
          value={entry.customRole || ''}
          onChange={(e) => {
            const value = e.target.value;
            setChatInputs((prev) => {
              const updated = [...prev];
              updated[i].customRole = value;
              return updated;
            });
          }}
          className="text-xs px-2 py-1 border rounded text-black dark:border-white/30 dark:text-white bg-white dark:bg-gray-700"
        />
      )}
    </div>
    <textarea
      value={entry.content}
      onChange={(e) => {
        const value = e.target.value;
        setChatInputs((prev) => {
          const updated = [...prev];
          updated[i].content = value;
          return updated;
        });
      }}
      placeholder={`Enter ${entry.role} content...`}
      className="w-full text-xs px-2 py-1 border rounded dark:border-white/30 dark:bg-gray-900 dark:text-white resize-none h-24"
    />
  </div>
))}

{/* ➕ Add Message Button */}
<button
  onClick={() =>
    setChatInputs((prev) => [...prev, { role: 'user', content: '' }])
  }
  className="text-xs px-2 py-1 border rounded dark:border-white/30 dark:text-white bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer transition"
>
  Add Message
</button>

          </div>
        </div>
      )}

      {/* Code Editor */}
      <div className={`flex-1 overflow-auto ${isGptModel(modelId) ? 'hidden' : ''}`}>
        <CodeMirror
          value={
            showFormattedTemplate
              ? selectedTemplate?.formattedTemplate ?? ''
              : selectedTemplate?.template ?? ''
          }
          height="100%"
          extensions={[
            lineNumbers(),
            StreamLanguage.define(jinja2),
            ...(wrapLines ? [EditorView.lineWrapping] : []),
          ]}
          theme="dark"
          onChange={(_value) => onTemplateEdit(_value)}
        />
      </div>

      <LoadingOverlay show={isModelLoading} />
    </div>
  );
}
