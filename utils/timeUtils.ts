/**
 * Converts milliseconds to HH:MM:SS,ms (SRT format)
 */
export const msToSrt = (ms: number): string => {
  const roundedMs = Math.round(ms);
  const h = Math.floor(roundedMs / 3600000).toString().padStart(2, '0');
  const m = Math.floor((roundedMs % 3600000) / 60000).toString().padStart(2, '0');
  const s = Math.floor((roundedMs % 60000) / 1000).toString().padStart(2, '0');
  const mis = (roundedMs % 1000).toString().padStart(3, '0');
  return `${h}:${m}:${s},${mis}`;
};

/**
 * Converts milliseconds to MM:SS.xx (LRC format - 2 digit centiseconds)
 */
export const msToLrc = (ms: number): string => {
  // Round to nearest centisecond to avoid .999 becoming .99 instead of rolling over
  const roundedMs = Math.round(ms / 10) * 10;
  const m = Math.floor(roundedMs / 60000).toString().padStart(2, '0');
  const s = Math.floor((roundedMs % 60000) / 1000).toString().padStart(2, '0');
  const centis = Math.floor((roundedMs % 1000) / 10).toString().padStart(2, '0');
  return `${m}:${s}.${centis}`;
};

/**
 * Converts milliseconds to MM:SS.mmm (3 digit milliseconds)
 * Used for high-precision UI inputs
 */
export const msToMmSsMmm = (ms: number): string => {
  const roundedMs = Math.round(ms);
  const m = Math.floor(roundedMs / 60000).toString().padStart(2, '0');
  const s = Math.floor((roundedMs % 60000) / 1000).toString().padStart(2, '0');
  const mmm = (roundedMs % 1000).toString().padStart(3, '0');
  return `${m}:${s}.${mmm}`;
};

/**
 * Converts milliseconds to HH:MM:SS.ms (VTT format)
 */
export const msToVtt = (ms: number): string => {
  const roundedMs = Math.round(ms);
  const h = Math.floor(roundedMs / 3600000).toString().padStart(2, '0');
  const m = Math.floor((roundedMs % 3600000) / 60000).toString().padStart(2, '0');
  const s = Math.floor((roundedMs % 60000) / 1000).toString().padStart(2, '0');
  const mis = (roundedMs % 1000).toString().padStart(3, '0');
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

  // Clean string
  const cleanStr = timeStr.trim();

  // Check for suffix formats (TTML/XML often uses these)
  if (cleanStr.endsWith('ms')) {
    return parseFloat(cleanStr.slice(0, -2));
  }
  if (cleanStr.endsWith('s')) {
    return parseFloat(cleanStr.slice(0, -1)) * 1000;
  }

  // Check for LRC format (MM:SS.xx) or (MM:SS.xxx)
  // Expanded to support M:SS.xx (single digit minute)
  const lrcMatch = cleanStr.match(/^(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?$/);
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
  // Supports optional hours and flexible digit counts (e.g. 0:0:59.999)
  const fullMatch = cleanStr.match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{1,2})[.,](\d{1,3})$/);
  if (fullMatch) {
    const h = fullMatch[1] ? parseInt(fullMatch[1], 10) : 0;
    const m = parseInt(fullMatch[2], 10);
    const s = parseInt(fullMatch[3], 10);
    const msStr = fullMatch[4];
    let ms = parseInt(msStr, 10);

    // Scale if less than 3 digits were provided
    if (msStr.length === 1) ms *= 100;
    else if (msStr.length === 2) ms *= 10;

    return (h * 3600000) + (m * 60000) + (s * 1000) + ms;
  }

  // Fallback: check if it is just a number (seconds or ms?)
  // If purely digits, usually ms in JSON or internal logic, but if float, could be seconds.
  // We assume safe fallback: if matches numeric, parse as float. 
  // IMPORTANT: For TTML, "10.5" without suffix is seconds. 
  if (/^\d+(\.\d+)?$/.test(cleanStr)) {
    // If it looks like a small float (e.g. 10.5), it might be seconds. 
    // If it looks like an integer (10500), it might be ms.
    // This is ambiguous. However, in our parser context:
    // - LRC timestamps are handled by regex above.
    // - TTML `begin="10"` is usually seconds.
    // Let's assume seconds if it has dot, ms if it doesn't? No, inconsistent.
    // Let's rely on parsers passing unit-suffixed strings, or standard formats.
    // But `parseFloat` is a reasonable fallback for "seconds" in XML contexts usually.
    return parseFloat(cleanStr) * 1000;
  }

  return 0;
};