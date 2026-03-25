import type JSZip from 'jszip';

export interface ChapterImageRef {
  imageKey: string;
  blob: Blob;
}

export interface ManifestItem {
  id: string;
  href: string;
  mediaType: string;
}

export interface OpfPackage {
  zip: JSZip;
  opfPath: string;
  opfDir: string;
  opfDoc: Document;
  manifest: Map<string, ManifestItem>;
  spineIds: string[];
}
