import React, { useState } from 'react';
import { X, Sparkles, Wand2, Loader2, Send } from 'lucide-react';
import { generateLyrics, refineLyrics } from '../services/aiService';
import { Cue } from '../types';

interface AIAssistantProps {
  cues: Cue[];
  onApply: (cues: Cue[]) => void;
  onClose: () => void;
}

const AIAssistant: React.FC<AIAssistantProps> = ({ cues, onApply, onClose }) => {
  const [mode, setMode] = useState<'generate' | 'refine'>('refine');
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [model, setModel] = useState('gemini-3-flash-preview');

  const handleAction = async () => {
    if (!prompt.trim()) return;
    setIsLoading(true);
    try {
      let resultCues: Cue[] = [];
      
      if (mode === 'generate') {
        const newCues = await generateLyrics(prompt, model);
        
        if (cues.length === 0) {
            resultCues = newCues;
        } else {
            // Re-time new cues to start after last cue
            const lastEnd = cues[cues.length - 1].end;
            const shiftedNewCues = newCues.map((c, i) => ({
                ...c,
                start: lastEnd + (c.start),
                end: lastEnd + (c.end)
            }));
            resultCues = [...cues, ...shiftedNewCues];
        }
      } else {
        // Refine
        resultCues = await refineLyrics(cues, prompt, model);
      }
      
      onApply(resultCues);
      onClose();
    } catch (e) {
      console.error(e);
      alert("AI Operation failed. Please check your API key or try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl w-full max-w-lg border border-neutral-200 dark:border-neutral-800 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-5 border-b border-neutral-200 dark:border-neutral-800 flex justify-between items-center bg-neutral-50 dark:bg-neutral-800/50">
          <h3 className="font-bold text-lg flex items-center gap-2 text-neutral-800 dark:text-neutral-100">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-primary-500 to-orange-600 text-white shadow-sm">
                <Sparkles size={16} />
            </div>
            AI Assistant
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-full transition text-neutral-500 dark:text-neutral-400">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 flex flex-col gap-5">
           
           {/* Mode Tabs */}
           <div className="flex p-1 bg-neutral-100 dark:bg-neutral-800 rounded-xl">
              <button 
                onClick={() => setMode('refine')}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2 ${mode === 'refine' ? 'bg-white dark:bg-neutral-700 shadow-sm text-neutral-900 dark:text-white' : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'}`}
              >
                <Wand2 size={16} className={mode === 'refine' ? 'text-primary-500' : ''} /> Refine Lyrics
              </button>
              <button 
                onClick={() => setMode('generate')}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2 ${mode === 'generate' ? 'bg-white dark:bg-neutral-700 shadow-sm text-neutral-900 dark:text-white' : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'}`}
              >
                <Sparkles size={16} className={mode === 'generate' ? 'text-primary-500' : ''} /> Generate New
              </button>
           </div>

           {/* Model Selection */}
           <div className="flex flex-col gap-1.5">
             <label className="text-xs font-bold uppercase text-neutral-500 dark:text-neutral-400 tracking-wider">Model</label>
             <div className="relative">
                 <select 
                   value={model}
                   onChange={(e) => setModel(e.target.value)}
                   className="w-full pl-4 pr-10 py-3 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary-500 text-neutral-900 dark:text-neutral-100 appearance-none"
                 >
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                    <option value="gemini-3-flash-preview">Gemini 3.0 Flash</option>
                    <option value="gemini-3-pro-preview">Gemini 3.0 Pro</option>
                 </select>
                 <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-500">
                     <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                 </div>
             </div>
           </div>

           {/* Prompt Input */}
           <div className="flex-1 flex flex-col gap-1.5 min-h-[150px]">
             <label className="text-xs font-bold uppercase text-neutral-500 dark:text-neutral-400 tracking-wider">
               {mode === 'refine' ? 'Instructions' : 'Prompt'}
             </label>
             <textarea 
               value={prompt}
               onChange={(e) => setPrompt(e.target.value)}
               placeholder={mode === 'refine' ? "e.g., Translate to Spanish, Fix grammar, Make it rhyme..." : "e.g., A heartbreak song about rainy days in London..."}
               className="flex-1 w-full p-4 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl outline-none focus:ring-2 focus:ring-primary-500 resize-none text-base text-neutral-900 dark:text-neutral-100 placeholder-neutral-400"
             />
           </div>
           
           <button 
             onClick={handleAction}
             disabled={isLoading || !prompt.trim()}
             className="w-full py-4 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold text-base shadow-lg shadow-primary-500/30 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
           >
             {isLoading ? <Loader2 className="animate-spin" /> : <Send size={18} />}
             {isLoading ? 'Processing...' : (mode === 'refine' ? 'Refine Text' : 'Generate Lyrics')}
           </button>
        </div>

      </div>
    </div>
  );
};

export default AIAssistant;