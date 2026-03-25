import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CharacterGraphEdge } from '@domains/analysis';
import type { LayoutNode } from '../../utils/characterGraphLayout';
import CharacterGraphProfileContent from './CharacterGraphProfileContent';

interface CharacterGraphInspectorProps {
  selectedNode: LayoutNode;
  relatedEdges: CharacterGraphEdge[];
  onClose: () => void;
  onSelectNode: (nodeId: string) => void;
}

export default function CharacterGraphInspector({
  selectedNode,
  relatedEdges,
  onClose,
  onSelectNode,
}: CharacterGraphInspectorProps) {
  const { t } = useTranslation();

  return (
    <div className="absolute bottom-4 right-4 z-20 flex h-[min(42rem,calc(100%-2rem))] w-[min(24rem,calc(100%-2rem))] flex-col overflow-hidden rounded-[26px] border border-[#ddd7cc] bg-[#fffdfa]/98 p-5 shadow-[0_24px_70px_rgba(28,35,45,0.1)] backdrop-blur md:bottom-6 md:right-6 md:h-[min(44rem,calc(100%-3rem))]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#34527a]">{t('characterGraph.profileTitle')}</p>
          <h2 className="mt-2 text-2xl font-semibold text-[#18202a]">{selectedNode.name}</h2>
          <p className="mt-2 text-xs text-[#697384]">{selectedNode.role || t('characterGraph.noRole')}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('characterGraph.closePanel')}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#ddd7cc] bg-[#f8f7f3] text-[#697384] transition hover:border-[#cfc7b9] hover:text-[#18202a]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
        <CharacterGraphProfileContent
          selectedNode={selectedNode}
          relatedEdges={relatedEdges}
          onSelectNode={onSelectNode}
        />
      </div>
    </div>
  );
}
