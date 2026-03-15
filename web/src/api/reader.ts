import client from './client';

export interface Chapter {
  index: number;
  title: string;
  wordCount: number;
}

export interface ChapterContent extends Chapter {
  content: string;
  totalChapters: number;
  hasPrev: boolean;
  hasNext: boolean;
}

export interface ReadingProgress {
  chapterIndex: number;
  scrollPosition: number;
  viewMode: 'summary' | 'original';
}

export const readerApi = {
  getChapters: (novelId: number): Promise<Chapter[]> => {
    return client.get(`/novels/${novelId}/chapters`);
  },

  getChapterContent: (novelId: number, chapterIndex: number): Promise<ChapterContent> => {
    return client.get(`/novels/${novelId}/chapters/${chapterIndex}`);
  },

  getProgress: (novelId: number): Promise<ReadingProgress> => {
    return client.get(`/novels/${novelId}/reading-progress`);
  },

  saveProgress: (novelId: number, progress: Partial<ReadingProgress>): Promise<{ message: string }> => {
    return client.put(`/novels/${novelId}/reading-progress`, progress);
  }
};
