import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { UploadCloud, FileText, Loader2 } from 'lucide-react';
import Modal from './Modal';
import { cn } from '../utils/cn';
import { novelsApi } from '../api/novels';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function UploadModal({ isOpen, onClose, onSuccess }: UploadModalProps) {
  const { t } = useTranslation();
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const processFile = async (file: File) => {
    // Validate extension
    const name = file.name.toLowerCase();
    if (!name.endsWith('.txt') && !name.endsWith('.epub')) {
      setError(t('bookshelf.invalidType'));
      return;
    }

    if (file.size > 100 * 1024 * 1024) { // 100MB
      setError(t('bookshelf.sizeLimit'));
      return;
    }

    setError(null);
    setIsUploading(true);
    
    try {
      await novelsApi.upload(file);
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err) || t('bookshelf.uploadFailed'));
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await processFile(e.target.files[0]);
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('bookshelf.uploadTitle')} className="max-w-md">
      <div className="flex flex-col gap-4">
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg p-3 text-sm">
            {error}
          </div>
        )}

        <div 
          className={cn(
            "border-2 border-dashed rounded-xl p-8 transition-colors text-center cursor-pointer flex flex-col items-center gap-4",
            isDragging 
              ? "border-accent bg-accent/5" 
              : "border-border-color hover:border-accent/50 hover:bg-white/5",
            isUploading && "opacity-50 pointer-events-none"
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept=".txt,.epub"
            onChange={handleFileChange}
          />
          
          <div className="w-16 h-16 rounded-full bg-brand-800 flex items-center justify-center text-accent shadow-inner">
            {isUploading ? <Loader2 className="w-8 h-8 animate-spin" /> : <UploadCloud className="w-8 h-8" />}
          </div>
          
          <div>
            <p className="text-lg font-medium text-text-primary">
              {isUploading ? t('bookshelf.uploadAndProcessing') : t('bookshelf.clickOrDrag')}
            </p>
            <p className="text-sm text-text-secondary mt-1 max-w-[250px] mx-auto">
              {t('bookshelf.supportHint')}
            </p>
          </div>

          {!isUploading && (
            <div className="flex items-center gap-2 mt-2 text-xs text-text-secondary">
              <FileText className="w-4 h-4" />
              <span>{t('bookshelf.maxSize')}</span>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
