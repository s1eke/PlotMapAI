import client from './client';

export interface Novel {
  id: number;
  title: string;
  author: string;
  description: string;
  tags: string[];
  fileType: string;
  hasCover: boolean;
  originalFilename: string;
  originalEncoding: string;
  totalWords: number;
  chapter_count?: number;
  createdAt: string;
}

export const novelsApi = {
  list: (): Promise<Novel[]> => {
    return client.get('/novels');
  },

  get: (id: number): Promise<Novel> => {
    return client.get(`/novels/${id}`);
  },

  delete: (id: number): Promise<{ message: string }> => {
    return client.delete(`/novels/${id}`);
  },

  upload: (file: File): Promise<Novel> => {
    const formData = new FormData();
    formData.append('file', file);
    return client.post('/novels/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },

  getCoverUrl: (id: number): string => {
    return `/api/novels/${id}/cover`;
  }
};
