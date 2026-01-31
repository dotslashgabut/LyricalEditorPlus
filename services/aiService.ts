

import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Cue, Word } from '../types';

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
    1. Timestamps must be ABSOLUTE integers in MILLISECONDS from the very start of the file.
    2. Do NOT reset timestamps at any point. They must strictly increase.
    3. Correctly calculate time > 1 minute.
       - 1 minute = 60000 ms
       - 1 minute 30 seconds = 90000 ms
       - 2 minutes = 120000 ms
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

// --- TTS Features ---

// Audio Decoding Helpers
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

let ttsAudioContext: AudioContext | null = null;
let currentSource: AudioBufferSourceNode | null = null;
let activeRequestId = 0;

export const stopTTS = () => {
  activeRequestId++; // Increment to invalidate any pending async operations
  if (currentSource) {
    try {
      currentSource.stop();
    } catch (e) {
      // ignore if already stopped
    }
    currentSource = null;
  }
};

export const playTTS = async (text: string) => {
  stopTTS(); // Stop any existing playback/request

  const requestId = activeRequestId;

  let textToSpeak = text.trim();
  if (!textToSpeak) return;

  if (!ttsAudioContext) {
    ttsAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  }

  // Ensure context is running (needed for some browsers if not initiated by user gesture recently)
  if (ttsAudioContext.state === 'suspended') {
    await ttsAudioContext.resume();
  }

  // WORKAROUND: For very short text (likely single words), appending punctuation 
  // helps the model recognize it as a distinct utterance to pronounce.
  // Otherwise, it might treat it as a fragment or silence and return no audio.
  if (textToSpeak.length < 5 && !/[.?!,;:]$/.test(textToSpeak)) {
    textToSpeak += ".";
  }

  try {
    const response = await getGenAIClient().models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: textToSpeak }] }],
      config: {
        // Use string cast for Modality to prevent potential Enum issues at runtime with some bundlers
        responseModalities: ['AUDIO' as Modality],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    if (requestId !== activeRequestId) return; // Aborted during API call

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    if (!base64Audio) {
      // Debugging checks
      const textResponse = response.candidates?.[0]?.content?.parts?.[0]?.text;
      if (textResponse) {
        console.warn("TTS API returned text instead of audio:", textResponse);
        throw new Error("TTS failed: The model returned text instead of audio. Please try again.");
      }
      if (response.candidates?.[0]?.finishReason) {
        // Check safety ratings or other reasons if available in full log
        console.warn("TTS Finish Reason:", response.candidates[0].finishReason);
        throw new Error(`TTS generation stopped. Reason: ${response.candidates[0].finishReason}`);
      }
      throw new Error("No audio data returned from TTS. The word might be too short or filtered.");
    }

    const audioBuffer = await decodeAudioData(
      decode(base64Audio),
      ttsAudioContext,
      24000,
      1
    );

    if (requestId !== activeRequestId) return; // Aborted during decoding

    const source = ttsAudioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ttsAudioContext.destination);
    currentSource = source;
    source.start();

    return new Promise<void>((resolve) => {
      source.onended = () => {
        if (currentSource === source) currentSource = null;
        resolve();
      };
    });

  } catch (error) {
    console.error("TTS Error:", error);
    throw error;
  }
};
