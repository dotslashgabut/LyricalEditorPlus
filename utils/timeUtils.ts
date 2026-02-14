/**
 * Converts milliseconds to HH:MM:SS,ms (SRT format)
 */
export const msToSrt = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const milliseconds = Math.floor(ms % 1000);
  
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  const h = hours.toString().padStart(2, '0');
  const m = minutes.toString().padStart(2, '0');
  const s = seconds.toString().padStart(2, '0');
  const mis = milliseconds.toString().padStart(3, '0');

  return `${h}:${m}:${s},${mis}`;
};

/**
 * Converts milliseconds to MM:SS.xx (LRC format - 2 digit centiseconds)
 */
export const msToLrc = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const centiseconds = Math.floor((ms % 1000) / 10); // 10ms resolution
  
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60); // LRC allows minutes > 60

  const m = minutes.toString().padStart(2, '0');
  const s = seconds.toString().padStart(2, '0');
  const cs = centiseconds.toString().padStart(2, '0');

  return `${m}:${s}.${cs}`;
};

/**
 * Converts milliseconds to MM:SS.mmm (3 digit milliseconds)
 * Used for high-precision UI inputs
 */
export const msToMmSsMmm = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const milliseconds = Math.floor(ms % 1000);
  
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60);

  const m = minutes.toString().padStart(2, '0');
  const s = seconds.toString().padStart(2, '0');
  const mmm = milliseconds.toString().padStart(3, '0');

  return `${m}:${s}.${mmm}`;
};

/**
 * Converts milliseconds to HH:MM:SS.ms (VTT format)
 */
export const msToVtt = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const milliseconds = Math.floor(ms % 1000);
  
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  const h = hours.toString().padStart(2, '0');
  const m = minutes.toString().padStart(2, '0');
  const s = seconds.toString().padStart(2, '0');
  const mis = milliseconds.toString().padStart(3, '0');

  return `${h}:${m}:${s}.${mis}`;
};

/**
 * Parses timestamp string to milliseconds. 
 * Supports: 
 * - 00:00.00 (LRC)
 * - 00:00.000 (3-digit ms)
 * - 00:00:00,000 (SRT)
 * - 00:00:00.000 (VTT)
 * - 12.34s (TTML seconds)
 * - 1234ms (TTML milliseconds)
 */
export const timeToMs = (timeStr: string): number => {
  if (!timeStr) return 0;
  
  // Clean string and remove commas for safety
  const cleanStr = timeStr.trim().replace(/,/g, '');

  // Check for suffix formats (TTML/XML often uses these)
  if (cleanStr.endsWith('ms')) {
    return parseFloat(cleanStr.slice(0, -2));
  }
  if (cleanStr.endsWith('s')) {
    return parseFloat(cleanStr.slice(0, -1)) * 1000;
  }
  
  // Check for LRC format (MM:SS.xx) or (MM:SS.xxx)
  // Expanded to support M:SS.xx (single digit minute)
  const lrcMatch = cleanStr.match(/^(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?$/);
  if (lrcMatch) {
    const m = parseInt(lrcMatch[1], 10);
    const s = parseInt(lrcMatch[2], 10);
    const msStr = lrcMatch[3] || '0';
    // Logic to handle 1, 2, or 3 digits
    let ms = 0;
    if (msStr.length === 3) ms = parseInt(msStr, 10); // .123 -> 123ms
    else if (msStr.length === 2) ms = parseInt(msStr, 10) * 10; // .12 -> 120ms
    else if (msStr.length === 1) ms = parseInt(msStr, 10) * 100; // .1 -> 100ms
    else ms = parseInt(msStr, 10);
    
    return (m * 60000) + (s * 1000) + ms;
  }

  // Check for SRT/VTT (HH:MM:SS.ms or HH:MM:SS,ms)
  // Supports optional hours for flexibility
  const fullMatch = cleanStr.match(/^(?:(\d{1,2}):)?(\d{2}):(\d{2})[.,](\d{1,3})$/);
  if (fullMatch) {
    const h = fullMatch[1] ? parseInt(fullMatch[1], 10) : 0;
    const m = parseInt(fullMatch[2], 10);
    const s = parseInt(fullMatch[3], 10);
    const msStr = fullMatch[4];
    let ms = parseInt(msStr, 10);
    
    // Pad if less than 3 digits were provided
    if (msStr.length === 1) ms *= 100;
    else if (msStr.length === 2) ms *= 10;

    return (h * 3600000) + (m * 60000) + (s * 1000) + ms;
  }

  // Fallback: check if it is just a number
  if (/^\d+(\.\d+)?$/.test(cleanStr)) {
     const val = parseFloat(cleanStr);
     // Heuristic: If it has a decimal point, assume seconds (standard practice for unitless time)
     if (cleanStr.includes('.')) {
         return val * 1000;
     }
     // If it's a large integer, it's ambiguous. Standard says unitless = seconds.
     // However, for consistency with formatted times, we stick to seconds here.
     // Caller (AI parser) should handle "raw integer = ms" logic if needed.
     return val * 1000;
  }

  return 0;
};