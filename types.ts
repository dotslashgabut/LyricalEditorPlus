export interface Word {
  id: string;
  text: string;
  start?: number; // milliseconds
  end?: number;   // milliseconds
}

export interface Cue {
  id: string;
  start: number; // milliseconds
  end: number;   // milliseconds
  text: string;
  words?: Word[]; // For Enhanced LRC / Word-level VTT
}

export enum SubtitleFormat {
  LRC = 'lrc',
  LRC_ENHANCED = 'lrc_enhanced',
  SRT = 'srt',
  VTT = 'vtt',
  VTT_KARAOKE = 'vtt_karaoke',
  TTML = 'ttml',
  TTML_KARAOKE = 'ttml_karaoke',
  TXT = 'txt',
  JSON = 'json'
}

export interface FileData {
  name: string;
  format: SubtitleFormat;
  content: string;
}

export interface Metadata {
  title?: string;
  artist?: string;
  album?: string;
  by?: string;
}