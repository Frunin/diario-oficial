export interface GazetteDocument {
  title: string;
  url: string;
  dateFound: string; // ISO String (Scrape time)
  publicationDate: string; // The official date from the gazette (dd/mm/yyyy)
  contentSummary?: string;
  isNew: boolean;
  rawText?: string;
  editionLabel?: string;
}

export enum ScrapeStatus {
  IDLE = 'IDLE',
  CHECKING = 'CHECKING',
  DOWNLOADING = 'DOWNLOADING',
  PARSING = 'PARSING',
  SUMMARIZING = 'SUMMARIZING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
}

export interface ScrapeLog {
  id: string;
  timestamp: string;
  status: 'SUCCESS' | 'FAILURE' | 'NO_CHANGE' | 'INFO';
  message: string;
  documentTitle?: string;
}

export interface AppSettings {
  morningCheck: string; // "08:00"
  nightCheck: string;   // "20:00"
  lastCheckedUrl: string | null;
}