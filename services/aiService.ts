import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Cue, Word } from '../types';

// Initialize Gemini API
// Using process.env.API_KEY as per instructions
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

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
    CRITICAL TIMING INSTRUCTIONS:
    1. Timestamps are ABSOLUTE milliseconds (ms) from file start (0ms).
    2. INSTRUMENTAL BREAKS & GAPS: 
       - When music plays without vocals (solos, intros, bridges), do NOT generate text.
       - CRITICAL: When vocals resume, the timestamp MUST jump forward to match the actual elapsed time.
       - Example: If vocals stop at 60000ms and resume after a 20s solo, the next timestamp must be ~80000ms. Do not just continue counting from 60000ms.
    3. 1 minute = 60000ms. 2 min = 120000ms. Check your time calculations.
  `;

  const commonRules = `
    TRANSCRIPTION RULES:
    1. Verbatim transcription. Write exactly what you hear.
    2. SONG STRUCTURE:
       - This audio likely contains music. Expect instrumental sections.
       - Do NOT hallucinate text during instrumental breaks.
    3. REPETITIONS:
       - Transcribe sung repetitions (e.g. "baby, baby") exactly as heard.
       - Do NOT hallucinate infinite loops or stuck text.
    4. FILLERS: Exclude "um", "ah" unless part of the lyrics.
  `;

  const prompt = isWordsMode 
    ? `Transcribe audio to lyrics (JSON).
       Format: Array of cues (lines).
       EACH CUE MUST HAVE A "words" ARRAY.
       Word Schema: { text: string, start: int (ms), end: int (ms) }
       ${timingInstructions}
       ${commonRules}`
    : `Transcribe audio to lyrics (JSON).
       Format: Array of cues (lines).
       Cue Schema: { text: string, start: int (ms), end: int (ms) }
       ${timingInstructions}
       ${commonRules}`;

  // Define Schema
  const wordSchema = {
    type: Type.OBJECT,
    properties: {
      text: { type: Type.STRING },
      start: { type: Type.INTEGER },
      end: { type: Type.INTEGER }
    },
    required: ['text', 'start', 'end']
  };

  const cueSchema = {
    type: Type.OBJECT,
    properties: {
      text: { type: Type.STRING },
      start: { type: Type.INTEGER },
      end: { type: Type.INTEGER },
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

  try {
    const generateReq = ai.models.generateContent({
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
        temperature: 0.0, // Strict adherence to audio
        topP: 0.8, // Reduced to prevent loop hallucinations
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
      return rawCues.map((c: any, index: number) => ({
        id: `ai-${index}-${Date.now()}`,
        start: c.start || 0,
        end: c.end || 0,
        text: c.text || '',
        words: c.words ? c.words.map((w: any, wi: number) => ({
          id: `ai-w-${index}-${wi}`,
          text: w.text,
          start: w.start,
          end: w.end
        })) : undefined
      }));
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
    const response = await ai.models.generateContent({
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
    const response = await ai.models.generateContent({
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

// --- TTS Features (Google Translate Source) ---

let currentAudio: HTMLAudioElement | null = null;

export const stopTTS = () => {
    if (currentAudio) {
        try {
            currentAudio.pause();
            currentAudio.currentTime = 0;
        } catch (e) {
            // ignore if already stopped or error
        }
        currentAudio = null;
    }
};

export const playTTS = async (text: string) => {
    stopTTS(); // Stop any existing playback
    
    const textToSpeak = text.trim();
    if (!textToSpeak) return;

    // Use Google Translate's unofficial TTS API
    // client=tw-ob is key to access it freely
    // tl=en defaults to English. You could make this dynamic based on detected text language if needed.
    const encodedText = encodeURIComponent(textToSpeak);
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodedText}&tl=en&client=tw-ob`;

    return new Promise<void>((resolve, reject) => {
        const audio = new Audio(url);
        currentAudio = audio;

        audio.onended = () => {
            if (currentAudio === audio) {
                currentAudio = null;
            }
            resolve();
        };

        audio.onerror = (e) => {
            console.error("TTS Playback Error", e);
            reject(new Error("Failed to play audio from Google Translate."));
        };

        // Attempt to play
        audio.play().catch(e => {
            // User interaction policy might block auto-play if not triggered by click
            reject(e);
        });
    });
};