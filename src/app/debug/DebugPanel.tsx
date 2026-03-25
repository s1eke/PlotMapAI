import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Bug, ChevronDown, Download, RefreshCw, RotateCcw, Smartphone, Trash2 } from 'lucide-react';
import {
  debugSubscribe,
  getRecentLogs,
  clearLogs,
  MAX_LOGS,
  triggerDebugInstallPrompt,
  triggerDebugIosInstallHint,
  triggerDebugUpdateToast,
  triggerDebugResetPwaPrompts,
  type LogEntry,
} from './service';

import { cn } from '@shared/utils/cn';

const CATEGORY_COLORS: Record<string, string> = {
  Reader: 'text-green-400',
  Purify: 'text-yellow-400',
  TXT: 'text-blue-400',
  ChapterDetect: 'text-cyan-400',
  Upload: 'text-purple-400',
  Settings: 'text-orange-400',
  AI: 'text-pink-400',
  Analysis: 'text-red-400',
  PWA: 'text-sky-400',
};

export default function DebugPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>(() => getRecentLogs());
  const listRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  useEffect(() => {
    return debugSubscribe(entry => {
      setLogs(prev => {
        const next = [...prev, entry];
        if (next.length > MAX_LOGS) next.splice(0, next.length - MAX_LOGS);
        return next;
      });
    });
  }, []);

  useEffect(() => {
    if (autoScrollRef.current && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [logs]);

  const handleScroll = useCallback(() => {
    if (!listRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    autoScrollRef.current = scrollHeight - scrollTop - clientHeight < 40;
  }, []);

  const handleClear = useCallback(() => {
    clearLogs();
    setLogs([]);
  }, []);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}.${d.getMilliseconds().toString().padStart(3, '0')}`;
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className={cn(
          "fixed bottom-4 right-4 z-[70] w-10 h-10 rounded-full flex items-center justify-center shadow-lg border border-border-color transition-colors",
          "bg-bg-secondary/90 dark:bg-brand-800/90 backdrop-blur-sm hover:bg-bg-secondary dark:hover:bg-brand-800"
        )}
        title="Debug Panel"
      >
        <Bug className="w-4 h-4 text-text-primary" />
        {logs.length > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-bold">
            {logs.length > 99 ? '99+' : logs.length}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-[70] w-[420px] max-h-[60vh] bg-bg-secondary/95 dark:bg-brand-800/95 backdrop-blur-xl rounded-xl border border-border-color shadow-2xl flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-color/50">
        <div className="flex items-center gap-2">
          <Bug className="w-4 h-4 text-accent" />
          <span className="text-xs font-semibold text-text-primary">Debug ({logs.length})</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={handleClear} className="p-1 rounded hover:bg-white/10 text-text-secondary transition-colors" title="Clear logs">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setIsOpen(false)} className="p-1 rounded hover:bg-white/10 text-text-secondary transition-colors">
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 border-b border-border-color/50 p-2">
        <button
          onClick={() => window.history.back()}
          className="flex items-center justify-center gap-2 rounded-lg border border-border-color/50 px-3 py-2 text-xs font-medium text-text-primary transition-colors hover:bg-white/10"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Go Back
        </button>
        <button
          onClick={triggerDebugInstallPrompt}
          className="flex items-center justify-center gap-2 rounded-lg border border-border-color/50 px-3 py-2 text-xs font-medium text-text-primary transition-colors hover:bg-white/10"
        >
          <Download className="h-3.5 w-3.5" />
          Install Prompt
        </button>
        <button
          onClick={triggerDebugIosInstallHint}
          className="flex items-center justify-center gap-2 rounded-lg border border-border-color/50 px-3 py-2 text-xs font-medium text-text-primary transition-colors hover:bg-white/10"
        >
          <Smartphone className="h-3.5 w-3.5" />
          iOS Hint
        </button>
        <button
          onClick={triggerDebugUpdateToast}
          className="flex items-center justify-center gap-2 rounded-lg border border-border-color/50 px-3 py-2 text-xs font-medium text-text-primary transition-colors hover:bg-white/10"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Update Toast
        </button>
        <button
          onClick={triggerDebugResetPwaPrompts}
          className="flex items-center justify-center gap-2 rounded-lg border border-border-color/50 px-3 py-2 text-xs font-medium text-text-primary transition-colors hover:bg-white/10"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset PWA
        </button>
      </div>
      <div ref={listRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-2 space-y-0.5 text-[11px] font-mono leading-relaxed custom-scrollbar">
        {logs.length === 0 && (
          <div className="text-text-secondary text-center py-8">No logs yet</div>
        )}
        {logs.map((entry, i) => (
          <div key={i} className="flex gap-1.5">
            <span className="text-text-secondary/60 shrink-0">{formatTime(entry.time)}</span>
            <span className={cn("shrink-0 font-semibold", CATEGORY_COLORS[entry.category] || 'text-text-secondary')}>
              [{entry.category}]
            </span>
            <span className="text-text-primary/80 break-all">{entry.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
