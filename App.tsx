

import React, { useState, useEffect, useRef } from 'react';
import { FileData, SubtitleFormat, Cue, Word, Metadata } from './types';
import { detectFormat, parseContent, stringifyContent } from './services/subtitleParser';
import { msToLrc } from './utils/timeUtils';
import { transcribeAudio, generateLyrics } from './services/aiService';
import CueList from './components/CueList';
import WordDetail from './components/WordDetail';
import AIAssistant from './components/AIAssistant';
import {
  Upload,
  Download,
  Moon,
  Sun,
  FileText,
  Clock,
  Plus,
  Trash2,
  Search,
  Maximize,
  Minimize,
  ChevronDown,
  SlidersHorizontal,
  Music,
  Video,
  FileAudio,
  FileVideo,
  Eye,
  EyeOff,
  RefreshCw,
  FolderOpen,
  List,
  LayoutGrid,
  X,
  ArrowUpDown,
  Sparkles,
  Replace,
  Eraser,
  Undo2,
  Redo2,
  Mic,
  Wand2,
  Loader2,
  FilePlus,
  Play,
  PlayCircle,
  PauseCircle,
  Pause,
  Save,
  ChevronLeft,
  FileJson,
  Type,
  User,
  Disc,
  ListMusic,
  ChevronsLeft,
  ChevronRight,
  ChevronsRight,
  AlignLeft,
  Settings2,
  Volume2,
  VolumeX,
  WrapText,
  Link,
  Scissors,
  Zap,
  History,
  Repeat,
  Settings,
  Github
} from 'lucide-react';

export function App() {
  // Theme State - Default to Dark Mode
  const [darkMode, setDarkMode] = useState(true);

  // App State
  const [fileData, setFileData] = useState<FileData | null>(null);
  const [lastActiveFileData, setLastActiveFileData] = useState<FileData | null>(null);
  const [cues, setCues] = useState<Cue[]>([]);
  const [viewMode, setViewMode] = useState<'line' | 'word'>('line');
  const [metadata, setMetadata] = useState<Metadata>({ title: '', artist: '', album: '', by: '' });
  const [selectedCueIds, setSelectedCueIds] = useState<Set<string>>(new Set());

  // History State for Undo/Redo
  const [history, setHistory] = useState<Cue[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Media State
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'audio' | 'video' | null>(null);
  const [mediaName, setMediaName] = useState<string | null>(null);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [isVideoVisible, setIsVideoVisible] = useState(false); // Default hidden on mobile, logic handles desktop

  // Playback State
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const mediaRef = useRef<HTMLMediaElement>(null);
  const rafRef = useRef<number | null>(null);

  // Looping State
  const [isLooping, setIsLooping] = useState(false);
  // We use a ref for loop logic to avoid stale closures in the requestAnimationFrame loop
  const loopCtrlRef = useRef({
    isLooping: false,
    region: null as { start: number, end: number } | null
  });

  // Sync state to ref
  useEffect(() => {
    loopCtrlRef.current.isLooping = isLooping;
  }, [isLooping]);

  const [dragging, setDragging] = useState(false);
  const [editingWordIndex, setEditingWordIndex] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // UI State
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [isToolsMenuOpen, setIsToolsMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const toolsMenuRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'media' | 'metadata'>('media');

  // Shift Modal State
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [customShiftAmount, setCustomShiftAmount] = useState(0);

  // Find & Replace State
  const [isFindReplaceOpen, setIsFindReplaceOpen] = useState(false);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');

  // AI Assistant State
  const [isAIAssistantOpen, setIsAIAssistantOpen] = useState(false);

  // Settings State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [apiKey, setApiKey] = useState(localStorage.getItem('gemini_api_key') || '');

  const saveApiKey = () => {
    if (apiKey.trim()) {
      localStorage.setItem('gemini_api_key', apiKey.trim());
    } else {
      localStorage.removeItem('gemini_api_key');
    }
    setIsSettingsOpen(false);
    // Ideally we should alert or notify, but silent is fine for now
  };

  // Home Page AI States
  const [homeTab, setHomeTab] = useState<'upload' | 'generate' | 'transcribe'>('upload');
  const [genPrompt, setGenPrompt] = useState('');
  const [genModel, setGenModel] = useState('gemini-3-flash-preview');
  const [isGenerating, setIsGenerating] = useState(false);

  // Transcription States
  const [transcribeModel, setTranscribeModel] = useState('gemini-2.5-flash');
  const [sidebarTranscribeModel, setSidebarTranscribeModel] = useState('gemini-2.5-flash'); // Separate state for sidebar
  const [transcribeMode, setTranscribeMode] = useState<'lines' | 'words'>('lines');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const transcriptionAbortCtrl = useRef<AbortController | null>(null);

  // Apply Theme
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Force sidebar visible on large screens when media loads
  useEffect(() => {
    if (mediaUrl && window.innerWidth >= 768) {
      setIsVideoVisible(true);
    }
  }, [mediaUrl]);

  // Handle Fullscreen Events
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      // Redo
      else if (((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) || ((e.ctrlKey || e.metaKey) && e.key === 'y')) {
        e.preventDefault();
        redo();
      }
      // Play/Pause
      else if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [historyIndex, history, isPlaying]); // Crucial: Add historyIndex/history to deps for correct state

  // Handle Outside Click for Menus
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setIsExportMenuOpen(false);
      }
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(event.target as Node)) {
        setIsToolsMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Auto-switch home tab if media is loaded
  useEffect(() => {
    if (mediaName && !fileData && homeTab === 'upload') {
      setHomeTab('transcribe');
    }
  }, [mediaName, fileData]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  // High Precision Timer
  const startTicker = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const loop = () => {
      if (mediaRef.current && !mediaRef.current.paused) {
        const t = mediaRef.current.currentTime * 1000;

        // Loop Logic
        if (loopCtrlRef.current.isLooping && loopCtrlRef.current.region) {
          if (t >= loopCtrlRef.current.region.end) {
            // Loop back to start
            mediaRef.current.currentTime = loopCtrlRef.current.region.start / 1000;
            // Don't update current time yet to avoid jitter in UI, allow browser to seek
            rafRef.current = requestAnimationFrame(loop);
            return;
          }
        }

        setCurrentTime(t);
        rafRef.current = requestAnimationFrame(loop);
      }
    };
    loop();
  };

  const stopTicker = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  // Ensure ticker stops on unmount
  useEffect(() => {
    return () => stopTicker();
  }, []);

  const togglePlay = () => {
    if (mediaRef.current) {
      if (mediaRef.current.paused) {
        mediaRef.current.play();
        setIsPlaying(true);
        startTicker();
      } else {
        mediaRef.current.pause();
        setIsPlaying(false);
        stopTicker();
      }
    }
  };

  const toggleMute = () => {
    if (mediaRef.current) {
      const newMuteState = !isMuted;
      setIsMuted(newMuteState);
      mediaRef.current.muted = newMuteState;
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (mediaRef.current) {
      mediaRef.current.volume = newVolume;
      // Unmute if volume is adjusted
      if (newVolume > 0 && isMuted) {
        setIsMuted(false);
        mediaRef.current.muted = false;
      }
    }
  };

  const handleMediaLoadedMetadata = () => {
    if (mediaRef.current) {
      setDuration(mediaRef.current.duration * 1000);
    }
  };

  const handleMediaEnded = () => {
    setIsPlaying(false);
    stopTicker();
  };

  // Update Cues Helper (centralized point for history)
  const updateCues = (newCues: Cue[], addToHistory = true) => {
    if (addToHistory) {
      // When adding new history, slice up to current index and discard any "redo" future
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(newCues);
      if (newHistory.length > 50) newHistory.shift(); // Limit history depth

      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    }
    setCues(newCues);
  };

  const undo = () => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      setHistoryIndex(prevIndex);
      setCues(history[prevIndex]);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      setHistoryIndex(nextIndex);
      setCues(history[nextIndex]);
    }
  };

  const handleToggleSelection = (id: string, shiftKey: boolean) => {
    const newSelection = new Set(selectedCueIds);

    if (shiftKey && selectedCueIds.size > 0) {
      // Find range if needed, for now simple toggle is fine or range logic here
      // Implementing simple toggle for now as per request "select some rows"
      if (newSelection.has(id)) newSelection.delete(id);
      else newSelection.add(id);
    } else {
      if (newSelection.has(id)) newSelection.delete(id);
      else newSelection.add(id);
    }
    setSelectedCueIds(newSelection);
  };

  const clearSelection = () => {
    setSelectedCueIds(new Set());
  };

  // File Handling Logic
  const processSubtitleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const format = detectFormat(file.name, content);
      const { cues: parsedCues, metadata: parsedMetadata } = parseContent(content, format);

      setFileData({
        name: file.name,
        format,
        content
      });
      setCues(parsedCues);

      if (parsedMetadata) {
        setMetadata(prev => ({ ...prev, ...parsedMetadata }));
      } else {
        setMetadata({ title: '', artist: '', album: '', by: '' });
      }

      setHistory([parsedCues]);
      setHistoryIndex(0);
      setSelectedCueIds(new Set());
    };
    reader.readAsText(file);
  };

  const processMediaFile = (file: File) => {
    const url = URL.createObjectURL(file);
    const type = file.type.startsWith('video/') || file.name.match(/\.(mp4|webm|ogv|mov|mkv)$/i) ? 'video' : 'audio';
    setMediaUrl(url);
    setMediaType(type);
    setMediaName(file.name);
    setMediaFile(file);
    // Reset playback state
    setCurrentTime(0);
    setIsPlaying(false);
    setDuration(0);
    // Automatically show the media panel when new media is loaded
    setIsVideoVisible(true);
    setSidebarTab('media');
  };

  const removeMedia = () => {
    setMediaUrl(null);
    setMediaType(null);
    setMediaName(null);
    setMediaFile(null);
    setIsPlaying(false);
    stopTicker();
    setDuration(0);
    setCurrentTime(0);
  };

  const handleFileProcessing = (files: FileList) => {
    Array.from(files).forEach(file => {
      if (file.type.startsWith('audio/') || file.type.startsWith('video/') || file.name.match(/\.(mp3|wav|ogg|m4a|mp4|webm|ogv|mov|mkv)$/i)) {
        processMediaFile(file);
      } else {
        processSubtitleFile(file);
      }
    });
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileProcessing(e.dataTransfer.files);
    }
  };

  const handleCreateBlank = () => {
    setFileData({
      name: 'Untitled',
      format: SubtitleFormat.LRC,
      content: ''
    });
    setCues([]);
    setMetadata({ title: '', artist: '', album: '', by: '' });
    setHistory([[]]);
    setHistoryIndex(0);
    setSelectedCueIds(new Set());
  };

  const confirmCreateNew = () => {
    if (cues.length > 0) {
      if (window.confirm("Create new blank file? Current progress will be lost if not exported.")) {
        handleCreateBlank();
      }
    } else {
      handleCreateBlank();
    }
  };

  const handleHomeGenerate = async () => {
    if (!genPrompt) return;
    setIsGenerating(true);
    try {
      const generatedCues = await generateLyrics(genPrompt, genModel);
      setFileData({
        name: 'Generated Lyrics',
        format: SubtitleFormat.LRC,
        content: ''
      });
      setCues(generatedCues);
      setMetadata({ title: '', artist: '', album: '', by: '' });
      setHistory([generatedCues]);
      setHistoryIndex(0);
    } catch (e) {
      alert('Failed to generate lyrics. Please check API Key.');
    } finally {
      setIsGenerating(false);
    }
  };

  const stopTranscription = () => {
    if (transcriptionAbortCtrl.current) {
      transcriptionAbortCtrl.current.abort();
      transcriptionAbortCtrl.current = null;
    }
    setIsTranscribing(false);
  };

  // Re-usable transcribe function
  const runTranscription = async (model: string) => {
    if (!mediaFile) return;

    // Stop any existing
    if (transcriptionAbortCtrl.current) {
      transcriptionAbortCtrl.current.abort();
    }

    const controller = new AbortController();
    transcriptionAbortCtrl.current = controller;

    setIsTranscribing(true);
    try {
      const cues = await transcribeAudio(mediaFile, {
        model: model,
        mode: transcribeMode
      }, controller.signal);

      if (cues.length === 0) {
        // If manual stop, we might return empty or throw. transcribeAudio throws on abort.
        // If we get here with empty list and it wasn't aborted, then API returned no data.
        alert("Transcription returned no data.");
      } else {
        // If on home screen
        if (!fileData) {
          setFileData({
            name: 'Transcribed Lyrics',
            format: transcribeMode === 'words' ? SubtitleFormat.LRC_ENHANCED : SubtitleFormat.LRC,
            content: ''
          });
          setMetadata({ title: '', artist: '', album: '', by: '' });
        }
        // Update cues (replace)
        setCues(cues);
        setHistory([cues]);
        setHistoryIndex(0);
        if (transcribeMode === 'words') {
          setViewMode('word');
        }
      }
    } catch (e: any) {
      if (e.message === "Transcription cancelled by user." || e.name === 'AbortError') {
        console.log("Transcription aborted");
      } else {
        console.error(e);
        const msg = e.message || 'Transcription failed';
        alert(`Error: ${msg}. Please check API Key and file size.`);
      }
    } finally {
      if (transcriptionAbortCtrl.current === controller) {
        setIsTranscribing(false);
        transcriptionAbortCtrl.current = null;
      }
    }
  };

  const handleHomeTranscribe = () => runTranscription(transcribeModel);
  const handleSidebarTranscribe = () => {
    if (cues.length > 0) {
      if (!window.confirm("Re-transcribing will overwrite all current lyrics/subtitles. This action cannot be undone unless you have exported your work.\n\nDo you want to continue?")) {
        return;
      }
    }
    runTranscription(sidebarTranscribeModel);
  };

  const handleExport = (format: SubtitleFormat) => {
    const content = stringifyContent(cues, format, metadata);
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;

    const lastDot = fileData?.name.lastIndexOf('.');
    const baseName = lastDot && lastDot !== -1 ? fileData.name.substring(0, lastDot) : (fileData?.name || 'export');
    let ext = format as string;

    if (format === SubtitleFormat.LRC_ENHANCED) ext = 'lrc';
    else if (format === SubtitleFormat.VTT_KARAOKE) ext = 'vtt';
    else if (format === SubtitleFormat.TTML || format === SubtitleFormat.TTML_KARAOKE) ext = 'ttml';
    else if (format === SubtitleFormat.JSON) ext = 'json';
    else if (format === SubtitleFormat.TXT) ext = 'txt';

    a.download = `${baseName}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setIsExportMenuOpen(false);
  };

  const handleTimeUpdate = () => {
    if (mediaRef.current) {
      setCurrentTime(mediaRef.current.currentTime * 1000);
    }
  };

  const handleSeek = (ms: number, shouldPlay: boolean = false, endTime?: number) => {
    if (mediaRef.current) {
      mediaRef.current.currentTime = ms / 1000;
      setCurrentTime(ms);

      // Update loop region if end time is provided, otherwise clear it (assuming manual seek implies breaking loop)
      // Note: We update the ref directly so it picks up immediately
      if (endTime !== undefined) {
        loopCtrlRef.current.region = { start: ms, end: endTime };
      } else {
        loopCtrlRef.current.region = null;
      }

      if (shouldPlay) {
        if (mediaRef.current.paused) {
          mediaRef.current.play();
          setIsPlaying(true);
          startTicker();
        }
      } else {
        // If simply seeking and already playing, make sure ticker keeps running
        if (!mediaRef.current.paused) {
          startTicker();
        }
      }
    }
  };

  const handleSliderSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const ms = Number(e.target.value);
    setCurrentTime(ms); // Update UI immediately
    if (mediaRef.current) {
      mediaRef.current.currentTime = ms / 1000;
    }
    // Clear loop on manual seek
    loopCtrlRef.current.region = null;
  };

  const handleCueChange = (updatedCues: Cue[]) => {
    updateCues(updatedCues);
  };

  const addNewCue = () => {
    insertCue(cues.length);
  };

  const insertCue = (index: number) => {
    const prevCue = index > 0 ? cues[index - 1] : null;

    const newStart = prevCue ? prevCue.end : 0;
    const newEnd = newStart + 2000;

    const newCue: Cue = {
      id: `new-${Date.now()}`,
      start: newStart,
      end: newEnd,
      text: ''
    };

    const newCues = [...cues];
    newCues.splice(index, 0, newCue);
    updateCues(newCues);
  };

  const shiftAllTimes = (ms: number) => {
    const hasSelection = selectedCueIds.size > 0;

    const updated = cues.map(c => {
      if (hasSelection && !selectedCueIds.has(c.id)) {
        return c; // Skip unselected if there is a selection
      }
      return {
        ...c,
        start: Math.max(0, c.start + ms),
        end: Math.max(0, c.end + ms),
        words: c.words?.map(w => ({
          ...w,
          start: w.start ? Math.max(0, w.start + ms) : undefined,
          end: w.end ? Math.max(0, w.end + ms) : undefined
        }))
      };
    });
    updateCues(updated);
  };

  const sortCuesByTime = () => {
    const sorted = [...cues].sort((a, b) => a.start - b.start);
    updateCues(sorted);
    setIsToolsMenuOpen(false);
  };

  const autoGenerateKaraoke = () => {
    // Generate word splits for all cues that lack them
    const updated = cues.map((cue, index) => {
      if (!cue.words || cue.words.length === 0) {
        const wordsText = cue.text.trim().split(/\s+/);
        const duration = cue.end - cue.start;
        const perWord = duration / wordsText.length;
        const newWords: Word[] = wordsText.map((text, i) => ({
          id: `auto-${index}-${i}`,
          text,
          start: cue.start + (perWord * i),
          end: cue.start + (perWord * (i + 1))
        }));
        return { ...cue, words: newWords };
      }
      return cue;
    });
    updateCues(updated);
    setViewMode('word');
    setIsToolsMenuOpen(false);
  };

  const clearKaraokeData = () => {
    const updated = cues.map(cue => {
      const newCue = { ...cue };
      delete newCue.words;
      return newCue;
    });
    updateCues(updated);
    setViewMode('line');
    setIsToolsMenuOpen(false);
  };

  const compactWhitespace = () => {
    const updated = cues.map(cue => ({
      ...cue,
      text: cue.text.replace(/\s+/g, ' ').trim(),
      // Also clean words if they exist
      words: cue.words?.map(w => ({
        ...w,
        text: w.text.trim()
      }))
    }));
    updateCues(updated);
    setIsToolsMenuOpen(false);
  };

  const removeEmptyWords = () => {
    const updated = cues.map(cue => {
      if (!cue.words || cue.words.length === 0) return cue;

      const newWords = cue.words.filter(w => w.text.trim() !== '');

      return { ...cue, words: newWords };
    });
    updateCues(updated);
    setIsToolsMenuOpen(false);
  };

  const fillWordGaps = () => {
    const updated = cues.map(cue => {
      if (!cue.words || cue.words.length === 0) return cue;

      // Sort words by start time
      const sortedWords = [...cue.words].sort((a, b) => (a.start || 0) - (b.start || 0));

      const newWords = sortedWords.map((w, i) => {
        // Align start of first word to cue start if gap exists (optional, but good for karaoke)
        let newStart = w.start || 0;
        if (i === 0 && newStart > cue.start) {
          newStart = cue.start;
        }

        const nextWord = sortedWords[i + 1];
        let newEnd = w.end || 0;

        // Extend end to next word start, or cue end if it is the last word
        if (nextWord) {
          newEnd = nextWord.start || newEnd;
        } else {
          // For the last word, sync to the end of the line
          newEnd = cue.end;
        }

        return {
          ...w,
          start: newStart,
          end: newEnd
        };
      });

      return { ...cue, words: newWords };
    });
    updateCues(updated);
    setIsToolsMenuOpen(false);
  };

  const handleWordSave = (words: Word[] | undefined) => {
    if (editingWordIndex !== null) {
      const updatedCues = [...cues];
      if (words === undefined) {
        const newCue = { ...updatedCues[editingWordIndex] };
        delete newCue.words;
        updatedCues[editingWordIndex] = newCue;
      } else {
        // Clone the cue object before modifying 'words' to prevent history mutation
        updatedCues[editingWordIndex] = {
          ...updatedCues[editingWordIndex],
          words: words
        };
      }
      updateCues(updatedCues);
      setEditingWordIndex(null);
    }
  };

  const handleHotFix = () => {
    // 1. Compact Whitespace
    let updated = cues.map(cue => ({
      ...cue,
      text: cue.text.replace(/\s+/g, ' ').trim(),
      words: cue.words?.map(w => ({
        ...w,
        text: w.text.trim()
      }))
    }));

    // 2. Remove Empty Words
    updated = updated.map(cue => {
      if (!cue.words || cue.words.length === 0) return cue;
      const newWords = cue.words.filter(w => w.text.trim() !== '');
      return { ...cue, words: newWords };
    });

    // 3. Fill Word Gaps & Sync End
    updated = updated.map(cue => {
      if (!cue.words || cue.words.length === 0) return cue;

      // Sort words by start time
      const sortedWords = [...cue.words].sort((a, b) => (a.start || 0) - (b.start || 0));

      const newWords = sortedWords.map((w, i) => {
        let newStart = w.start || 0;
        // Align start of first word to cue start if gap exists
        if (i === 0 && newStart > cue.start) {
          newStart = cue.start;
        }

        const nextWord = sortedWords[i + 1];
        let newEnd = w.end || 0;

        // Extend end to next word start, or cue end if it is the last word
        if (nextWord) {
          newEnd = nextWord.start || newEnd;
        } else {
          // For the last word, strictly sync to the end of the line
          newEnd = cue.end;
        }

        return {
          ...w,
          start: newStart,
          end: newEnd
        };
      });

      return { ...cue, words: newWords };
    });

    updateCues(updated);
  };

  const handleReplaceAll = () => {
    if (!findText) return;
    let count = 0;
    const updatedCues = cues.map(cue => {
      if (cue.text.includes(findText)) {
        count++;
        const newText = cue.text.split(findText).join(replaceText);
        const newCue = { ...cue, text: newText };
        delete newCue.words; // invalidate words if text changes
        return newCue;
      }
      return cue;
    });
    if (count > 0) updateCues(updatedCues);
    setIsFindReplaceOpen(false);
  };

  const filteredCues = cues.filter(c =>
    c.text.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getFormatDisplayName = (fmt: SubtitleFormat) => {
    switch (fmt) {
      case SubtitleFormat.LRC_ENHANCED: return 'Enhanced LRC';
      case SubtitleFormat.VTT_KARAOKE: return 'VTT (Words)';
      case SubtitleFormat.TTML_KARAOKE: return 'TTML (Words)';
      case SubtitleFormat.JSON: return 'Structured JSON';
      case SubtitleFormat.TXT: return 'Plain Text (.txt)';
      default: return fmt.toUpperCase();
    }
  };

  if (!fileData) {
    // ... (Keep existing home page code exactly as is, but ensuring imports are valid)
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center p-6 transition-colors bg-neutral-50 dark:bg-neutral-950"
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        {/* Absolute Buttons Top Right */}
        <div className="absolute top-6 right-6 flex items-center gap-2">
          <a href="https://github.com/dotslashgabut/lyricaleditorplus" target="_blank" rel="noopener noreferrer" className="p-3 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition">
            <Github size={20} />
          </a>
          <button onClick={() => setIsSettingsOpen(true)} className="p-3 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition">
            <Settings size={20} />
          </button>
          <button onClick={toggleFullscreen} className="p-3 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition">
            {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
          </button>
          <button onClick={() => setDarkMode(!darkMode)} className="p-3 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 transition">
            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </div>

        {/* Main Card */}
        <div className={`
          max-w-lg w-full rounded-3xl p-6 transition-all duration-300 relative
          ${dragging ? 'bg-primary-50 dark:bg-primary-900/20 scale-105 shadow-2xl border-2 border-dashed border-primary-500' : 'bg-white dark:bg-neutral-900 shadow-xl border border-neutral-200 dark:border-neutral-800'}
        `}>
          <div className="flex flex-col items-center text-center mb-5">
            <div className="w-16 h-16 bg-gradient-to-br from-primary-500 to-orange-600 rounded-2xl flex items-center justify-center text-white mb-3 shadow-lg shadow-primary-500/20">
              <Music size={32} />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-neutral-900 to-neutral-500 dark:from-white dark:to-neutral-500 mb-1 py-1">
              Lyrical Editor Plus
            </h1>
            <p className="text-neutral-500 dark:text-neutral-400 text-sm max-w-sm">
              The modern way to create, edit, and sync lyrics. <br /> AI-powered transcription & generation.
            </p>
          </div>

          {/* RESUME BUTTON */}
          {lastActiveFileData && (
            <div className="mb-6 w-full animate-in slide-in-from-top-2 fade-in duration-300">
              <button
                onClick={() => setFileData(lastActiveFileData)}
                className="w-full p-4 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-2xl shadow-lg hover:shadow-xl hover:border-primary-500 dark:hover:border-primary-500 transition-all group text-left flex items-center gap-4 relative overflow-hidden"
              >
                <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-green-500"></div>
                <div className="p-2.5 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full group-hover:scale-110 transition-transform">
                  <History size={24} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-0.5">Resume Session</div>
                  <div className="font-semibold text-neutral-900 dark:text-neutral-100 truncate text-base">{lastActiveFileData.name}</div>
                  <div className="text-xs text-neutral-500 flex items-center gap-2 mt-0.5">
                    <span>{cues.length} lines</span>
                    <span>•</span>
                    <span>{mediaName ? 'Media Loaded' : 'No Media'}</span>
                  </div>
                </div>
                <div className="p-2 text-neutral-400 group-hover:text-primary-500 group-hover:translate-x-1 transition-all">
                  <ChevronRight size={20} />
                </div>
              </button>
            </div>
          )}

          <div className="flex justify-center mb-5">
            <div className="bg-neutral-100 dark:bg-neutral-800 p-1 rounded-xl flex gap-1">
              <button
                onClick={() => setHomeTab('upload')}
                className={`px-4 py-2 rounded-lg text-xs md:text-sm font-medium transition ${homeTab === 'upload' ? 'bg-white dark:bg-neutral-700 shadow text-neutral-900 dark:text-white' : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'}`}
              >
                Open
              </button>
              <button
                onClick={() => setHomeTab('generate')}
                className={`px-4 py-2 rounded-lg text-xs md:text-sm font-medium transition ${homeTab === 'generate' ? 'bg-white dark:bg-neutral-700 shadow text-primary-600 dark:text-primary-400' : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'}`}
              >
                AI Generate
              </button>
              <button
                onClick={() => setHomeTab('transcribe')}
                className={`px-4 py-2 rounded-lg text-xs md:text-sm font-medium transition ${homeTab === 'transcribe' ? 'bg-white dark:bg-neutral-700 shadow text-green-600 dark:text-green-300' : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'}`}
              >
                Transcribe
              </button>
            </div>
          </div>

          <div className="min-h-[140px] flex flex-col items-center justify-center">
            {homeTab === 'upload' && (
              <div className="w-full max-w-sm flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex flex-col items-center justify-center p-5 text-center border-2 border-dashed border-neutral-300 dark:border-neutral-700 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 hover:border-blue-500 transition group cursor-pointer"
                  onClick={() => document.getElementById('open-file-upload')?.click()}
                >
                  <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                    <FolderOpen size={20} />
                  </div>
                  <h3 className="text-sm font-bold mb-0.5">Open File</h3>
                  <p className="text-[10px] text-neutral-500">Supports LRC, SRT, VTT, etc.</p>

                  <input
                    id="open-file-upload"
                    type="file"
                    className="hidden"
                    multiple
                    accept=".lrc,.srt,.vtt,.xml,.ttml,.txt,.json,audio/*,video/*,.mp3,.wav,.ogg,.m4a,.mp4,.webm,.ogv,.mov,.mkv"
                    onChange={(e) => e.target.files && handleFileProcessing(e.target.files)}
                  />
                </div>

                <button
                  onClick={handleCreateBlank}
                  className="w-full py-2.5 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700 rounded-xl text-sm font-semibold transition flex items-center justify-center gap-2 shadow-sm"
                >
                  <FilePlus size={16} /> Create Blank
                </button>
              </div>
            )}
            {homeTab === 'generate' && (
              <div className="w-full max-w-sm flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="bg-primary-50 dark:bg-primary-900/10 p-3 rounded-xl border border-primary-100 dark:border-primary-800/30">
                  <label className="block text-[10px] font-bold text-primary-600 dark:text-primary-400 uppercase tracking-wider mb-1.5">Prompt / Topic</label>
                  <textarea
                    value={genPrompt}
                    onChange={(e) => setGenPrompt(e.target.value)}
                    placeholder="A pop song about neon lights..."
                    className="w-full bg-white dark:bg-neutral-800 border border-primary-200 dark:border-primary-800 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-primary-500 min-h-[80px] resize-none"
                  />
                </div>
                <div className="flex gap-2">
                  <select
                    value={genModel}
                    onChange={(e) => setGenModel(e.target.value)}
                    className="flex-1 bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-2 text-xs outline-none"
                  >
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                    <option value="gemini-3-flash-preview">Gemini 3.0 Flash</option>
                    <option value="gemini-3-pro-preview">Gemini 3.0 Pro</option>
                  </select>
                  <button
                    onClick={handleHomeGenerate}
                    disabled={isGenerating || !genPrompt}
                    className="flex-1 bg-primary-600 hover:bg-primary-700 text-white py-2.5 rounded-xl text-sm font-semibold shadow-lg shadow-primary-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                    Generate
                  </button>
                </div>
              </div>
            )}
            {homeTab === 'transcribe' && (
              <div className="w-full max-w-sm flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                {mediaName ? (
                  <>
                    <div className="flex items-center gap-3 p-2.5 bg-neutral-100 dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700">
                      <div className="w-8 h-8 bg-white dark:bg-neutral-700 rounded-lg flex items-center justify-center text-neutral-500">
                        {mediaType === 'video' ? <Video size={16} /> : <Music size={16} />}
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <h4 className="font-medium text-sm truncate">{mediaName}</h4>
                        <p className="text-[10px] text-neutral-500">Ready</p>
                      </div>
                      <button
                        onClick={removeMedia}
                        className="p-1.5 text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition"
                        title="Remove Media"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <select
                          value={transcribeModel}
                          onChange={(e) => setTranscribeModel(e.target.value)}
                          className="w-full bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-2 py-2 text-xs outline-none"
                        >
                          <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                          <option value="gemini-3-flash-preview">Gemini 3.0 Flash</option>
                        </select>
                      </div>
                      <div>
                        <select
                          value={transcribeMode}
                          onChange={(e) => setTranscribeMode(e.target.value as any)}
                          className="w-full bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-2 py-2 text-xs outline-none"
                        >
                          <option value="lines">Lines</option>
                          <option value="words">Words</option>
                        </select>
                      </div>
                    </div>
                    <button
                      onClick={isTranscribing ? stopTranscription : handleHomeTranscribe}
                      className={`w-full py-2.5 rounded-xl text-sm font-semibold shadow-lg flex items-center justify-center gap-2 transition ${isTranscribing
                        ? 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/20'
                        : 'bg-green-600 hover:bg-green-700 text-white shadow-green-500/20 disabled:opacity-50 disabled:cursor-not-allowed'
                        }`}
                    >
                      {isTranscribing ? (
                        <> <Loader2 size={16} className="animate-spin" /> Stop Transcription </>
                      ) : (
                        <> <Mic size={16} /> Start Transcription </>
                      )}
                    </button>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center p-5 text-center border-2 border-dashed border-neutral-300 dark:border-neutral-700 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 hover:border-green-500 transition group cursor-pointer"
                    onClick={() => document.getElementById('transcribe-upload')?.click()}
                  >
                    <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                      <FileAudio size={20} />
                    </div>
                    <h3 className="text-sm font-bold mb-0.5">Upload Media</h3>
                    <p className="text-[10px] text-neutral-500">Audio or Video</p>

                    <input
                      id="transcribe-upload"
                      type="file"
                      className="hidden"
                      accept="audio/*,video/*,.mp3,.wav,.ogg,.m4a,.mp4,.webm,.ogv,.mov,.mkv"
                      onChange={(e) => e.target.files?.[0] && processMediaFile(e.target.files[0])}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        {isSettingsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
            <div className="bg-white dark:bg-neutral-900 p-6 rounded-2xl shadow-xl w-full max-w-sm border border-neutral-200 dark:border-neutral-800 animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-lg">Settings</h3>
                <button onClick={() => setIsSettingsOpen(false)} className="p-1 text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition"><X size={18} /></button>
              </div>

              <div className="bg-primary-50 dark:bg-primary-900/10 p-4 rounded-xl border border-primary-100 dark:border-primary-800/20 mb-4">
                <label className="block text-xs font-bold text-primary-600 dark:text-primary-400 uppercase tracking-wider mb-2">Gemini API Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="AIza..."
                  className="w-full bg-white dark:bg-neutral-950 border border-primary-200 dark:border-primary-800/50 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500 font-mono"
                />
                <p className="text-[10px] text-primary-600/70 dark:text-primary-400/70 mt-2 leading-relaxed">
                  Enter your Google Gemini API Key. This key is stored locally in your browser and used for transcription and lyrics generation.
                </p>
              </div>

              <div className="flex gap-2">
                <button onClick={() => setIsSettingsOpen(false)} className="flex-1 py-2.5 text-neutral-500 text-sm font-medium hover:text-neutral-900 dark:hover:text-neutral-100 transition">Cancel</button>
                <button onClick={saveApiKey} className="flex-1 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-primary-600/20 transition">Save Changes</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- Main Editor UI ---
  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 transition-colors flex flex-col h-screen overflow-hidden">
      {/* Top Header */}
      <header className="flex-none h-16 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between px-3 md:px-4 bg-white/80 dark:bg-neutral-950/80 backdrop-blur-md z-40">
        <div className="flex items-center gap-3 min-w-0 flex-1 mr-2">
          <button
            onClick={() => {
              setLastActiveFileData(fileData);
              setFileData(null);
            }}
            className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg text-neutral-500 transition shrink-0"
            title="Back to Home"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="flex flex-col min-w-0 flex-1 max-w-[140px] sm:max-w-none">
            <input
              type="text"
              value={fileData.name}
              onChange={(e) => setFileData({ ...fileData, name: e.target.value })}
              className="font-semibold text-sm leading-tight w-full bg-transparent outline-none border-b border-transparent focus:border-primary-500 transition p-0 truncate"
            />
            <span className="text-[10px] text-neutral-400 uppercase tracking-wider font-bold truncate">{getFormatDisplayName(fileData.format)}</span>
          </div>
        </div>

        <div className="flex items-center gap-1 md:gap-2 shrink-0">
          <button
            onClick={toggleFullscreen}
            className="p-2.5 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400 transition"
          >
            {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
          </button>
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-2.5 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400 transition"
            title="Settings"
          >
            <Settings size={18} />
          </button>
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="p-2.5 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400 transition"
          >
            {darkMode ? <Sun size={18} /> : <Moon size={20} />}
          </button>

          {/* Tools Menu */}
          <div className="relative" ref={toolsMenuRef}>
            <button
              onClick={() => setIsToolsMenuOpen(!isToolsMenuOpen)}
              className={`p-2.5 rounded-xl transition ${isToolsMenuOpen ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white' : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'}`}
              title="Global Tools"
            >
              <SlidersHorizontal size={18} />
            </button>

            {isToolsMenuOpen && (
              <div className="absolute top-full right-0 mt-2 w-64 bg-white dark:bg-neutral-900 rounded-xl shadow-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-100">
                <div className="p-1">
                  <button onClick={sortCuesByTime} className="w-full text-left px-3 py-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-sm transition flex items-center gap-2">
                    <List size={14} className="text-blue-500" /> Sort Rows by Time
                  </button>
                  <button onClick={compactWhitespace} className="w-full text-left px-3 py-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-sm transition flex items-center gap-2">
                    <WrapText size={14} className="text-indigo-500" /> Compact Whitespace
                  </button>
                  <button onClick={removeEmptyWords} className="w-full text-left px-3 py-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-sm transition flex items-center gap-2">
                    <Scissors size={14} className="text-pink-500" /> Remove Empty Words
                  </button>
                  <button onClick={fillWordGaps} className="w-full text-left px-3 py-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-sm transition flex items-center gap-2">
                    <Link size={14} className="text-orange-500" /> Fill Word Gaps
                  </button>
                  <button onClick={autoGenerateKaraoke} className="w-full text-left px-3 py-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-sm transition flex items-center gap-2">
                    <Wand2 size={14} className="text-purple-500" /> Auto-Word Timing
                  </button>
                  <button onClick={clearKaraokeData} className="w-full text-left px-3 py-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-sm transition flex items-center gap-2">
                    <Eraser size={14} className="text-red-500" /> Clear Word Data
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="relative" ref={exportMenuRef}>
            <button
              onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
              className="flex items-center gap-2 px-3 md:px-4 py-2 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-xl font-medium text-sm hover:opacity-90 transition shadow-lg shadow-neutral-500/10 shrink-0"
            >
              <Download size={16} /> <span className="hidden sm:inline">Export</span> <ChevronDown size={14} />
            </button>

            {isExportMenuOpen && (
              <div className="absolute top-full right-0 mt-2 w-64 bg-white dark:bg-neutral-900 rounded-xl shadow-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-100">
                <div className="p-2 max-h-[80vh] overflow-y-auto">
                  {/* ... (Existing export menu code) ... */}
                  <div className="text-[10px] font-bold text-neutral-400 px-3 py-2 uppercase tracking-widest">Subtitles</div>
                  {[SubtitleFormat.LRC, SubtitleFormat.SRT, SubtitleFormat.VTT, SubtitleFormat.TTML].map(fmt => (
                    <button
                      key={fmt}
                      onClick={() => handleExport(fmt)}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-sm font-medium transition flex items-center justify-between group"
                    >
                      <span className="flex items-center gap-2"><FileText size={14} className="text-neutral-400" />{getFormatDisplayName(fmt)}</span>
                      <Download size={14} className="opacity-0 group-hover:opacity-100 transition-opacity text-neutral-400" />
                    </button>
                  ))}

                  <div className="h-px bg-neutral-100 dark:bg-neutral-800 my-2"></div>

                  <div className="text-[10px] font-bold text-neutral-400 px-3 py-2 uppercase tracking-widest">Karaoke (Word-Level)</div>
                  {[SubtitleFormat.LRC_ENHANCED, SubtitleFormat.VTT_KARAOKE, SubtitleFormat.TTML_KARAOKE].map(fmt => (
                    <button
                      key={fmt}
                      onClick={() => handleExport(fmt)}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-sm font-medium transition flex items-center justify-between group"
                    >
                      <span className="flex items-center gap-2"><Mic size={14} className="text-primary-500" />{getFormatDisplayName(fmt)}</span>
                      <Download size={14} className="opacity-0 group-hover:opacity-100 transition-opacity text-primary-500" />
                    </button>
                  ))}

                  <div className="h-px bg-neutral-100 dark:bg-neutral-800 my-2"></div>

                  <div className="text-[10px] font-bold text-neutral-400 px-3 py-2 uppercase tracking-widest">Other Formats</div>
                  <button
                    onClick={() => handleExport(SubtitleFormat.JSON)}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-sm font-medium transition flex items-center justify-between group"
                  >
                    <span className="flex items-center gap-2"><FileJson size={14} className="text-amber-500" />JSON</span>
                    <Download size={14} className="opacity-0 group-hover:opacity-100 transition-opacity text-neutral-400" />
                  </button>
                  <button
                    onClick={() => handleExport(SubtitleFormat.TXT)}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-sm font-medium transition flex items-center justify-between group"
                  >
                    <span className="flex items-center gap-2"><Type size={14} className="text-neutral-500" />Plain Text</span>
                    <Download size={14} className="opacity-0 group-hover:opacity-100 transition-opacity text-neutral-400" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar (Left Slider) */}
        <div className={`
             transition-all duration-300 ease-in-out bg-neutral-50 dark:bg-neutral-900 border-r border-neutral-200 dark:border-neutral-800 flex flex-col z-50
             ${isVideoVisible ? 'fixed inset-x-0 bottom-0 top-16 md:relative md:top-auto md:w-[400px] lg:w-[450px] md:inset-auto' : 'w-0 border-none overflow-hidden'}
         `}>
          {/* Sidebar Tabs */}
          <div className="flex border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 relative">
            <button
              onClick={() => setSidebarTab('media')}
              className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition relative ${sidebarTab === 'media' ? 'text-primary-600 bg-primary-50/50 dark:bg-primary-900/10' : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'}`}
            >
              <PlayCircle size={16} /> Media
              {sidebarTab === 'media' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-600"></div>}
            </button>
            <button
              onClick={() => setSidebarTab('metadata')}
              className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition relative ${sidebarTab === 'metadata' ? 'text-primary-600 bg-primary-50/50 dark:bg-primary-900/10' : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'}`}
            >
              <ListMusic size={16} /> Metadata
              {sidebarTab === 'metadata' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-600"></div>}
            </button>
            {/* Mobile Close Button */}
            <button
              onClick={() => setIsVideoVisible(false)}
              className="md:hidden absolute right-2 top-1/2 -translate-y-1/2 p-2 text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
            >
              <X size={18} />
            </button>
          </div>

          {sidebarTab === 'media' && (
            <div className="flex-1 overflow-y-auto bg-neutral-50/50 dark:bg-neutral-900/50">
              {mediaUrl ? (
                <div className="p-4 flex flex-col gap-4">
                  {/* Media Player Card */}
                  <div className="bg-white dark:bg-neutral-800 rounded-2xl shadow-sm border border-neutral-200 dark:border-neutral-700 overflow-hidden">
                    <div className="aspect-video bg-black relative group flex items-center justify-center">
                      {mediaType === 'video' ? (
                        <video
                          ref={mediaRef as React.RefObject<HTMLVideoElement>}
                          src={mediaUrl}
                          className="w-full h-full object-contain"
                          onTimeUpdate={handleTimeUpdate}
                          onPlay={startTicker}
                          onPause={stopTicker}
                          onLoadedMetadata={handleMediaLoadedMetadata}
                          onEnded={handleMediaEnded}
                        />
                      ) : (
                        <>
                          <div className="w-full h-full flex flex-col items-center justify-center text-white/50 bg-neutral-900/50 absolute inset-0">
                            <Music size={48} className="mb-4 opacity-50" />
                          </div>
                          <audio
                            ref={mediaRef as React.RefObject<HTMLAudioElement>}
                            src={mediaUrl}
                            className="w-full absolute bottom-0 left-0"
                            onTimeUpdate={handleTimeUpdate}
                            onPlay={startTicker}
                            onPause={stopTicker}
                            onLoadedMetadata={handleMediaLoadedMetadata}
                            onEnded={handleMediaEnded}
                          />
                        </>
                      )}
                    </div>
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="font-semibold text-sm truncate pr-2" title={mediaName || ''}>{mediaName}</h4>
                        <button onClick={() => { setMediaUrl(null); setMediaType(null); setMediaName(null); setIsPlaying(false); }} className="text-xs text-red-500 hover:text-red-600 font-medium">Remove</button>
                      </div>
                      <p className="text-xs text-neutral-400">{mediaType === 'video' ? 'Video File' : 'Audio File'} • {msToLrc(duration)}</p>
                    </div>
                  </div>

                  {/* Re-Transcribe Card */}
                  <div className="bg-white dark:bg-neutral-800 p-4 rounded-2xl border border-neutral-200 dark:border-neutral-700">
                    <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                      <Mic size={16} className="text-primary-500" /> AI Re-Transcribe
                    </h4>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-neutral-500 mb-1.5 ml-1">Model</label>
                        <select
                          value={sidebarTranscribeModel}
                          onChange={(e) => setSidebarTranscribeModel(e.target.value)}
                          className="w-full bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500/20"
                        >
                          <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                          <option value="gemini-3-flash-preview">Gemini 3.0 Flash</option>
                        </select>
                      </div>
                      <button
                        onClick={isTranscribing ? stopTranscription : handleSidebarTranscribe}
                        className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition ${isTranscribing ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:opacity-90'}`}
                      >
                        {isTranscribing ? (
                          <> <Loader2 size={16} className="animate-spin" /> Stop </>
                        ) : (
                          <> <RefreshCw size={16} /> Re-Transcribe </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center h-full">
                  <div className="w-16 h-16 bg-neutral-200 dark:bg-neutral-800 rounded-full flex items-center justify-center mb-4 text-neutral-400">
                    <Music size={24} />
                  </div>
                  <h3 className="font-semibold mb-2">No Media Loaded</h3>
                  <p className="text-sm text-neutral-500 mb-6">Load audio/video to sync or transcribe.</p>
                  <label className="px-5 py-2.5 bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 rounded-lg text-sm font-medium cursor-pointer transition">
                    Load Media
                    <input type="file" className="hidden" accept="audio/*,video/*" onChange={(e) => e.target.files?.[0] && processMediaFile(e.target.files[0])} />
                  </label>
                </div>
              )}
            </div>
          )}

          {/* ... Sidebar Metadata ... */}
          {sidebarTab === 'metadata' && (
            <div className="flex-1 overflow-y-auto p-5">
              {/* ... (Existing metadata tab code) ... */}
              <h3 className="font-bold mb-4 text-neutral-700 dark:text-neutral-300">File Metadata</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-500 mb-1.5 uppercase">Title</label>
                  <div className="flex items-center bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden focus-within:ring-2 ring-primary-500/50">
                    <span className="pl-3 text-neutral-400"><Type size={16} /></span>
                    <input
                      type="text"
                      className="w-full bg-transparent p-2.5 outline-none text-sm"
                      placeholder="Song Title"
                      value={metadata.title}
                      onChange={(e) => setMetadata({ ...metadata, title: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-500 mb-1.5 uppercase">Artist</label>
                  <div className="flex items-center bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden focus-within:ring-2 ring-primary-500/50">
                    <span className="pl-3 text-neutral-400"><User size={16} /></span>
                    <input
                      type="text"
                      className="w-full bg-transparent p-2.5 outline-none text-sm"
                      placeholder="Artist Name"
                      value={metadata.artist}
                      onChange={(e) => setMetadata({ ...metadata, artist: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-500 mb-1.5 uppercase">Album</label>
                  <div className="flex items-center bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden focus-within:ring-2 ring-primary-500/50">
                    <span className="pl-3 text-neutral-400"><Disc size={16} /></span>
                    <input
                      type="text"
                      className="w-full bg-transparent p-2.5 outline-none text-sm"
                      placeholder="Album Name"
                      value={metadata.album}
                      onChange={(e) => setMetadata({ ...metadata, album: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-500 mb-1.5 uppercase">Creator (By)</label>
                  <div className="flex items-center bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden focus-within:ring-2 ring-primary-500/50">
                    <span className="pl-3 text-neutral-400"><Settings2 size={16} /></span>
                    <input
                      type="text"
                      className="w-full bg-transparent p-2.5 outline-none text-sm"
                      placeholder="LRC Creator"
                      value={metadata.by}
                      onChange={(e) => setMetadata({ ...metadata, by: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 flex flex-col h-full overflow-hidden bg-white dark:bg-neutral-950 relative">
          <div className="flex-none bg-white dark:bg-neutral-950 border-b border-neutral-200 dark:border-neutral-800 z-30 p-2 md:px-4">
            <div className="flex flex-wrap items-center gap-2">

              {/* 1. Left Controls */}
              <div className="flex items-center gap-1 overflow-x-auto w-full md:w-auto scrollbar-hide pb-2 md:pb-0 mask-gradient pr-2 order-1">
                {/* ... existing controls ... */}
                <button onClick={() => setIsVideoVisible(!isVideoVisible)} className={`p-2 rounded-lg transition shrink-0 ${isVideoVisible ? 'text-primary-600 bg-primary-50 dark:bg-primary-900/20' : 'text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'}`} title="Toggle Sidebar">
                  <LayoutGrid size={18} />
                </button>
                <div className="h-4 w-px bg-neutral-200 dark:bg-neutral-800 mx-1 shrink-0"></div>

                <button onClick={confirmCreateNew} className="p-2 text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 transition shrink-0 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg" title="New Blank File">
                  <FilePlus size={18} />
                </button>

                {/* Load Media Button */}
                <label className="p-2 text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 cursor-pointer transition flex items-center gap-2 group rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 shrink-0" title="Attach Audio/Video">
                  <FileVideo size={18} className="group-hover:text-primary-500 transition-colors" />
                  <span className="text-xs font-medium hidden lg:inline">Load</span>
                  <input
                    type="file"
                    className="hidden"
                    accept="audio/*,video/*,.mp3,.wav,.ogg,.m4a,.mp4,.webm,.ogv,.mov,.mkv"
                    onChange={(e) => e.target.files?.[0] && processMediaFile(e.target.files[0])}
                  />
                </label>

                {/* Open Lyric File Button */}
                <label className="p-2 text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 cursor-pointer transition flex items-center gap-2 group rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 shrink-0" title="Open Lyric File">
                  <FolderOpen size={18} className="group-hover:text-primary-500 transition-colors" />
                  <span className="text-xs font-medium hidden lg:inline">Open</span>
                  <input
                    type="file"
                    className="hidden"
                    accept=".lrc,.srt,.vtt,.xml,.ttml,.txt,.json"
                    onChange={(e) => e.target.files?.[0] && processSubtitleFile(e.target.files[0])}
                  />
                </label>

                <div className="h-4 w-px bg-neutral-200 dark:bg-neutral-800 mx-1 shrink-0"></div>

                <button onClick={undo} disabled={historyIndex <= 0} className="p-2 text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 disabled:opacity-30 transition shrink-0 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg">
                  <Undo2 size={18} />
                </button>
                <button onClick={redo} disabled={historyIndex >= history.length - 1} className="p-2 text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 disabled:opacity-30 transition shrink-0 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg">
                  <Redo2 size={18} />
                </button>
                <div className="h-4 w-px bg-neutral-200 dark:bg-neutral-800 mx-1 shrink-0"></div>

                <button onClick={() => setIsFindReplaceOpen(!isFindReplaceOpen)} className={`p-2 rounded-lg transition shrink-0 ${isFindReplaceOpen ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white' : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100'}`} title="Find & Replace">
                  <Replace size={18} />
                </button>
                <button onClick={handleHotFix} className="p-2 text-amber-500 hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-300 transition shrink-0 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg" title="Hot Fix: Cleanup & Sync Words">
                  <Zap size={18} />
                </button>
                <button onClick={() => setIsShiftModalOpen(true)} className="p-2 text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 transition shrink-0 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg" title="Shift Times">
                  <Clock size={18} />
                </button>

                {selectedCueIds.size > 0 && (
                  <>
                    <div className="h-4 w-px bg-neutral-200 dark:bg-neutral-800 mx-1 shrink-0 animate-in fade-in zoom-in"></div>
                    <button
                      onClick={clearSelection}
                      className="p-2 text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 transition shrink-0 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg flex items-center gap-1 animate-in fade-in zoom-in"
                      title="Uncheck All Rows"
                    >
                      <X size={18} />
                      <span className="text-xs font-bold">{selectedCueIds.size}</span>
                    </button>
                  </>
                )}
              </div>

              {/* 2. View/AI Controls */}
              <div className="flex items-center gap-2 shrink-0 order-2">
                <div className="flex items-center bg-neutral-100 dark:bg-neutral-900 p-1 rounded-lg">
                  <button onClick={() => setViewMode('line')} className={`px-2 py-1.5 rounded-md text-[10px] uppercase font-bold transition ${viewMode === 'line' ? 'bg-white dark:bg-neutral-800 shadow-sm text-neutral-900 dark:text-white' : 'text-neutral-500'}`}>Lines</button>
                  <button onClick={() => setViewMode('word')} className={`px-2 py-1.5 rounded-md text-[10px] uppercase font-bold transition ${viewMode === 'word' ? 'bg-white dark:bg-neutral-800 shadow-sm text-neutral-900 dark:text-white' : 'text-neutral-500'}`}>Words</button>
                </div>
                <button onClick={() => setIsAIAssistantOpen(true)} className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-lg text-xs font-bold shadow-lg shadow-orange-500/20 hover:shadow-orange-500/40 transition active:scale-95">
                  <Sparkles size={14} /> AI
                </button>
              </div>

              {/* 3. Quick Access (Moved) */}
              <div className="flex-none order-3 mt-2 md:mt-0">
                <div className="flex items-center gap-1 bg-neutral-100 dark:bg-neutral-900 p-1 rounded-lg">
                  <button onClick={() => shiftAllTimes(-500)} className="px-3 py-1.5 text-xs font-mono text-neutral-600 dark:text-neutral-400 hover:bg-white dark:hover:bg-neutral-700 rounded transition" title="-500ms">{'<<'}</button>
                  <button onClick={() => shiftAllTimes(-100)} className="px-3 py-1.5 text-xs font-mono text-neutral-600 dark:text-neutral-400 hover:bg-white dark:hover:bg-neutral-700 rounded transition" title="-100ms">{'<'}</button>
                  <div className="w-px h-4 bg-neutral-300 dark:bg-neutral-700 mx-1"></div>
                  <button onClick={() => shiftAllTimes(100)} className="px-3 py-1.5 text-xs font-mono text-neutral-600 dark:text-neutral-400 hover:bg-white dark:hover:bg-neutral-700 rounded transition" title="+100ms">{'>'}</button>
                  <button onClick={() => shiftAllTimes(500)} className="px-3 py-1.5 text-xs font-mono text-neutral-600 dark:text-neutral-400 hover:bg-white dark:hover:bg-neutral-700 rounded transition" title="+500ms">{'>>'}</button>
                </div>
              </div>

              {/* 4. Search Bar (Moved & Flexible) */}
              <div className="flex-1 min-w-[200px] relative order-4 mt-2 md:mt-0">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search..."
                  className="w-full pl-9 pr-8 py-2 bg-neutral-100 dark:bg-neutral-800 border-none rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary-500/50 transition"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>
          </div>

          {isFindReplaceOpen && (
            <div className="flex-none p-3 bg-neutral-50 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 flex flex-wrap gap-2 items-center animate-in slide-in-from-top-2">
              <input type="text" placeholder="Find..." value={findText} onChange={(e) => setFindText(e.target.value)} className="px-3 py-1.5 rounded-lg bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-sm outline-none focus:ring-2 focus:ring-primary-500" />
              <ArrowUpDown size={16} className="text-neutral-400" />
              <input type="text" placeholder="Replace with..." value={replaceText} onChange={(e) => setReplaceText(e.target.value)} className="px-3 py-1.5 rounded-lg bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-sm outline-none focus:ring-2 focus:ring-primary-500" />
              <button onClick={handleReplaceAll} className="px-3 py-1.5 bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 rounded-lg text-sm font-medium transition">Replace All</button>
              <button onClick={() => setIsFindReplaceOpen(false)} className="ml-auto p-1 text-neutral-400 hover:text-neutral-600"><X size={18} /></button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4 md:p-6 scroll-smooth" id="cue-container">
            <div className="max-w-[95%] 2xl:max-w-[1800px] mx-auto">
              <CueList
                cues={filteredCues}
                onChange={handleCueChange}
                onEditWords={setEditingWordIndex}
                currentMillis={currentTime}
                onSeek={handleSeek}
                viewMode={viewMode}
                selectedCueIds={selectedCueIds}
                onToggleSelection={handleToggleSelection}
                onInsert={insertCue}
              />
              {/* Spacer for bottom elements (player/status bar) */}
              <div className={`w-full transition-all duration-300 ${mediaUrl ? 'h-96' : 'h-32'}`} />
            </div>
          </div>

          {/* Bottom Player Bar */}
          {mediaUrl && (
            <div className="absolute bottom-8 left-4 right-4 md:left-6 md:right-6 lg:left-8 lg:right-8 bg-white dark:bg-neutral-800/90 backdrop-blur-md border border-neutral-200 dark:border-neutral-700/50 rounded-2xl shadow-2xl p-3 z-50 animate-in slide-in-from-bottom-5">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <button
                    onClick={togglePlay}
                    className="w-10 h-10 flex items-center justify-center bg-primary-600 hover:bg-primary-700 text-white rounded-full shadow-lg shadow-primary-500/30 transition-all active:scale-95 shrink-0"
                  >
                    {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-0.5" />}
                  </button>
                  {/* REPEAT BUTTON */}
                  <button
                    onClick={() => setIsLooping(!isLooping)}
                    className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${isLooping ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400' : 'text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700'}`}
                    title={isLooping ? "Loop Active: Repeating lines" : "Loop Inactive"}
                  >
                    <Repeat size={16} />
                  </button>
                </div>

                <div className="flex-1 flex flex-col justify-center">
                  <input
                    type="range"
                    min="0"
                    max={duration}
                    value={currentTime}
                    onChange={handleSliderSeek}
                    className="w-full h-1.5 bg-neutral-200 dark:bg-neutral-700 rounded-full appearance-none cursor-pointer accent-primary-600 hover:accent-primary-500"
                  />
                  <div className="flex justify-between text-[10px] font-mono text-neutral-400 mt-1">
                    <span>{msToLrc(currentTime)}</span>
                    <span>{msToLrc(duration)}</span>
                  </div>
                </div>

                {/* Volume Control */}
                <div className="flex items-center gap-2 w-24 sm:w-32 group">
                  <button
                    onClick={toggleMute}
                    className="text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 transition"
                  >
                    {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className="w-full h-1 bg-neutral-200 dark:bg-neutral-700 rounded-full appearance-none cursor-pointer accent-neutral-500 hover:accent-neutral-700 dark:hover:accent-neutral-300"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="flex-none h-8 bg-neutral-100 dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-800 flex items-center px-4 text-[10px] text-neutral-500 gap-4 justify-between">
            <div className="flex gap-4">
              <span>Lines: {cues.length}</span>
              <span>Words: {cues.reduce((acc, c) => acc + (c.words?.length || c.text.split(' ').length), 0)}</span>
              <span>Duration: {cues.length > 0 ? msToLrc(cues[cues.length - 1].end) : '00:00'}</span>
            </div>
            <div>{fileData.format.toUpperCase()}</div>
          </div>
        </div>
      </div>

      {editingWordIndex !== null && (
        <WordDetail cue={cues[editingWordIndex]} onSave={handleWordSave} onClose={() => setEditingWordIndex(null)} />
      )}
      {isAIAssistantOpen && (
        <AIAssistant cues={cues} onApply={(newCues) => { updateCues(newCues); if (newCues.some(c => c.words && c.words.length > 0)) setViewMode('word'); }} onClose={() => setIsAIAssistantOpen(false)} />
      )}
      {isShiftModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="bg-white dark:bg-neutral-900 p-6 rounded-2xl shadow-xl w-full max-w-sm border border-neutral-200 dark:border-neutral-800">
            <h3 className="font-bold text-lg mb-4">Shift Time</h3>
            <div className="mb-4 text-xs text-neutral-500">
              {selectedCueIds.size > 0 ? `Applying to ${selectedCueIds.size} selected row(s)` : 'Applying to all rows'}
            </div>
            <div className="space-y-3">
              <button onClick={() => { shiftAllTimes(100); setIsShiftModalOpen(false); }} className="w-full py-2 bg-neutral-100 dark:bg-neutral-800 rounded-lg text-sm hover:bg-neutral-200 dark:hover:bg-neutral-700 transition">+100ms</button>
              <button onClick={() => { shiftAllTimes(-100); setIsShiftModalOpen(false); }} className="w-full py-2 bg-neutral-100 dark:bg-neutral-800 rounded-lg text-sm hover:bg-neutral-200 dark:hover:bg-neutral-700 transition">-100ms</button>
              <div className="flex gap-2 pt-2">
                <input type="number" value={customShiftAmount} onChange={(e) => setCustomShiftAmount(Number(e.target.value))} placeholder="ms" className="flex-1 px-3 py-2 bg-neutral-50 dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-700 rounded-lg text-sm" />
                <button onClick={() => { shiftAllTimes(customShiftAmount); setIsShiftModalOpen(false); }} className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium">Shift</button>
              </div>
            </div>
            <button onClick={() => setIsShiftModalOpen(false)} className="mt-4 w-full py-2 text-neutral-500 text-sm hover:text-neutral-900 dark:hover:text-neutral-100">Cancel</button>
          </div>
        </div>
      )}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="bg-white dark:bg-neutral-900 p-6 rounded-2xl shadow-xl w-full max-w-sm border border-neutral-200 dark:border-neutral-800 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">Settings</h3>
              <button onClick={() => setIsSettingsOpen(false)} className="p-1 text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition"><X size={18} /></button>
            </div>

            <div className="bg-primary-50 dark:bg-primary-900/10 p-4 rounded-xl border border-primary-100 dark:border-primary-800/20 mb-4">
              <label className="block text-xs font-bold text-primary-600 dark:text-primary-400 uppercase tracking-wider mb-2">Gemini API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="AIza..."
                className="w-full bg-white dark:bg-neutral-950 border border-primary-200 dark:border-primary-800/50 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500 font-mono"
              />
              <p className="text-[10px] text-primary-600/70 dark:text-primary-400/70 mt-2 leading-relaxed">
                Enter your Google Gemini API Key. This key is stored locally in your browser and used for transcription and lyrics generation.
              </p>
            </div>

            <div className="flex gap-2">
              <button onClick={() => setIsSettingsOpen(false)} className="flex-1 py-2.5 text-neutral-500 text-sm font-medium hover:text-neutral-900 dark:hover:text-neutral-100 transition">Cancel</button>
              <button onClick={saveApiKey} className="flex-1 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-primary-600/20 transition">Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}