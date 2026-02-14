

import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Cue, Word } from '../types';
import { timeToMs } from '../utils/timeUtils';

// Initialize Gemini API
// Using process.env.API_KEY as per instructions
// Initialize Gemini API
// Helper to get fresh client with current key
export const getGenAIClient = () => {
  const storedKey = localStorage.getItem('gemini_api_key');
  const apiKey = storedKey || process.env.API_KEY;

  if (!apiKey || apiKey === 'PLACEHOLDER_API_KEY') {
    throw new Error("Gemini API Key is missing. Please add it in Settings.");
  }

  return new GoogleGenAI({ apiKey });
};

/**
 * Helper to convert file to base64 for Gemini
 */
export const fileToPart = async (file: File): Promise<{ inlineData: { data: string, mimeType: string } }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64Data = result.split(',')[1];
      resolve({
        inlineData: {
          data: base64Data,
          mimeType: file.type
        }
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export interface TranscriptionOptions {
  model: string;
  mode: 'lines' | 'words';
}

export const transcribeAudio = async (
  file: File,
  options: TranscriptionOptions,
  signal?: AbortSignal
): Promise<Cue[]> => {
  // Check file size (20MB limit for inline data)
  if (file.size > 20 * 1024 * 1024) {
    throw new Error("File size exceeds 20MB limit for inline media. Please use a smaller file or split the audio.");
  }

  const modelName = options.model || 'gemini-2.5-flash';

  const audioPart = await fileToPart(file);

  const isWordsMode = options.mode === 'words';

  const timingInstructions = `
    IMPORTANT TIMING RULES:
    1. Timestamps MUST be returned as STRINGS in "MM:SS.mmm" format (e.g., "01:29.014" or "02:06.097").
    2. These are ABSOLUTE timestamps from the beginning of the audio (0:00.000). 
    3. Do NOT reset timestamps. They must strictly increase.
    4. CRITICAL MATH: 1 minute is 60 seconds. 
       - If you see 2:06 in the audio, the timestamp is "02:06.000".
       - DO NOT calculate milliseconds yourself. 
       - AVOID the error where 2:06 becomes 206 seconds. 
    5. High precision is required for word-level sync.
  `;

  const prompt = isWordsMode
    ? `Transcribe the audio accurately into lyrics/subtitles. 
       Return a JSON array of cues. 
       Each cue represents a LINE of lyrics/speech.
       Crucially, for EACH line, include a "words" array containing every word with its specific start and end timestamp.
       ${timingInstructions}
       TRANSCRIPTION RULES:
       1. Keep the text verbatim/raw.
       2. CRITICAL: Include ALL repetitions (e.g., "baby baby baby") AND all filler sounds/vocals (e.g., "um", "ah", "e e e", "ooh", "na na").
       3. Do NOT clean up disfluencies, stutters, or repetitions.
       4. Maintain the originality of the source audio exactly as heard.`
    : `Transcribe the audio accurately into lyrics/subtitles. 
       Return a JSON array of cues where each cue is a sentence or subtitle line.
       Each cue must have 'start' (ms), 'end' (ms), and 'text'.
       ${timingInstructions}
       TRANSCRIPTION RULES:
       1. Keep the text verbatim/raw.
       2. CRITICAL: Include ALL repetitions (e.g., "no no no") AND all filler sounds/vocals (e.g., "um", "ah", "e e e", "ooh", "na na").
       3. Do NOT clean up disfluencies, stutters, or repetitions.
       4. Maintain the originality of the source audio exactly as heard.`;

  // Define Schema
  const wordSchema = {
    type: Type.OBJECT,
    properties: {
      text: { type: Type.STRING },
      start: { type: Type.STRING },
      end: { type: Type.STRING }
    },
    required: ['text', 'start', 'end']
  };

  const cueSchema = {
    type: Type.OBJECT,
    properties: {
      text: { type: Type.STRING },
      start: { type: Type.STRING },
      end: { type: Type.STRING },
      words: {
        type: Type.ARRAY,
        items: wordSchema
      }
    },
    required: isWordsMode ? ['text', 'start', 'end', 'words'] : ['text', 'start', 'end']
  };

  const responseSchema = {
    type: Type.ARRAY,
    items: cueSchema
  };

  const sanitizeTime = (val: any, fallback: number = 0): number => {
    const str = String(val || '').trim();
    if (!str) return fallback;

    // Use project-wide timeToMs utility for consistent parsing
    const parsed = timeToMs(str);
    if (parsed > 0 || str === '0' || str.includes('00:00')) return parsed;

    const num = parseFloat(str);
    if (!isNaN(num)) return Math.round(num);

    return fallback;
  };

  try {
    const generateReq = getGenAIClient().models.generateContent({
      model: modelName,
      contents: {
        parts: [
          audioPart,
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        temperature: 0.3
      }
    });

    let response;

    if (signal) {
      const abortPromise = new Promise<never>((_, reject) => {
        const handleAbort = () => reject(new DOMException('Aborted', 'AbortError'));
        if (signal.aborted) handleAbort();
        else signal.addEventListener('abort', handleAbort);
      });
      response = await Promise.race([generateReq, abortPromise]);
    } else {
      response = await generateReq;
    }

    if (response.text) {
      const rawCues = JSON.parse(response.text);
      // Map to application Cue type
      return rawCues.map((c: any, index: number) => {
        const start = sanitizeTime(c.start, 0);
        const end = sanitizeTime(c.end, start + 2000);

        return {
          id: `ai-${index}-${Date.now()}`,
          start,
          end,
          text: c.text || '',
          words: c.words ? c.words.map((w: any, wi: number) => ({
            id: `ai-w-${index}-${wi}`,
            text: w.text,
            start: sanitizeTime(w.start, start),
            end: sanitizeTime(w.end, end)
          })) : undefined
        };
      });
    }
    return [];
  } catch (error: any) {
    if (error.name === 'AbortError' || (signal && signal.aborted)) {
      throw new Error("Transcription cancelled by user.");
    }
    console.error("Transcription failed", error);
    throw error;
  }
};

export const generateLyrics = async (
  topic: string,
  model: string = 'gemini-2.5-flash'
): Promise<Cue[]> => {
  const prompt = `Generate song lyrics about: "${topic}". 
  Return the result as a plain text string with line breaks. 
  Separate stanzas (Verses/Chorus) with an empty line.
  Do not include [Verse], [Chorus] tags, just the lyrics lines.`;

  try {
    const response = await getGenAIClient().models.generateContent({
      model: model,
      contents: prompt,
      config: {
        temperature: 0.7
      }
    });

    const text = response.text;
    if (!text) return [];

    const cues: Cue[] = [];
    let currentTime = 0;
    const LINE_DURATION = 3000; // 3 seconds per line
    const STANZA_GAP = 4000;    // 4 seconds gap between stanzas

    const lines = text.split('\n');
    let cueIndex = 0;

    lines.forEach((line) => {
      const cleanLine = line.trim();

      if (!cleanLine) {
        // Found a blank line/stanza break.
        // Advance time to create a gap, but don't add a cue.
        currentTime += STANZA_GAP;
        return;
      }

      // Add Cue
      cues.push({
        id: `gen-${cueIndex++}`,
        start: currentTime,
        end: currentTime + LINE_DURATION,
        text: cleanLine
      });

      // Advance time for next line
      currentTime += LINE_DURATION;
    });

    return cues;
  } catch (error) {
    console.error("Generation failed", error);
    throw error;
  }
};

export const refineLyrics = async (
  cues: Cue[],
  instruction: string,
  model: string = 'gemini-2.5-flash'
): Promise<Cue[]> => {
  const simplifiedCues = cues.map(c => ({ id: c.id, text: c.text }));

  const prompt = `Refine the following lyrics based on this instruction: "${instruction}".
  
  Input Lyrics JSON:
  ${JSON.stringify(simplifiedCues)}

  Return a JSON array with objects containing 'id' and 'text'. 
  Keep the IDs matching the input so I can map them back. 
  If you split lines or add new ones, generate new unique IDs starting with 'ai-new-'.`;

  const responseSchema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.STRING },
        text: { type: Type.STRING }
      },
      required: ['id', 'text']
    }
  };

  try {
    const response = await getGenAIClient().models.generateContent({
      model: model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema
      }
    });

    if (response.text) {
      const refinedData = JSON.parse(response.text);

      const idMap = new Map(cues.map(c => [c.id, c]));
      const newCues: Cue[] = [];
      let lastEnd = 0;

      for (const item of refinedData) {
        const original = idMap.get(item.id);
        if (original) {
          newCues.push({
            ...original,
            text: item.text,
            words: item.text !== original.text ? undefined : original.words
          });
          lastEnd = original.end;
        } else {
          newCues.push({
            id: item.id || `refine-${Date.now()}-${newCues.length}`,
            start: lastEnd,
            end: lastEnd + 2000,
            text: item.text
          });
          lastEnd += 2000;
        }
      }
      return newCues;
    }
    return cues;
  } catch (error) {
    console.error("Refinement failed", error);
    throw error;
  }
};

// --- TTS Features (Hybrid: Google Translate + Web Speech API) ---

let currentAudio: HTMLAudioElement | null = null;

// Basic language detection
// Comprehensive list of Google Translate supported languages
export const TTS_LANGUAGES = [
  { code: 'auto', name: 'Auto Detect' },
  { code: 'af', name: 'Afrikaans' },
  { code: 'sq', name: 'Albanian' },
  { code: 'ar', name: 'Arabic' },
  { code: 'hy', name: 'Armenian' },
  { code: 'bn', name: 'Bengali' },
  { code: 'bs', name: 'Bosnian' },
  { code: 'ca', name: 'Catalan' },
  { code: 'hr', name: 'Croatian' },
  { code: 'cs', name: 'Czech' },
  { code: 'da', name: 'Danish' },
  { code: 'nl', name: 'Dutch' },
  { code: 'en-US', name: 'English (US)' },
  { code: 'en-GB', name: 'English (UK)' },
  { code: 'en-AU', name: 'English (Australia)' },
  { code: 'eo', name: 'Esperanto' },
  { code: 'et', name: 'Estonian' },
  { code: 'tl', name: 'Filipino' },
  { code: 'fi', name: 'Finnish' },
  { code: 'fr-FR', name: 'French' },
  { code: 'de-DE', name: 'German' },
  { code: 'el', name: 'Greek' },
  { code: 'gu', name: 'Gujarati' },
  { code: 'hi', name: 'Hindi' },
  { code: 'hu', name: 'Hungarian' },
  { code: 'is', name: 'Icelandic' },
  { code: 'id', name: 'Indonesian' },
  { code: 'it-IT', name: 'Italian' },
  { code: 'ja', name: 'Japanese' },
  { code: 'jw', name: 'Javanese' },
  { code: 'kn', name: 'Kannada' },
  { code: 'km', name: 'Khmer' },
  { code: 'ko', name: 'Korean' },
  { code: 'la', name: 'Latin' },
  { code: 'lv', name: 'Latvian' },
  { code: 'mk', name: 'Macedonian' },
  { code: 'ml', name: 'Malayalam' },
  { code: 'mr', name: 'Marathi' },
  { code: 'my', name: 'Myanmar (Burmese)' },
  { code: 'ne', name: 'Nepali' },
  { code: 'no', name: 'Norwegian' },
  { code: 'pl', name: 'Polish' },
  { code: 'pt-BR', name: 'Portuguese (Brazil)' },
  { code: 'pt-PT', name: 'Portuguese (Portugal)' },
  { code: 'ro', name: 'Romanian' },
  { code: 'ru', name: 'Russian' },
  { code: 'sr', name: 'Serbian' },
  { code: 'si', name: 'Sinhala' },
  { code: 'sk', name: 'Slovak' },
  { code: 'es-ES', name: 'Spanish (Spain)' },
  { code: 'es-US', name: 'Spanish (US)' },
  { code: 'su', name: 'Sundanese' },
  { code: 'sw', name: 'Swahili' },
  { code: 'sv', name: 'Swedish' },
  { code: 'ta', name: 'Tamil' },
  { code: 'te', name: 'Telugu' },
  { code: 'th', name: 'Thai' },
  { code: 'tr', name: 'Turkish' },
  { code: 'uk', name: 'Ukrainian' },
  { code: 'ur', name: 'Urdu' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'cy', name: 'Welsh' }
];

// Simplified language detection (trusts Browser or assumes English)
const detectLanguage = (text: string): string => {
  // If the user hasn't selected a language, we mostly rely on the browser's default
  // or default to English. The specific character detection has been removed
  // in favor of manual selection from the comprehensive list.
  if (typeof navigator !== 'undefined') {
    return navigator.language;
  }
  return 'en-US';
};

export const stopTTS = () => {
  // Stop Google TTS (Audio Element)
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    } catch (e) {
      // ignore
    }
    currentAudio = null;
  }

  // Stop Web Speech API
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
};

export const playTTS = async (text: string, forcedLanguage: string = 'auto') => {
  stopTTS(); // Stop any existing playback

  const textToSpeak = text.trim();
  if (!textToSpeak) return;

  let targetLang = forcedLanguage;
  let specificVoiceName: string | undefined;

  // Check if forcedLanguage contains a specific voice name (format: "lang|Voice Name")
  if (targetLang && targetLang.includes('|')) {
    const parts = targetLang.split('|');
    targetLang = parts[0];
    specificVoiceName = parts[1];
  }

  // Resolve language for Google TTS (needs specific code)
  // If targetLang is 'auto', we try browser detection or default to US English
  const resolvedLang = (targetLang === 'auto' || !targetLang) ? detectLanguage(textToSpeak) : targetLang;

  console.log(`TTS: Playing text. Lang: '${targetLang}' (Resolved: ${resolvedLang}), Voice: ${specificVoiceName || 'Default'}`);

  // Strategy 1: Attempt Google TTS (only if we have a resolved language and no specific voice forced)
  if (!specificVoiceName && resolvedLang && resolvedLang !== 'auto') {
    try {
      await playGoogleTTS(textToSpeak, resolvedLang);
      return;
    } catch (e) {
      console.warn("Google TTS failed/unsupported, falling back to Web Speech API.", e);
      // Fallthrough to Web Speech
    }
  }

  // Strategy 2: Web Speech API
  // We pass the original targetLang (which might be 'auto') to let Web Speech decide if it wants to use default
  await playWebSpeech(textToSpeak, targetLang, specificVoiceName);
};



const playGoogleTTS = (text: string, lang: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const encodedText = encodeURIComponent(text);
    // client=tw-ob is the key for the unofficial API
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodedText}&tl=${lang}&client=tw-ob`;
    const audio = new Audio(url);
    currentAudio = audio;

    audio.onended = () => {
      if (currentAudio === audio) currentAudio = null;
      resolve();
    };
    audio.onerror = (e) => {
      reject(new Error("Google TTS Audio Error"));
    };
    audio.play().catch(reject);
  });
};

const playWebSpeech = (text: string, lang: string, voiceName?: string): Promise<void> => {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    throw new Error("Text-to-Speech is not supported in this browser.");
  }

  return new Promise<void>((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text);

    // Only set language if it's not 'auto', otherwise let browser default take over
    if (lang && lang !== 'auto') {
      utterance.lang = lang;
    }

    utterance.rate = 1.0;

    // Voice Selection
    const voices = window.speechSynthesis.getVoices();
    let matchingVoice: SpeechSynthesisVoice | undefined;

    // 1. Specific Voice Name (Highest Priority)
    if (voiceName) {
      matchingVoice = voices.find(v => v.name === voiceName);
    }

    // 2. Language Match (only if specific voice not found AND lang is not auto)
    if (!matchingVoice && lang && lang !== 'auto') {
      // Exact match
      matchingVoice = voices.find(v => v.lang === lang);
      // Base match
      if (!matchingVoice) {
        matchingVoice = voices.find(v => v.lang.startsWith(lang.split('-')[0]));
      }
    }

    if (matchingVoice) {
      utterance.voice = matchingVoice;
    }

    utterance.onend = () => resolve();
    utterance.onerror = (e) => {
      if (e.error === 'interrupted' || e.error === 'canceled') {
        resolve();
      } else {
        reject(new Error(`TTS Error: ${e.error}`));
      }
    };

    window.speechSynthesis.speak(utterance);
  });
};