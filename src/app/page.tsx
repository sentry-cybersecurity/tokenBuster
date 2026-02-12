'use client';

import { getTokenizerType } from '@/utils/models/tokenizer';
import { useEffect, useState } from 'react';
import JSONEditorBox from '@/components/JSONBox/JSONEditorBox';
import TemplateBox from '@/components/TemplateBox/TemplateBox';
import RenderBox from '@/components/RenderedBox/RenderBox';
import TokenizerOutput from '@/components/TokenizerOutput/TokenizerOutput';
import { getExampleHelloWorld } from '@/example-inputs/helloWorld';
import { getExampleReasoning } from '@/example-inputs/reasoning';
import { getExampleToolUsage } from '@/example-inputs/toolUsage';
import { Template } from '@huggingface/jinja';

const exampleInputOptions = [
  { key: 'helloWorld', label: 'Hello World', getExample: getExampleHelloWorld },
  { key: 'reasoning', label: 'Reasoning', getExample: getExampleReasoning },
  { key: 'toolUsage', label: 'Tool Usage', getExample: getExampleToolUsage },
];


const defaultExampleKey = 'helloWorld';

function fillMissingVariables(inputObj: any, templateStr: string) {
  const regex = /{{\s*([\w.]+)\s*([+*/-])\s*([\w.]*)\s*}}/g;
  let match;
  while ((match = regex.exec(templateStr)) !== null) {
    const [var1, var2] = match;
    if (var1 && inputObj[var1] === undefined) inputObj[var1] = 0;
    if (var2 && inputObj[var2] === undefined) inputObj[var2] = 0;
  }
  return inputObj;
}

function tokenize(text: string) {
  return text.split(' ').map((word, idx) => ({
    id: idx,
    text: word,
    color: `hsl(${(idx * 37) % 360}, 70%, 80%)`
  }));
}

function formatChatInputsForGptPrompt(
  chatInputs: { role: string; content: string; customRole?: string }[],
  modelId: string
): string {
  const isGpt3 = modelId === 'gpt-3.5-turbo';
  const msgSep = isGpt3 ? '\n' : '';
  const roleSep = isGpt3 ? '\n' : '<|im_sep|>';

  const body = chatInputs
    .map(({ role, customRole, content }) => {
      const roleLabel = customRole || role;
      return `<|im_start|>${roleLabel}${roleSep}${content}<|im_end|>`;
    })
    .join(msgSep);

  return [body, `<|im_start|>assistant${roleSep}`].join(msgSep);
}

export default function HomePage() {
  const [chatInputs, setChatInputs] = useState([
    { role: 'system', content: 'You are a helpful assistant' }
  ]);
  const [inputs, setInputs] = useState({ JSON: '', Template: '' });
  const [output, setOutput] = useState('');
  const [outputError, setOutputError] = useState<string | undefined>(undefined);
  const [, setTokens] = useState<{ id: number; text: string; color: string }[]>([]);
  const [selectedExampleKey, setSelectedExampleKey] = useState(defaultExampleKey);
  const [modelId, setModelId] = useState('deepseek-ai/DeepSeek-R1');
  const [formattedTemplates, setFormattedTemplates] = useState<any[]>([]);
  const [selectedTemplateName, setSelectedTemplateName] = useState('');
  const [showFormattedTemplate, setShowFormattedTemplate] = useState(true);
  const [editedTemplate, setEditedTemplate] = useState('');
  const [wrapLines, setWrapLines] = useState(true);
  const [exampleError, setExampleError] = useState<string | undefined>(undefined);
  const [gptMessageMode, setGptMessageMode] = useState(false); // 🆕
  const [isModelDataLoading, setIsModelDataLoading] = useState(false);
  const [isTokenizerModalOpen, setIsTokenizerModalOpen] = useState(false);




  useEffect(() => {
    async function fetchTemplates() {
      setIsModelDataLoading(true);
      // Step 1: Detect GPT-like models *before* fetching
      const modelName = modelId.toLowerCase();
      const gptLikeModels = [
        'openai/gpt-3.5-turbo',
        'openai/gpt-4',
        'gpt-4',
        'gpt-3.5',
        'claude',
        'anthropic',
        'meta-llama',
        'mistralai/mixtral',
        'google/gemini',
        'deepseek-chat',
        'phind',
      ];
      const isGptLike = gptLikeModels.some(name => modelName.includes(name));
      setGptMessageMode(isGptLike);

      if (isGptLike) {
        // Skip fetch if GPT-like
        setFormattedTemplates([]);
        setSelectedTemplateName('');
        setEditedTemplate('');
        setIsModelDataLoading(false);
        return;
      }

      // Step 2: Fetch template metadata for non-GPT models
      try {
        const res = await fetch(`/api/model_metadata/${modelId}/metadata.json`);
        const model = await res.json();

        let chatTemplate = model.config?.chat_template_jinja ||
          model.config?.processor_config?.chat_template ||
          model.config?.tokenizer_config?.chat_template ||
          model.gguf?.chat_template || '';

        if (
          model.config?.additional_chat_templates &&
          Object.keys(model.config.additional_chat_templates).length > 0
        ) {
          chatTemplate = [
            { name: 'default', template: model.config.chat_template_jinja || chatTemplate },
            ...Object.entries(model.config.additional_chat_templates).map(([name, tpl]: any) => ({
              name,
              template: tpl
            }))
          ];
        } else if (typeof chatTemplate === 'string') {
          chatTemplate = [{ name: 'default', template: chatTemplate }];
        }

        const formatted = (Array.isArray(chatTemplate) ? chatTemplate : [])
          .filter(({ template }) => typeof template === 'string')
          .map(({ name, template }) => {
            const formattedTemplate = template
              .replace(/{%/g, '{%')
              .replace(/%}/g, '%}\n')
              .replace(/{{/g, '{{')
              .replace(/}}/g, '}}\n');

            return {
              name,
              template,
              formattedTemplate,
              templateUnedited: template,
              formattedTemplateUnedited: formattedTemplate
            };
          });

        setFormattedTemplates(formatted);
        setSelectedTemplateName(formatted[0]?.name || '');
        setEditedTemplate(formatted[0]?.template || '');
      } catch (error) {
        console.error('Error fetching metadata:', error);
        setFormattedTemplates([]);
        setSelectedTemplateName('');
        setEditedTemplate('');
      } finally {
        setIsModelDataLoading(false);
      }
    }

    fetchTemplates();
  }, [modelId]);


  const selectedTemplate = formattedTemplates.find(t => t.name === selectedTemplateName);
  const gptFormattedPrompt = gptMessageMode
    ? formatChatInputsForGptPrompt(chatInputs, modelId)
    : output;

  useEffect(() => {
    const selected = exampleInputOptions.find(opt => opt.key === defaultExampleKey);
    if (selected && selectedTemplate) {
      setInputs(prev => ({
        ...prev,
        JSON: JSON.stringify(selected.getExample(selectedTemplate.template), null, 2),
      }));
    }
  }, [selectedTemplate]);

  useEffect(() => {
    try {
      setOutputError(undefined);
      if (!inputs.JSON || !editedTemplate) return;
      const inputObj = fillMissingVariables(JSON.parse(inputs.JSON), editedTemplate);
      const template = new Template(showFormattedTemplate && selectedTemplate ? selectedTemplate.formattedTemplate : editedTemplate);
      const rendered = template.render(inputObj);
      setOutput(rendered);
      setTokens(tokenize(rendered));
    } catch (e: any) {
      setOutput('');
      setTokens([]);
      setOutputError(e?.message || 'Render error');
    }
  }, [inputs.JSON, editedTemplate, showFormattedTemplate, selectedTemplate]);

  useEffect(() => {
    if (!isTokenizerModalOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsTokenizerModalOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isTokenizerModalOpen]);

  return (
    <main className="relative pt-14 min-h-screen bg- dark:bg-dark-500 dark:text-white font-tinos">
      <div className="grid grid-cols-1 md:grid-cols-2 md:grid-rows-2 gap-4 p-4 h-[calc(100vh-3.5rem)]">
        <div className="md:row-span-2">
          <TemplateBox
            modelId={modelId}
            formattedTemplates={formattedTemplates}
            selectedTemplate={selectedTemplate}
            showFormattedTemplate={showFormattedTemplate}
            onModelIdChange={setModelId}
            onTemplateChange={templateName => {
              setSelectedTemplateName(templateName);
              const templateObj = formattedTemplates.find(t => t.name === templateName);
              if (templateObj) setEditedTemplate(templateObj.template);
            }}
            onTemplateEdit={newValue => {
              setEditedTemplate(newValue);
              setInputs(prev => ({ ...prev, Template: newValue }));
            }}
            onFormatToggle={() => setShowFormattedTemplate(prev => !prev)}
            wrapLines={wrapLines}
            onWrapLinesToggle={() => setWrapLines(prev => !prev)}
            chatInputs={chatInputs}
            setChatInputs={setChatInputs}
            isModelLoading={isModelDataLoading}
          />
        </div>

        <JSONEditorBox
          value={inputs.JSON}
          onChange={val => setInputs(prev => ({ ...prev, JSON: val }))}
          exampleOptions={exampleInputOptions.map(({ key, label }) => ({ key, label }))}
          selectedExampleKey={selectedExampleKey}
          onExampleChange={key => {
            const selected = exampleInputOptions.find(opt => opt.key === key);
            setSelectedExampleKey(key);

            if (selected && selectedTemplate) {
              try {
                const example = selected.getExample(selectedTemplate.template);
                const json = JSON.stringify(example, null, 2);

                const inputObj = fillMissingVariables(example, selectedTemplate.template);
                const template = new Template(selectedTemplate.template);
                template.render(inputObj);

                setInputs(prev => ({ ...prev, JSON: json }));
                setExampleError(undefined);
              } catch (err: any) {
                console.error('Template rendering failed:', err.message);
                setInputs(prev => ({ ...prev, JSON: '' }));
                setExampleError(
                  'This model or template likely does not support structured reasoning or tool usage!'
                );
              }
            }
          }}
          exampleError={exampleError}
          loading={isModelDataLoading}
          disabled={gptMessageMode}
        />

        <RenderBox
          chatInputs={gptMessageMode ? chatInputs : undefined}
          modelId={modelId}
          content={gptMessageMode ? '' : output}
          error={outputError}
          loading={isModelDataLoading}
        />
      </div>

      <button
        onClick={() => setIsTokenizerModalOpen(true)}
        className="fixed bottom-5 right-5 z-40 text-xs md:text-sm px-4 py-2 rounded border border-gray-400 dark:border-white/30 bg-white dark:bg-gray-900 dark:text-white shadow-lg cursor-pointer"
      >
        Tokenizer Output
      </button>

      {isTokenizerModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center p-3 md:p-6">
          <div className="w-full max-w-5xl h-[75vh] md:h-[80vh] bg-white dark:bg-gray-950 rounded-lg border border-gray-300 dark:border-white/20 shadow-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-300 dark:border-white/20">
              <h2 className="text-sm md:text-base font-semibold dark:text-white">Tokenizer Output</h2>
              <button
                onClick={() => setIsTokenizerModalOpen(false)}
                className="text-xs md:text-sm px-3 py-1 rounded border border-gray-400 dark:border-white/30 dark:text-white cursor-pointer"
              >
                Close
              </button>
            </div>
            <div className="flex-1 p-4 overflow-hidden">
              <TokenizerOutput
                input={gptFormattedPrompt}
                model={modelId}
                type={getTokenizerType(modelId)}
                externalLoading={isModelDataLoading}
              />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
