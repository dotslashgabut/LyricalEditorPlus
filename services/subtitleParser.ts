import { Cue, SubtitleFormat, Word, Metadata } from '../types';
import { msToLrc, msToSrt, msToVtt, timeToMs } from '../utils/timeUtils';

export interface ParseResult {
  cues: Cue[];
  metadata: Metadata;
}

export const detectFormat = (filename: string, content: string): SubtitleFormat => {
  if (filename.endsWith('.lrc')) return SubtitleFormat.LRC;
  if (filename.endsWith('.srt')) return SubtitleFormat.SRT;
  if (filename.endsWith('.vtt')) return SubtitleFormat.VTT;
  if (filename.endsWith('.xml') || filename.endsWith('.ttml')) return SubtitleFormat.TTML;
  if (filename.endsWith('.json')) return SubtitleFormat.JSON;
  if (filename.endsWith('.txt')) return SubtitleFormat.TXT;

  // Fallback content checks
  const trimmed = content.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return SubtitleFormat.JSON;
  if (trimmed.startsWith('WEBVTT')) return SubtitleFormat.VTT;
  if (content.includes('http://www.w3.org/ns/ttml')) return SubtitleFormat.TTML;
  if (/^\[\d{2}:\d{2}\.\d{2}\]/.test(content)) return SubtitleFormat.LRC;
  
  return SubtitleFormat.SRT; // Default
};

// --- Parsers ---

const parseLRC = (content: string): ParseResult => {
  const lines = content.split(/\r?\n/);
  const cues: Cue[] = [];
  const regex = /\[(\d{2}:\d{2}(?:\.\d{2,3})?)\](.*)/;
  const wordRegex = /<(\d{2}:\d{2}(?:\.\d{2,3})?)>([^<]*)/g;
  
  const metadata: Metadata = {};

  // Extract Metadata
  const ti = content.match(/\[ti:(.*?)\]/);
  if (ti) metadata.title = ti[1].trim();
  const ar = content.match(/\[ar:(.*?)\]/);
  if (ar) metadata.artist = ar[1].trim();
  const al = content.match(/\[al:(.*?)\]/);
  if (al) metadata.album = al[1].trim();
  const by = content.match(/\[by:(.*?)\]/);
  if (by) metadata.by = by[1].trim();

  lines.forEach((line, index) => {
    const match = line.match(regex);
    if (match) {
      const start = timeToMs(match[1]);
      const rawText = match[2];
      
      // Check for Enhanced LRC words
      let text = rawText;
      let words: Word[] = [];
      
      // If content has <time> tag
      if (rawText.includes('<') && rawText.includes('>')) {
         let wordMatch;
         // Clean text from tags for main display
         text = rawText.replace(/<[^>]+>/g, '').trim();
         
         while ((wordMatch = wordRegex.exec(rawText)) !== null) {
           words.push({
             id: `w-${index}-${wordMatch.index}`,
             start: timeToMs(wordMatch[1]),
             text: wordMatch[2].trim()
           });
         }
      } else {
        text = text.trim();
      }

      cues.push({
        id: `lrc-${index}`,
        start,
        end: start + 3000, // Placeholder end time for LRC
        text,
        words: words.length > 0 ? words : undefined
      });
    }
  });

  // Infer end times
  for (let i = 0; i < cues.length - 1; i++) {
    cues[i].end = cues[i + 1].start;
  }
  return { cues, metadata };
};

const parseSRT = (content: string): ParseResult => {
  const chunks = content.trim().replace(/\r\n/g, '\n').split('\n\n');
  const cues = chunks.map((chunk, index) => {
    const lines = chunk.split('\n');
    if (lines.length < 2) return null;

    // Find timeline
    let timeLineIndex = 0;
    if (lines[0].match(/^\d+$/)) timeLineIndex = 1;
    
    if (!lines[timeLineIndex]) return null;

    const times = lines[timeLineIndex].split('-->');
    if (times.length !== 2) return null;

    const start = timeToMs(times[0].trim());
    const end = timeToMs(times[1].trim());
    const text = lines.slice(timeLineIndex + 1).join('\n');

    return {
      id: `srt-${index}`,
      start,
      end,
      text
    };
  }).filter(Boolean) as Cue[];

  return { cues, metadata: {} };
};

const parseVTT = (content: string): ParseResult => {
  const lines = content.trim().replace(/\r\n/g, '\n').split('\n');
  const cues: Cue[] = [];
  const metadata: Metadata = {};
  
  let currentCue: Partial<Cue> | null = null;
  let textBuffer: string[] = [];
  let wordBuffer: Word[] = [];
  
  // Basic metadata extraction from header comments
  lines.forEach(line => {
      if (line.startsWith('Note Title:')) metadata.title = line.replace('Note Title:', '').trim();
  });

  // Skip header
  let i = 0;
  if (lines[0].startsWith('WEBVTT')) i = 1;

  for (; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (line.includes('-->')) {
      if (currentCue && textBuffer.length > 0) {
        currentCue.text = textBuffer.join('\n');
        if (wordBuffer.length > 0) currentCue.words = wordBuffer;
        cues.push(currentCue as Cue);
        textBuffer = [];
        wordBuffer = [];
      }
      
      const times = line.split('-->');
      const start = timeToMs(times[0].trim().split(' ')[0]);
      const end = timeToMs(times[1].trim().split(' ')[0]);
      
      currentCue = {
        id: `vtt-${i}`,
        start,
        end,
        words: []
      };
    } else if (line === '' && currentCue) {
      if (textBuffer.length > 0) {
        currentCue.text = textBuffer.join('\n');
        if (wordBuffer.length > 0) currentCue.words = wordBuffer;
        cues.push(currentCue as Cue);
        currentCue = null;
        textBuffer = [];
        wordBuffer = [];
      }
    } else if (currentCue) {
      const timestampRegex = /<(\d{2}:\d{2}(?::\d{2})?[.,]\d{3})>/g;
      const cleanLine = line.replace(/<[^>]+>/g, '').trim();
      textBuffer.push(cleanLine);

      if (timestampRegex.test(line)) {
        timestampRegex.lastIndex = 0;
        const parts = line.split(timestampRegex);
        let currentTime = currentCue.start || 0;
        
        for (let k = 0; k < parts.length; k += 2) {
           const textPart = parts[k];
           const timePart = parts[k+1];
           const cleanText = textPart.replace(/<[^>]+>/g, '').trim();
           
           if (cleanText) {
             const wordsInPart = cleanText.split(/\s+/);
             const durationPerWord = (timePart ? (timeToMs(timePart) - currentTime) : 0) / wordsInPart.length;
             
             wordsInPart.forEach((w, wIdx) => {
                wordBuffer.push({
                   id: `vtt-w-${i}-${wordBuffer.length}`,
                   text: w,
                   start: currentTime + (durationPerWord * wIdx),
                });
             });
           }
           
           if (timePart) {
             currentTime = timeToMs(timePart);
           }
        }
      }
    }
  }

  if (currentCue && textBuffer.length > 0) {
    currentCue.text = textBuffer.join('\n');
    if (wordBuffer.length > 0) currentCue.words = wordBuffer;
    cues.push(currentCue as Cue);
  }

  return { cues, metadata };
};

const parseTTML = (content: string): ParseResult => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(content, "text/xml");
  const ps = xmlDoc.getElementsByTagName("p");
  const cues: Cue[] = [];

  const extractText = (node: Node): string => {
    let result = '';
    for (let i = 0; i < node.childNodes.length; i++) {
      const child = node.childNodes[i];
      if (child.nodeType === Node.TEXT_NODE) {
        result += child.textContent || '';
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as Element;
        const tagName = el.localName ? el.localName.toLowerCase() : el.tagName.toLowerCase();
        
        if (tagName === 'br') {
          result += '\n';
        } else if (tagName !== 'metadata' && tagName !== 'head' && tagName !== 'style') {
          result += extractText(child);
        }
      }
    }
    return result;
  };

  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    const begin = p.getAttribute("begin");
    const end = p.getAttribute("end");
    const dur = p.getAttribute("dur");
    
    // Flatten text: replace newlines inside the tag with space, clean up excessive space
    const rawText = extractText(p);
    const text = rawText.replace(/\s+/g, ' ').trim(); 
    
    const startMs = timeToMs(begin || "0");
    let endMs = end ? timeToMs(end) : startMs + 2000;
    if (dur) endMs = startMs + timeToMs(dur);

    cues.push({
      id: `ttml-${i}`,
      start: startMs,
      end: endMs,
      text: text
    });
  }
  return { cues, metadata: {} };
};

const parseJSON = (content: string): ParseResult => {
    try {
        const parsed = JSON.parse(content);
        const cuesRaw = Array.isArray(parsed) ? parsed : (parsed.cues || []);
        const metadata = (!Array.isArray(parsed) && parsed.metadata) ? parsed.metadata : { title: '', artist: '', album: '', by: '' };
        
        // Sanitize: ensure start/end are numbers and words are processed
        const cues = cuesRaw.map((c: any, i: number) => {
            const start = typeof c.start === 'number' ? c.start : timeToMs(String(c.start || '0'));
            const end = typeof c.end === 'number' ? c.end : timeToMs(String(c.end || '0'));
            
            let words: Word[] | undefined = undefined;
            if (Array.isArray(c.words)) {
                words = c.words.map((w: any, wi: number) => ({
                    id: w.id || `json-w-${i}-${wi}`,
                    text: w.text || '',
                    // Ensure word timestamps are also numbers
                    start: typeof w.start === 'number' ? w.start : timeToMs(String(w.start || '0')),
                    end: typeof w.end === 'number' ? w.end : (w.end ? timeToMs(String(w.end)) : undefined)
                }));
            }

            return {
                id: c.id || `json-${i}`,
                start,
                end,
                text: c.text || '',
                words
            };
        });

        return { cues, metadata };
    } catch (e) {
        console.error("JSON parse error", e);
        return { cues: [], metadata: {} };
    }
}

// --- Stringifiers ---

const stringifyLRC = (cues: Cue[], enhanced: boolean = false, metadata?: Metadata): string => {
  let header = '';
  if (metadata) {
    if (metadata.title) header += `[ti:${metadata.title}]\n`;
    if (metadata.artist) header += `[ar:${metadata.artist}]\n`;
    if (metadata.album) header += `[al:${metadata.album}]\n`;
    if (metadata.by) header += `[by:${metadata.by}]\n`;
  }

  const body = cues.map(cue => {
    let line = `[${msToLrc(cue.start)}]`;
    if (enhanced && cue.words && cue.words.length > 0) {
      line += cue.words.map(w => `<${msToLrc(w.start || cue.start)}>${w.text}`).join(' ');
    } else {
      line += cue.text;
    }
    return line;
  }).join('\n');
  
  return header + body;
};

const stringifySRT = (cues: Cue[]): string => {
  return cues.map((cue, index) => {
    return `${index + 1}\n${msToSrt(cue.start)} --> ${msToSrt(cue.end)}\n${cue.text}\n`;
  }).join('\n');
};

const stringifyVTT = (cues: Cue[], karaoke: boolean = false, metadata?: Metadata): string => {
  let header = 'WEBVTT\n';
  if (metadata?.title) header += `Note Title: ${metadata.title}\n`;
  header += '\n';

  return header + cues.map(cue => {
    let text = cue.text;
    if (karaoke && cue.words && cue.words.length > 0) {
       text = cue.words.map(w => {
         return `<${msToVtt(w.start || cue.start)}>${w.text}`;
       }).join(' ');
    }
    return `${msToVtt(cue.start)} --> ${msToVtt(cue.end)}\n${text}\n`;
  }).join('\n');
};

const stringifyTTML = (cues: Cue[], karaoke: boolean = false): string => {
  const body = cues.map(cue => {
    let content = cue.text.replace(/\n/g, '<br/>');
    if (karaoke && cue.words && cue.words.length > 0) {
       const spans = cue.words.map(w => {
         const startOffset = Math.max(0, (w.start || cue.start) - cue.start);
         let endOffset = Math.max(0, (w.end || ((w.start || cue.start) + 300)) - cue.start);
         return `<span begin="${msToVtt(startOffset)}" end="${msToVtt(endOffset)}">${w.text}</span>`;
       });
       content = '\n' + spans.map(s => `        ${s}`).join('\n') + '\n      ';
    }
    return `      <p begin="${msToVtt(cue.start)}" end="${msToVtt(cue.end)}">${content}</p>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/ttml" lang="en">
  <body>
    <div>
${body}
    </div>
  </body>
</tt>`;
};

const stringifyTXT = (cues: Cue[]): string => {
  let result = '';
  // Threshold to consider a gap as a stanza break (e.g. 2000ms)
  const STANZA_BREAK_THRESHOLD = 2000;

  for (let i = 0; i < cues.length; i++) {
    result += cues[i].text + '\n';
    
    // Check for gap to next cue to insert blank line
    if (i < cues.length - 1) {
      const currentEnd = cues[i].end;
      const nextStart = cues[i + 1].start;
      const gap = nextStart - currentEnd;

      if (gap >= STANZA_BREAK_THRESHOLD) {
        result += '\n';
      }
    }
  }
  return result.trim();
};

const stringifyJSON = (cues: Cue[], metadata?: Metadata): string => {
  return JSON.stringify({ metadata, cues }, null, 2);
};

// --- Public API ---

export const parseContent = (content: string, format: SubtitleFormat): ParseResult => {
  switch (format) {
    case SubtitleFormat.LRC:
    case SubtitleFormat.LRC_ENHANCED:
      return parseLRC(content);
    case SubtitleFormat.SRT:
      return parseSRT(content);
    case SubtitleFormat.VTT:
      return parseVTT(content);
    case SubtitleFormat.TTML:
      return parseTTML(content);
    case SubtitleFormat.JSON:
      return parseJSON(content);
    case SubtitleFormat.TXT:
      return {
        cues: content.split(/\r?\n/).filter(l => l.trim() !== '').map((l, i) => ({
          id: `txt-${i}`,
          start: i * 2000,
          end: (i + 1) * 2000,
          text: l.trim()
        })),
        metadata: {}
      };
    default:
      return parseSRT(content);
  }
};

export const stringifyContent = (cues: Cue[], format: SubtitleFormat, metadata?: Metadata): string => {
  switch (format) {
    case SubtitleFormat.LRC:
      return stringifyLRC(cues, false, metadata);
    case SubtitleFormat.LRC_ENHANCED:
      return stringifyLRC(cues, true, metadata);
    case SubtitleFormat.SRT:
      return stringifySRT(cues);
    case SubtitleFormat.VTT:
      return stringifyVTT(cues, false, metadata);
    case SubtitleFormat.VTT_KARAOKE:
      return stringifyVTT(cues, true, metadata);
    case SubtitleFormat.TTML:
      return stringifyTTML(cues, false);
    case SubtitleFormat.TTML_KARAOKE:
      return stringifyTTML(cues, true);
    case SubtitleFormat.TXT:
      return stringifyTXT(cues);
    case SubtitleFormat.JSON:
      return stringifyJSON(cues, metadata);
    default:
      return stringifySRT(cues);
  }
};