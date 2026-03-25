import { useTranslation } from 'react-i18next';
import type { CharacterGraphEdge } from '@domains/analysis';
import type { LayoutNode } from '../../utils/characterGraphLayout';
import MetricCard from './MetricCard';

interface CharacterGraphProfileContentProps {
  selectedNode: LayoutNode;
  relatedEdges: CharacterGraphEdge[];
  onSelectNode: (nodeId: string) => void;
}

export default function CharacterGraphProfileContent({
  selectedNode,
  relatedEdges,
  onSelectNode,
}: CharacterGraphProfileContentProps) {
  const { t } = useTranslation();

  return (
    <>
      <p className="text-xs leading-6 text-[#3d4856]">
        {selectedNode.description || t('characterGraph.descriptionEmpty')}
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <MetricCard
          label={t('characterGraph.sharePercentLabel')}
          value={selectedNode.sharePercent > 0 ? `${selectedNode.sharePercent.toFixed(2)}%` : '--'}
        />
        <MetricCard
          label={t('characterGraph.connectionCountLabel')}
          value={String(relatedEdges.length)}
        />
      </div>

      <div className="mt-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#34527a]">
          {t('characterGraph.relatedRelationships')}
        </p>
        {relatedEdges.length > 0 ? (
          <div className="mt-3 space-y-3">
            {relatedEdges.map((edge) => {
              const counterpart = edge.source === selectedNode.id ? edge.target : edge.source;
              const relationTags = edge.relationTags.length > 0
                ? edge.relationTags
                : [edge.type || t('characterGraph.relationTypeFallback')];

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
                        <span
                          key={`${edge.id}-${tag}`}
                          className="rounded-full bg-[#eef1f4] px-2.5 py-1 text-[10px] font-semibold text-[#34527a]"
                        >
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
    </>
  );
}
