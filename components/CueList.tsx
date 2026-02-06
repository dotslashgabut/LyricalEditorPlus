

import React, { useRef, useEffect, useState, useId } from 'react';
import { Cue, Word } from '../types';
import { msToSrt, msToLrc, msToVtt, msToMmSsMmm, timeToMs } from '../utils/timeUtils';
import { AlignLeft, GripVertical, Mic, PlayCircle, Plus, Minus, Trash2, Bold, Italic, AlertCircle, CheckSquare, Square, Volume2, Loader2 } from 'lucide-react';
import { playTTS, stopTTS } from '../services/aiService';

interface CueListProps {
  cues: Cue[];
  onChange: (updatedCues: Cue[]) => void;
  onEditWords: (cueIndex: number) => void;
  currentMillis: number;
  onSeek?: (ms: number, shouldPlay?: boolean, endTime?: number) => void;
  viewMode: 'line' | 'word';
  selectedCueIds: Set<string>;
  onToggleSelection: (id: string, shiftKey: boolean) => void;
  onInsert: (index: number) => void;
  ttsLanguage?: string;
}

// Helper for UI input to handle local state and prevent cursor jumping
const TimeInput = ({ ms, onChange, label, className = '' }: { ms: number, onChange: (val: number) => void, label: string, className?: string }) => {
  // Use msToVtt for UI to display dots for milliseconds
  const [localText, setLocalText] = useState(msToVtt(ms));
  const [isFocused, setIsFocused] = useState(false);
  const inputId = useId();

  useEffect(() => {
    if (!isFocused) {
      setLocalText(msToVtt(ms));
    }
  }, [ms, isFocused]);

  const handleStep = (amount: number) => {
    onChange(Math.max(0, ms + amount));
  };

  const commitChange = () => {
    const val = timeToMs(localText);
    // validation to prevent accidental zeroing on typo
    if (val === 0 && ms !== 0) {
      // rough check if it is really zero
      const digits = localText.replace(/[^\d]/g, '');
      const allZero = digits.length > 0 && Number(digits) === 0;
      if (!allZero && localText.trim() !== '') {
        // invalid input, revert
        setLocalText(msToVtt(ms));
        return;
      }
    }
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
      setLocalText(msToVtt(newVal));
    }
    if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      const newVal = ms + 100;
      onChange(newVal);
      setLocalText(msToVtt(newVal));
    }
  };

  return (
    <div className={`relative group/time ${className}`}>
      <div className="flex items-center gap-1">
        <button
          onClick={() => handleStep(-100)}
          className="h-11 w-11 flex-shrink-0 flex items-center justify-center bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-lg text-neutral-600 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-700 transition"
          tabIndex={-1}
          title="-0.1s"
        >
          <Minus size={16} />
        </button>

        <div className="relative flex-1 min-w-0">
          <input
            id={inputId}
            type="text"
            name={`time-input-${label ? label.toLowerCase().replace(/\s+/g, '-') : 'timmp'}`}
            value={localText}
            onChange={(e) => setLocalText(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => { setIsFocused(false); commitChange(); }}
            onKeyDown={handleKeyDown}
            className="w-full text-center py-2.5 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-lg text-sm md:text-base font-mono text-neutral-700 dark:text-neutral-300 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition shadow-sm"
            placeholder={label}
          />
          <label htmlFor={inputId} className="absolute inset-x-0 bottom-full mb-1 text-center text-[10px] text-neutral-400 uppercase tracking-wider font-semibold opacity-0 group-focus-within/time:opacity-100 transition-opacity cursor-pointer">
            {label}
          </label>
        </div>

        <button
          onClick={() => handleStep(100)}
          className="h-11 w-11 flex-shrink-0 flex items-center justify-center bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-lg text-neutral-600 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-700 transition"
          tabIndex={-1}
          title="+0.1s"
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
};

// Specialized input for Word timestamps
const WordTimeInput = ({ ms, onChange }: { ms: number, onChange: (val: number) => void }) => {
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
      name="word-timestamp"
      aria-label="Word timestamp"
      value={localText}
      onChange={(e) => setLocalText(e.target.value)}
      onFocus={() => setIsFocused(true)}
      onBlur={() => { setIsFocused(false); commitChange(); }}
      onKeyDown={handleKeyDown}
      className="w-20 text-xs font-mono text-center bg-transparent text-neutral-500 focus:text-primary-600 outline-none"
      placeholder="00:00.000"
      onClick={(e) => e.stopPropagation()}
    />
  );
};

// Component for Line Text (Textarea)
const LocalTextarea = ({ value, onChange, className, placeholder, rows, onInsert }: { value: string, onChange: (val: string) => void, className?: string, placeholder?: string, rows?: number, onInsert?: (tag: string) => void }) => {
  const [localText, setLocalText] = useState(value);
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isFocused) {
      setLocalText(value);
    }
  }, [value, isFocused]);

  const handleInsert = (tag: 'b' | 'i') => {
    if (!textareaRef.current) return;
    const start = textareaRef.current.selectionStart;
    const end = textareaRef.current.selectionEnd;
    const text = localText;
    const selected = text.substring(start, end);

    let newText;
    if (selected) {
      newText = text.substring(0, start) + `<${tag}>` + selected + `</${tag}>` + text.substring(end);
    } else {
      newText = text.substring(0, start) + `<${tag}></${tag}>` + text.substring(end);
    }

    setLocalText(newText);
    onChange(newText);
    textareaRef.current.focus();
  };

  return (
    <div className="relative group/textarea">
      <textarea
        name="subtitle-text"
        aria-label="Subtitle text"
        ref={textareaRef}
        value={localText}
        onChange={(e) => setLocalText(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => { setIsFocused(false); if (localText !== value) onChange(localText); }}
        className={className}
        placeholder={placeholder}
        rows={rows}
      />
      <div className="absolute right-2 bottom-2 flex gap-1 opacity-0 group-hover/textarea:opacity-100 group-focus-within/textarea:opacity-100 transition-opacity">
        <button
          onMouseDown={(e) => { e.preventDefault(); handleInsert('b'); }}
          className="p-1.5 bg-neutral-100/80 dark:bg-neutral-800/80 backdrop-blur rounded hover:bg-primary-100 dark:hover:bg-primary-900/40 text-neutral-600 dark:text-neutral-400 hover:text-primary-600 transition"
          title="Bold"
        >
          <Bold size={14} />
        </button>
        <button
          onMouseDown={(e) => { e.preventDefault(); handleInsert('i'); }}
          className="p-1.5 bg-neutral-100/80 dark:bg-neutral-800/80 backdrop-blur rounded hover:bg-primary-100 dark:hover:bg-primary-900/40 text-neutral-600 dark:text-neutral-400 hover:text-primary-600 transition"
          title="Italic"
        >
          <Italic size={14} />
        </button>
      </div>
    </div>
  );
};

// Component for Word Text (Input)
const LocalInput = ({ value, onChange, className, placeholder }: { value: string, onChange: (val: string) => void, className?: string, placeholder?: string }) => {
  const [localText, setLocalText] = useState(value);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setLocalText(value);
    }
  }, [value, isFocused]);

  return (
    <input
      type="text"
      name="word-text"
      aria-label="Word text"
      value={localText}
      onChange={(e) => setLocalText(e.target.value)}
      onFocus={() => setIsFocused(true)}
      onBlur={() => { setIsFocused(false); if (localText !== value) onChange(localText); }}
      className={className}
      placeholder={placeholder}
      onClick={(e) => e.stopPropagation()}
    />
  );
};

// New Component: Insert Separator
const InsertSeparator = ({ onClick }: { onClick: () => void }) => (
  <div className="h-5 flex items-center justify-center group cursor-pointer relative z-10" onClick={onClick} title="Insert new line here">
    <div className="w-full h-px bg-transparent group-hover:bg-primary-200 dark:group-hover:bg-primary-900/50 transition-colors relative flex items-center justify-center">
      <button className="absolute w-6 h-6 rounded-full bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-400 group-hover:text-primary-500 group-hover:border-primary-300 dark:group-hover:border-primary-700 shadow-sm flex items-center justify-center transition-all transform scale-90 group-hover:scale-100 opacity-0 group-hover:opacity-100">
        <Plus size={14} />
      </button>
    </div>
  </div>
);

const CueList: React.FC<CueListProps> = ({ cues, onChange, onEditWords, currentMillis, onSeek, viewMode, selectedCueIds, onToggleSelection, onInsert, ttsLanguage = 'auto' }) => {
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [playingTTSId, setPlayingTTSId] = useState<string | null>(null);

  // Calculate active index
  const activeIndex = cues.findIndex(c => currentMillis >= c.start && currentMillis < c.end);

  // Auto-scroll to active cue
  useEffect(() => {
    if (activeIndex !== -1 && itemRefs.current[activeIndex]) {
      if (draggedIndex === null) {
        itemRefs.current[activeIndex]?.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
      }
    }
  }, [activeIndex, draggedIndex]);

  const updateCue = (index: number, field: keyof Cue, value: string | number) => {
    const newCues = [...cues];
    if (field === 'start' || field === 'end') {
      const msValue = typeof value === 'string' ? timeToMs(value) : value;
      newCues[index] = { ...newCues[index], [field]: msValue };

      // SYNC: If Start time changed, sync First Word Start if it exists
      if (field === 'start') {
        const cue = newCues[index];
        if (cue.words && cue.words.length > 0) {
          const updatedWords = [...cue.words];
          // Update first word start to match line start
          updatedWords[0] = { ...updatedWords[0], start: msValue };
          newCues[index].words = updatedWords;
        }
      }

      // SYNC: If End time changed, sync Last Word End if it exists
      if (field === 'end') {
        const cue = newCues[index];
        if (cue.words && cue.words.length > 0) {
          const updatedWords = [...cue.words];
          const lastIdx = updatedWords.length - 1;
          // Sync the end time of the last word to the new line end time
          updatedWords[lastIdx] = { ...updatedWords[lastIdx], end: msValue as number };
          newCues[index].words = updatedWords;
        }
      }

    } else {
      newCues[index] = { ...newCues[index], [field]: value };
    }
    onChange(newCues);
  };

  const removeCue = (index: number) => {
    const newCues = cues.filter((_, i) => i !== index);
    onChange(newCues);
  };

  const handlePlayTTS = async (id: string, text: string) => {
    // If clicking the currently playing/loading item, stop it
    if (playingTTSId === id) {
      stopTTS();
      setPlayingTTSId(null);
      return;
    }

    // Stop any other active playback first
    if (playingTTSId) {
      stopTTS();
    }

    setPlayingTTSId(id);
    try {
      await playTTS(text, ttsLanguage);
      // If execution finishes normally (audio ended), clear state
      setPlayingTTSId((current) => current === id ? null : current);
    } catch (e) {
      console.error(e);
      // On error or manual abort, ensure state is cleared
      setPlayingTTSId((current) => current === id ? null : current);
    }
  };

  // Drag Handlers
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    setDraggedIndex(index);
    setOverIndex(null);
    e.dataTransfer.effectAllowed = 'move';
    if (itemRefs.current[index]) {
      e.dataTransfer.setDragImage(itemRefs.current[index]!, 20, 20);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault();
    if (draggedIndex === index) return;
    e.dataTransfer.dropEffect = 'move';
    if (overIndex !== index) {
      setOverIndex(index);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) return;

    const newCues = [...cues];
    const [movedItem] = newCues.splice(draggedIndex, 1);
    newCues.splice(dropIndex, 0, movedItem);

    onChange(newCues);
    setDraggedIndex(null);
    setOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setOverIndex(null);
  };

  const getDisplayWords = (cue: Cue, index: number): Word[] => {
    if (cue.words && cue.words.length > 0) return cue.words;
    return cue.text.trim().split(/\s+/).filter(Boolean).map((text, i) => ({
      id: `gen-${cue.id}-${i}`,
      text,
      start: cue.start + (i * 200),
      end: cue.start + ((i + 1) * 200)
    }));
  };

  const updateWordInCue = (cueIndex: number, wordIndex: number, field: keyof Word, value: string | number) => {
    const cue = cues[cueIndex];
    let words = getDisplayWords(cue, cueIndex);
    const updatedWords = [...words];

    let msVal = value;
    if (field === 'start' || field === 'end') {
      msVal = typeof value === 'string' ? timeToMs(value) : value;
    }

    updatedWords[wordIndex] = { ...updatedWords[wordIndex], [field]: msVal };

    const newText = updatedWords.map(w => w.text).join(' ');
    const newCues = [...cues];
    newCues[cueIndex] = { ...cue, words: updatedWords, text: newText };

    // SYNC: If First Word Start changed, sync Line Start
    if (wordIndex === 0 && field === 'start') {
      newCues[cueIndex].start = msVal as number;
    }

    onChange(newCues);
  };

  return (
    <div className="w-full flex flex-col">
      {cues.map((cue, index) => {
        const isActive = activeIndex === index;
        const isDragging = draggedIndex === index;
        const isSelected = selectedCueIds.has(cue.id);

        // --- Overlap Detection (Lines) ---
        // Check if current start is less than previous end
        const prevCue = index > 0 ? cues[index - 1] : null;
        const isLineOverlap = prevCue && (cue.start < prevCue.end - 1); // 1ms tolerance

        return (
          <React.Fragment key={cue.id}>
            <InsertSeparator onClick={() => onInsert(index)} />
            <div
              ref={el => { itemRefs.current[index] = el; }}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={(e) => handleDrop(e, index)}
              className={`
                  group relative rounded-2xl p-5 md:p-6 transition-all duration-300 flex flex-col md:flex-row gap-6 md:gap-10 items-start border
                  ${isActive
                  ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-400 dark:border-primary-600 shadow-xl shadow-primary-500/10 scale-[1.01] z-10'
                  : isSelected
                    ? 'bg-blue-50 dark:bg-blue-900/10 border-blue-300 dark:border-blue-700'
                    : 'bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 shadow-sm hover:shadow-md'
                }
                  ${isDragging ? 'opacity-40 border-dashed border-primary-500' : ''}
                  cursor-default
                `}
            >
              {/* Drag Insertion Indicator */}
              {draggedIndex !== null && overIndex === index && draggedIndex !== index && (
                <div
                  className={`absolute left-0 right-0 h-1 bg-primary-500 rounded-full shadow-sm shadow-primary-500/50 z-20 pointer-events-none transition-all duration-200
                      ${draggedIndex < index ? '-bottom-2 md:-bottom-3' : '-top-2 md:-top-3'}
                    `}
                >
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-2 h-2 bg-primary-500 rounded-full"></div>
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 bg-primary-500 rounded-full"></div>
                </div>
              )}

              {/* Selection Checkbox */}
              <div className="absolute -left-3 md:-left-4 top-1/2 -translate-y-1/2 z-20">
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleSelection(cue.id, e.shiftKey); }}
                  className={`p-1.5 rounded-lg transition-all ${isSelected ? 'text-blue-600 bg-white shadow-sm dark:bg-neutral-800 dark:text-blue-400' : 'text-neutral-300 hover:text-neutral-500 dark:text-neutral-700 dark:hover:text-neutral-500'}`}
                >
                  {isSelected ? <CheckSquare size={20} fill="currentColor" className="text-blue-100 dark:text-blue-900" /> : <Square size={20} />}
                </button>
              </div>

              {/* Desktop Index & Grip */}
              <div
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragEnd={handleDragEnd}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-300 dark:text-neutral-700 hidden md:flex items-center gap-2 cursor-grab active:cursor-grabbing hover:text-primary-500 transition-colors p-2 -ml-2 select-none"
              >
                <GripVertical size={20} />
                <span className={`text-sm font-mono font-medium min-w-[1.5rem] flex items-center gap-1 ${isActive ? 'text-primary-600' : ''}`}>
                  {index + 1}
                  {isLineOverlap && (
                    <div className="text-red-500 animate-pulse" title={`Overlap warning: Starts before Line ${index} ends`}>
                      <AlertCircle size={14} />
                    </div>
                  )}
                </span>
              </div>

              {/* Mobile Index / Handle */}
              <div
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragEnd={handleDragEnd}
                className="md:hidden absolute top-3 left-4 text-xs font-mono font-bold text-neutral-400 flex items-center gap-1 cursor-grab active:cursor-grabbing p-2 -m-2 select-none touch-none"
              >
                <GripVertical size={16} />
                #{index + 1}
                {isLineOverlap && <AlertCircle size={14} className="text-red-500" />}
              </div>

              {/* Timing Controls */}
              {/* Added extra margin to prevent overlap with index/grip on desktop */}
              <div className="flex flex-col gap-3 w-full md:w-64 mt-8 md:mt-0 md:ml-20 shrink-0">
                <div className="flex flex-row md:flex-col gap-3">
                  <TimeInput
                    ms={cue.start}
                    onChange={(val) => updateCue(index, 'start', val)}
                    label="Start"
                    className={`flex-1 ${isLineOverlap ? 'ring-1 ring-red-500 rounded-lg' : ''}`}
                  />
                  <TimeInput
                    ms={cue.end}
                    onChange={(val) => updateCue(index, 'end', val)}
                    label="End"
                    className="flex-1"
                  />
                </div>

                {onSeek && (
                  <button
                    onClick={() => onSeek(cue.start, true, cue.end)}
                    className="mt-1 w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 hover:bg-primary-100 dark:hover:bg-primary-900/40 text-neutral-600 dark:text-neutral-400 hover:text-primary-600 transition text-sm font-medium"
                    title="Play from this line"
                  >
                    <PlayCircle size={18} /> Play Line
                  </button>
                )}
              </div>

              {/* Text Content */}
              <div className="flex-1 w-full relative">
                <div className="absolute left-4 top-4 text-neutral-400 pointer-events-none">
                  <AlignLeft size={20} />
                </div>

                {viewMode === 'word' ? (
                  <div className="pl-12 w-full">
                    <div className="flex flex-wrap gap-2">
                      {getDisplayWords(cue, index).map((word, wIdx, allWords) => {
                        const wordStart = word.start || 0;
                        const wordEnd = word.end || (wordStart + 300);
                        const isWordActive = currentMillis >= wordStart && currentMillis < wordEnd;
                        const wordUniqueId = word.id || `w-${index}-${wIdx}`;

                        // --- Overlap Detection (Words) ---
                        const prevWord = wIdx > 0 ? allWords[wIdx - 1] : null;
                        const isOverlap = prevWord && (wordStart < (prevWord.end || 0) - 1);
                        const isOutOfOrder = prevWord && (wordStart < (prevWord.start || 0));
                        const isInvalidDuration = wordStart > wordEnd;
                        const isLineEndIssue = (wIdx === allWords.length - 1) && (wordEnd > cue.end);

                        const hasIssue = isOverlap || isOutOfOrder || isInvalidDuration || isLineEndIssue;
                        let issueTitle = "Click to play";
                        if (isOverlap) issueTitle = "Overlap: Starts before previous word ends";
                        if (isOutOfOrder) issueTitle = "Out of Order: Starts before previous word starts";
                        if (isInvalidDuration) issueTitle = "Invalid: End time is before start time";
                        if (isLineEndIssue) issueTitle = "Overflow: Word ends after line ends";

                        const isSpeaking = playingTTSId === wordUniqueId;

                        return (
                          <div
                            key={wordUniqueId}
                            onClick={(e) => {
                              e.stopPropagation();
                              onSeek && onSeek(wordStart, true, wordEnd);
                            }}
                            title={issueTitle}
                            className={`flex flex-col items-center p-2 rounded-lg border transition-all duration-200 cursor-pointer select-none relative pb-3
                                    ${isWordActive
                                ? 'bg-primary-100 dark:bg-primary-900/40 border-primary-500 scale-105 shadow-md z-10'
                                : hasIssue
                                  ? 'bg-red-50 dark:bg-red-900/20 border-red-400 dark:border-red-600'
                                  : 'bg-neutral-100 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 hover:border-primary-300 dark:hover:border-primary-700'
                              }
                                `}
                          >
                            {/* Word Overlap Indicator */}
                            {hasIssue && (
                              <div className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 z-20 shadow-sm">
                                <AlertCircle size={10} />
                              </div>
                            )}

                            <div className="flex items-center gap-1 mb-1 bg-white dark:bg-neutral-900 rounded border border-neutral-200 dark:border-neutral-700 p-0.5" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={(e) => { e.stopPropagation(); updateWordInCue(index, wIdx, 'start', wordStart - 100); }}
                                className="p-1 text-neutral-400 hover:text-primary-600 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition"
                                title="-0.1s"
                              >
                                <Minus size={10} />
                              </button>
                              <WordTimeInput
                                ms={wordStart}
                                onChange={(val) => updateWordInCue(index, wIdx, 'start', val)}
                              />
                              <button
                                onClick={(e) => { e.stopPropagation(); updateWordInCue(index, wIdx, 'start', wordStart + 100); }}
                                className="p-1 text-neutral-400 hover:text-primary-600 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition"
                                title="+0.1s"
                              >
                                <Plus size={10} />
                              </button>
                            </div>
                            <LocalInput
                              value={word.text}
                              onChange={(val) => updateWordInCue(index, wIdx, 'text', val)}
                              className={`w-24 text-sm font-medium text-center bg-transparent border-b border-transparent outline-none transition
                                        ${isWordActive ? 'text-primary-700 dark:text-primary-300 font-bold' : 'text-neutral-900 dark:text-neutral-100 focus:text-primary-600 focus:border-primary-500'}
                                    `}
                              placeholder="word"
                            />

                            {/* TTS Button for Word */}
                            <button
                              onClick={(e) => { e.stopPropagation(); handlePlayTTS(wordUniqueId, word.text); }}
                              className="absolute -bottom-2.5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-full p-1 text-neutral-400 hover:text-primary-600 shadow-sm z-20"
                              title={isSpeaking ? "Stop" : "Speak Word"}
                            >
                              {isSpeaking ? <Square size={10} fill="currentColor" className="text-primary-500" /> : <Volume2 size={10} />}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    <p className="mt-2 text-xs text-neutral-400">
                      Click words to play. Edit timings above. First word syncs with line start.
                    </p>
                    <div className="flex items-center gap-3 mt-4">
                      <button
                        onClick={() => removeCue(index)}
                        className="ml-auto text-sm text-red-500 hover:text-red-600 px-3 py-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition font-medium flex items-center gap-1"
                      >
                        <Trash2 size={16} /> Delete
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <LocalTextarea
                      rows={2}
                      value={cue.text}
                      onChange={(val) => updateCue(index, 'text', val)}
                      className={`
                          w-full pl-12 pr-4 py-4 rounded-xl border outline-none resize-none transition leading-relaxed
                          ${isActive
                          ? 'bg-white dark:bg-neutral-950 border-primary-200 dark:border-primary-800 text-primary-900 dark:text-white font-medium ring-2 ring-primary-100 dark:ring-primary-900/20'
                          : 'bg-neutral-50 dark:bg-neutral-950 border-neutral-200 dark:border-neutral-800 text-neutral-800 dark:text-neutral-200 focus:ring-2 focus:ring-primary-500 focus:border-transparent'
                        }
                          text-lg md:text-xl
                        `}
                      placeholder="Subtitle text..."
                    />
                    <div className="flex items-center gap-3 mt-3">
                      <button
                        onClick={() => onEditWords(index)}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 hover:text-primary-600 transition text-sm font-medium"
                        title="Edit Word Timestamps (Karaoke)"
                      >
                        <Mic size={16} />
                        <span>Word Timing</span>
                        {/* Fix: Strictly check if words array exists and has items */}
                        {cue.words && Array.isArray(cue.words) && cue.words.length > 0 ? <span className="w-2 h-2 rounded-full bg-green-500 ml-1"></span> : null}
                      </button>

                      {/* TTS Button for Line */}
                      <button
                        onClick={() => handlePlayTTS(cue.id, cue.text)}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 hover:text-primary-600 transition text-sm font-medium"
                        title={playingTTSId === cue.id ? "Stop TTS" : "Speak Line (TTS)"}
                      >
                        {playingTTSId === cue.id ? <Square size={16} fill="currentColor" className="text-primary-500" /> : <Volume2 size={16} />}
                        <span className="hidden sm:inline">{playingTTSId === cue.id ? "Stop" : "Speak"}</span>
                      </button>

                      <button
                        onClick={() => removeCue(index)}
                        className="ml-auto text-sm text-red-500 hover:text-red-600 px-3 py-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition font-medium flex items-center gap-1"
                      >
                        <span className="hidden sm:inline">Delete</span>
                        <span className="sm:hidden">Del</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </React.Fragment>
        );
      })}
      {/* Final separator at the bottom */}
      <InsertSeparator onClick={() => onInsert(cues.length)} />

      {/* Big Add Button at the end */}
      <button
        onClick={() => onInsert(cues.length)}
        className="w-full py-6 mt-4 border-2 border-dashed border-neutral-300 dark:border-neutral-800 rounded-2xl text-neutral-400 hover:text-primary-600 hover:border-primary-400 hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition flex flex-col items-center justify-center gap-2 group"
      >
        <div className="p-2 bg-neutral-100 dark:bg-neutral-800 rounded-full group-hover:bg-primary-100 dark:group-hover:bg-primary-900/30 transition">
          <Plus size={24} />
        </div>
        <span className="font-medium">Add New Line</span>
      </button>
    </div>
  );
};

export default CueList;