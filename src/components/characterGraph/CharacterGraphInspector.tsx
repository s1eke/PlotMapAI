import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CharacterGraphEdge } from '../../api/analysis';
import type { LayoutNode } from '../../utils/characterGraphLayout';
import MetricCard from './MetricCard';

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
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#ddd7cc] bg-[#f8f7f3] text-[#697384] transition hover:border-[#cfc7b9] hover:text-[#18202a]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
        <p className="text-xs leading-6 text-[#3d4856]">
          {selectedNode.description || t('characterGraph.descriptionEmpty')}
        </p>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <MetricCard label={t('characterGraph.sharePercentLabel')} value={selectedNode.sharePercent > 0 ? `${selectedNode.sharePercent.toFixed(2)}%` : '--'} />
          <MetricCard label={t('characterGraph.connectionCountLabel')} value={String(relatedEdges.length)} />
        </div>

        <div className="mt-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#34527a]">{t('characterGraph.relatedRelationships')}</p>
          {relatedEdges.length > 0 ? (
            <div className="mt-3 space-y-3">
              {relatedEdges.map((edge) => {
                const counterpart = edge.source === selectedNode.id ? edge.target : edge.source;
                const relationTags = edge.relationTags.length > 0 ? edge.relationTags : [edge.type || t('characterGraph.relationTypeFallback')];
                return (
                  <button
                    key={edge.id}
                    type="button"
                    onClick={() => onSelectNode(counterpart)}
                    className="w-full rounded-[18px] border border-[#e2ddd3] bg-[#f7f5f0] p-4 text-left transition hover:border-[#cfc7b9] hover:bg-[#fffdfa]"
                  >
                    <div>
                      <p className="text-sm font-medium text-[#18202a]">{counterpart}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {relationTags.map((tag) => (
                          <span key={`${edge.id}-${tag}`} className="rounded-full bg-[#eef1f4] px-2.5 py-1 text-[10px] font-semibold text-[#34527a]">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    <p className="mt-3 text-xs leading-6 text-[#3d4856]">
                      {edge.description || t('characterGraph.relationshipDescriptionEmpty')}
                    </p>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="mt-3 rounded-[20px] border border-dashed border-[#d7deea] bg-[#f8fafc] px-4 py-6 text-sm text-[#7b8796]">
              {t('characterGraph.relationshipsEmpty')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
