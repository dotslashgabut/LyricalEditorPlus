import React, { useState, useEffect } from 'react';
import { Word, Cue } from '../types';
import { msToLrc, msToMmSsMmm, timeToMs } from '../utils/timeUtils';
import { X, Check, Plus, Trash2, Minus, Ban } from 'lucide-react';

interface WordDetailProps {
  cue: Cue;
  onSave: (words: Word[] | undefined) => void;
  onClose: () => void;
}

// Local component to handle input state for timestamps to avoid cursor jumping
const LocalTimeInput = ({ ms, onChange }: { ms: number, onChange: (val: number) => void }) => {
  // Use msToMmSsMmm for 3 digit precision (00:00.000)
  const [localText, setLocalText] = useState(msToMmSsMmm(ms));
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setLocalText(msToMmSsMmm(ms));
    }
  }, [ms, isFocused]);

  const commitChange = () => {
    const val = timeToMs(localText);
    onChange(val);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
      return;
    }
    // Handle +/- shortcuts
    if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      const newVal = Math.max(0, ms - 100);
      onChange(newVal);
      setLocalText(msToMmSsMmm(newVal));
    }
    if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      const newVal = ms + 100;
      onChange(newVal);
      setLocalText(msToMmSsMmm(newVal));
    }
  };

  return (
    <input
      type="text"
      name="word-time-detail"
      aria-label="Word timestamp"
      value={localText}
      onChange={(e) => setLocalText(e.target.value)}
      onFocus={() => setIsFocused(true)}
      onBlur={() => { setIsFocused(false); commitChange(); }}
      onKeyDown={handleKeyDown}
      className="w-24 px-2 py-2 bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg font-mono text-base text-center focus:ring-2 focus:ring-primary-500 outline-none"
      placeholder="00:00.000"
    />
  );
};

const WordDetail: React.FC<WordDetailProps> = ({ cue, onSave, onClose }) => {
  // Initialize words from cue, or split text if no words exist
  const [localWords, setLocalWords] = useState<Word[]>([]);

  useEffect(() => {
    if (cue.words && cue.words.length > 0) {
      setLocalWords(cue.words);
    } else {
      // Auto-split text into words for convenience
      const generatedWords = cue.text.split(/\s+/).map((w, i) => ({
        id: `gen-${i}`,
        text: w,
        start: cue.start + (i * 200), // Approximate staggered start
        end: cue.start + ((i + 1) * 200)
      }));
      setLocalWords(generatedWords);
    }
  }, [cue]);

  const updateWord = (index: number, field: keyof Word, value: any) => {
    const newWords = [...localWords];
    if (field === 'start') {
      newWords[index] = { ...newWords[index], start: value }; // value is already ms from LocalTimeInput
    } else if (field === 'text') {
      newWords[index] = { ...newWords[index], text: value };
    }
    setLocalWords(newWords);
  };

  const stepTime = (index: number, amount: number) => {
    const newWords = [...localWords];
    const current = newWords[index].start || 0;
    newWords[index] = { ...newWords[index], start: Math.max(0, current + amount) };
    setLocalWords(newWords);
  };

  const addWord = () => {
    setLocalWords([...localWords, { id: `new-${Date.now()}`, text: 'New', start: cue.start }]);
  };

  const removeWord = (index: number) => {
    setLocalWords(localWords.filter((_, i) => i !== index));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-neutral-200 dark:border-neutral-800 flex flex-col max-h-[90vh]">
        <div className="p-5 border-b border-neutral-200 dark:border-neutral-800 flex justify-between items-center bg-neutral-50 dark:bg-neutral-800/50">
          <h3 className="font-bold text-xl">Edit Words</h3>
          <button onClick={onClose} className="p-2 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-full transition">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          <div className="text-base text-neutral-500 dark:text-neutral-400 mb-6 bg-primary-50 dark:bg-primary-900/20 p-4 rounded-xl border border-primary-100 dark:border-primary-800">
            Base line time: <span className="font-mono font-bold text-neutral-700 dark:text-neutral-300">{msToMmSsMmm(cue.start)}</span>
            <br />
            Enhanced LRC uses word start times.
          </div>

          {localWords.map((word, index) => (
            <div key={word.id} className="flex gap-3 items-center group animate-fadeIn">
              <span className="text-sm text-neutral-400 w-8 text-center font-mono">{index + 1}</span>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => stepTime(index, -100)}
                  className="p-2 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-lg text-neutral-500 border border-neutral-300 dark:border-neutral-700 transition"
                  title="-0.1s"
                >
                  <Minus size={16} />
                </button>
                <LocalTimeInput
                  ms={word.start || 0}
                  onChange={(val) => updateWord(index, 'start', val)}
                />
                <button
                  onClick={() => stepTime(index, 100)}
                  className="p-2 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-lg text-neutral-500 border border-neutral-300 dark:border-neutral-700 transition"
                  title="+0.1s"
                >
                  <Plus size={16} />
                </button>
              </div>

              <input
                type="text"
                name="word-text-detail"
                aria-label="Word text"
                value={word.text}
                onChange={(e) => updateWord(index, 'text', e.target.value)}
                className="flex-1 px-4 py-2 bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-base focus:ring-2 focus:ring-primary-500 outline-none"
              />

              <button
                onClick={() => removeWord(index)}
                className="p-2 text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition opacity-0 group-hover:opacity-100 focus:opacity-100"
              >
                <Trash2 size={20} />
              </button>
            </div>
          ))}

          <button
            onClick={addWord}
            className="w-full py-3 border-2 border-dashed border-neutral-300 dark:border-neutral-700 rounded-xl text-neutral-500 hover:text-primary-600 hover:border-primary-400 hover:bg-primary-50 dark:hover:bg-neutral-800 transition flex items-center justify-center gap-2 text-base font-medium mt-4"
          >
            <Plus size={20} /> Add Word
          </button>
        </div>

        <div className="p-5 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/50 flex justify-between items-center">
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSave(undefined); }}
            className="px-4 py-2.5 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl text-sm font-medium transition flex items-center gap-2"
            title="Remove word-level timing data for this line"
          >
            <Ban size={18} />
            <span className="hidden sm:inline">Clear Timing</span>
            <span className="sm:hidden">Clear</span>
          </button>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2.5 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-xl text-base font-medium transition"
            >
              Cancel
            </button>
            <button
              onClick={() => onSave(localWords)}
              className="px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-base font-medium transition shadow-lg shadow-primary-500/30 flex items-center gap-2"
            >
              <Check size={20} /> Apply Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WordDetail;