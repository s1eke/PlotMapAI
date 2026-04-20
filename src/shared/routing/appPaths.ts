export const appPaths = {
  bookshelf(): string {
    return '/';
  },
  settings(): string {
    return '/settings';
  },
  novel(id: number): string {
    return `/novel/${id}`;
  },
  reader(id: number): string {
    return `/novel/${id}/read`;
  },
  characterGraph(id: number): string {
    return `/novel/${id}/graph`;
  },
};
