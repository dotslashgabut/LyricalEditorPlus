/**
 * Converts milliseconds to HH:MM:SS,ms (SRT format)
 */
export const msToSrt = (ms: number): string => {
  const date = new Date(ms);
  const h = Math.floor(ms / 3600000).toString().padStart(2, '0');
  const m = date.getUTCMinutes().toString().padStart(2, '0');
  const s = date.getUTCSeconds().toString().padStart(2, '0');
  const mis = date.getUTCMilliseconds().toString().padStart(3, '0');
  return `${h}:${m}:${s},${mis}`;
};

/**
 * Converts milliseconds to MM:SS.xx (LRC format)
 */
export const msToLrc = (ms: number): string => {
  const date = new Date(ms);
  const m = Math.floor(ms / 60000).toString().padStart(2, '0');
  const s = date.getUTCSeconds().toString().padStart(2, '0');
  const centis = Math.floor(date.getUTCMilliseconds() / 10).toString().padStart(2, '0');
  return `${m}:${s}.${centis}`;
};

/**
 * Converts milliseconds to HH:MM:SS.ms (VTT format)
 */
export const msToVtt = (ms: number): string => {
  const date = new Date(ms);
  const h = Math.floor(ms / 3600000).toString().padStart(2, '0');
  const m = date.getUTCMinutes().toString().padStart(2, '0');
  const s = date.getUTCSeconds().toString().padStart(2, '0');
  const mis = date.getUTCMilliseconds().toString().padStart(3, '0');
  return `${h}:${m}:${s}.${mis}`;
};

/**
 * Parses timestamp string to milliseconds. 
 * Supports: 
 * - 00:00.00 (LRC)
 * - 00:00:00,000 (SRT)
 * - 00:00:00.000 (VTT)
 */
export const timeToMs = (timeStr: string): number => {
  if (!timeStr) return 0;
  
  // Clean string
  const cleanStr = timeStr.trim();
  
  // Check for LRC format (MM:SS.xx) or (MM:SS)
  const lrcMatch = cleanStr.match(/^(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?$/);
  if (lrcMatch) {
    const m = parseInt(lrcMatch[1], 10);
    const s = parseInt(lrcMatch[2], 10);
    const msStr = lrcMatch[3] || '0';
    // pad to 3 digits then parse, or multiply based on length.
    // .xx is centiseconds (x10), .xxx is ms (x1).
    let ms = 0;
    if (msStr.length === 2) ms = parseInt(msStr, 10) * 10;
    else if (msStr.length === 1) ms = parseInt(msStr, 10) * 100;
    else ms = parseInt(msStr, 10);
    
    return (m * 60000) + (s * 1000) + ms;
  }

  // Check for SRT/VTT (HH:MM:SS.ms or HH:MM:SS,ms)
  const fullMatch = cleanStr.match(/^(\d{1,2}):(\d{2}):(\d{2})[.,](\d{1,3})$/);
  if (fullMatch) {
    const h = parseInt(fullMatch[1], 10);
    const m = parseInt(fullMatch[2], 10);
    const s = parseInt(fullMatch[3], 10);
    const ms = parseInt(fullMatch[4].padEnd(3, '0'), 10);
    return (h * 3600000) + (m * 60000) + (s * 1000) + ms;
  }

  return 0;
};
