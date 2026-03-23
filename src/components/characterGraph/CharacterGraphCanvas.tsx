import { useTranslation } from 'react-i18next';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import {
  estimateTextUnits,
  getNodeLabelLayout,
  STAGE_HEIGHT,
  STAGE_WIDTH,
  type LayoutEdge,
  type LayoutNode,
  type ZoomState,
} from '../../utils/characterGraphLayout';

interface CharacterGraphCanvasProps {
  svgRef: RefObject<SVGSVGElement | null>;
  canPanCanvas: boolean;
  focusNodeId: string | null;
  highlightedNodeIds: ReadonlySet<string>;
  isPanning: boolean;
  layoutEdges: LayoutEdge[];
  layoutNodes: LayoutNode[];
  selectedNodeId: string | null;
  zoomState: ZoomState;
  onCanvasPointerDown: (event: ReactPointerEvent<SVGSVGElement>) => void;
  onNodeMouseEnter: (nodeId: string) => void;
  onNodeMouseLeave: (nodeId: string) => void;
  onNodePointerDown: (event: ReactPointerEvent<SVGGElement>, node: LayoutNode) => void;
}

export default function CharacterGraphCanvas({
  svgRef,
  canPanCanvas,
  focusNodeId,
  highlightedNodeIds,
  isPanning,
  layoutEdges,
  layoutNodes,
  selectedNodeId,
  zoomState,
  onCanvasPointerDown,
  onNodeMouseEnter,
  onNodeMouseLeave,
  onNodePointerDown,
}: CharacterGraphCanvasProps) {
  const { t } = useTranslation();

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${STAGE_WIDTH} ${STAGE_HEIGHT}`}
      className="relative h-full w-full"
      style={{
        cursor: isPanning ? 'grabbing' : (canPanCanvas ? 'grab' : 'default'),
        touchAction: 'none',
      }}
      onPointerDown={onCanvasPointerDown}
    >
      <defs>
        <filter id="node-shadow" x="-80%" y="-80%" width="260%" height="260%">
          <feDropShadow dx="0" dy="8" stdDeviation="10" floodColor="rgba(24,32,42,0.1)" />
        </filter>
        <filter id="node-focus" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="8" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect x="0" y="0" width={STAGE_WIDTH} height={STAGE_HEIGHT} fill="transparent" />

      <g transform={`matrix(${zoomState.scale} 0 0 ${zoomState.scale} ${zoomState.offsetX} ${zoomState.offsetY})`}>
        {layoutEdges.map((edge) => {
          const isHighlighted = !focusNodeId || edge.source === focusNodeId || edge.target === focusNodeId;
          const opacity = focusNodeId ? (isHighlighted ? 0.94 : 0.08) : 0.58;
          const strokeWidth = Math.max(1.6, Math.min(5.5, 1.2 + edge.weight / 24));

          return (
            <g key={edge.id} opacity={opacity}>
              {isHighlighted && (
                <path
                  d={edge.path}
                  fill="none"
                  stroke="#d7d1c7"
                  strokeOpacity="0.55"
                  strokeWidth={strokeWidth + 6}
                />
              )}
              <path
                d={edge.path}
                fill="none"
                stroke={isHighlighted ? '#34527a' : '#cfc8be'}
                strokeLinecap="round"
                strokeWidth={strokeWidth}
                strokeDasharray={isHighlighted ? undefined : '10 14'}
              />
            </g>
          );
        })}

        {layoutNodes.map((node) => {
          const isSelected = selectedNodeId === node.id;
          const isFocused = focusNodeId === node.id;
          const isActive = isSelected || isFocused;
          const isVisible = !focusNodeId || highlightedNodeIds.has(node.id);
          const labelLayout = getNodeLabelLayout(node.name, node.radius);
          const nodeMetaText = node.sharePercent > 0
            ? `${node.sharePercent.toFixed(1)}%`
            : t('characterGraph.connectionsShort', { count: node.degree });

          return (
            <g
              key={node.id}
              transform={`translate(${node.x} ${node.y})`}
              onPointerDown={(event) => onNodePointerDown(event, node)}
              onMouseEnter={() => onNodeMouseEnter(node.id)}
              onMouseLeave={() => onNodeMouseLeave(node.id)}
              style={{
                cursor: 'grab',
                opacity: isVisible ? 1 : 0.16,
                transition: 'opacity 220ms ease',
              }}
            >
              <g
                style={{
                  transform: isFocused ? 'translateY(-2px) scale(1.018)' : (isSelected ? 'scale(1.01)' : 'scale(1)'),
                  transformBox: 'fill-box',
                  transformOrigin: 'center center',
                  transition: 'transform 240ms cubic-bezier(0.22,1,0.36,1)',
                }}
              >
                <circle
                  r={node.radius + 10}
                  style={{
                    fill: node.isCore ? 'rgba(52,82,122,0.10)' : 'rgba(24,32,42,0.05)',
                    opacity: isActive ? 0.92 : 0.28,
                    transition: 'opacity 220ms ease, fill 220ms ease',
                  }}
                />
                <circle
                  r={node.radius + (isSelected ? 2 : 0)}
                  filter="url(#node-shadow)"
                  style={{
                    fill: '#fffdfa',
                    stroke: node.isCore ? '#18202a' : (isActive ? '#34527a' : '#9aa4af'),
                    strokeWidth: isActive ? 2.2 : 1.4,
                    transition: 'stroke 220ms ease, stroke-width 220ms ease',
                  }}
                />
                <circle
                  r={Math.max(16, node.radius - 8 + (isFocused ? 0.8 : 0))}
                  style={{
                    fill: node.isCore ? '#34527a' : '#f2efea',
                    stroke: node.isCore ? '#34527a' : '#ddd7cc',
                    strokeWidth: 1,
                    transition: 'fill 220ms ease, stroke 220ms ease',
                  }}
                />
                <g pointerEvents="none">
                  {labelLayout.lines.map((line, index) => (
                    <text
                      key={`${node.id}-${index}`}
                      y={(index - (labelLayout.lines.length - 1) / 2) * labelLayout.lineHeight}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={labelLayout.fontSize}
                      fontWeight="700"
                      lengthAdjust="spacingAndGlyphs"
                      textLength={Math.min(labelLayout.maxTextWidth, estimateTextUnits(line) * labelLayout.fontSize)}
                      style={{
                        fill: node.isCore ? '#ffffff' : '#18202a',
                        transition: 'fill 220ms ease, opacity 220ms ease',
                      }}
                    >
                      {line}
                    </text>
                  ))}
                </g>
                <g
                  transform={`translate(0 ${node.radius + 18})`}
                  pointerEvents="none"
                  opacity={isActive ? 1 : 0}
                  style={{ transition: 'opacity 180ms ease' }}
                >
                  <rect
                    x={-46}
                    y={-14}
                    width="92"
                    height="28"
                    rx="14"
                    fill="rgba(255,253,250,0.98)"
                    stroke="rgba(217,211,199,0.96)"
                  />
                  <text y="4" textAnchor="middle" fill="#5f6b79" fontSize="10" fontWeight="700">
                    {nodeMetaText}
                  </text>
                </g>
              </g>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
