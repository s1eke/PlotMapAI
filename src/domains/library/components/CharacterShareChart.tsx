import type { ReactElement } from 'react';

import { useId } from 'react';

export interface CharacterShareChartCharacter {
  name: string;
  role: string;
  sharePercent: number;
}

export interface CharacterShareChartProps {
  characters: CharacterShareChartCharacter[];
  emptyLabel: string;
  roleFallback: string;
  ariaLabel: string;
}

const CHART_WIDTH = 680;
const CHART_HEIGHT = 332;
const CHART_PADDING = {
  top: 34,
  right: 26,
  bottom: 92,
  left: 54,
};

export default function CharacterShareChart({
  characters,
  emptyLabel,
  roleFallback,
  ariaLabel,
}: CharacterShareChartProps): ReactElement {
  const idPrefix = useId().replace(/:/g, '');

  if (characters.length === 0) {
    return <p className="text-sm text-text-secondary">{emptyLabel}</p>;
  }

  const plotWidth = CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right;
  const plotHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;
  const maxShare = Math.max(...characters.map((character) => character.sharePercent));
  const step = getShareChartStep(maxShare);
  const axisMax = Math.max(step * 3, Math.ceil(maxShare / step) * step);
  const tickValues = Array.from(
    { length: Math.floor(axisMax / step) + 1 },
    (_, index) => index * step,
  );
  const groupWidth = plotWidth / characters.length;
  const barWidth = Math.min(72, groupWidth * 0.5);
  const cardGradientId = `${idPrefix}-character-share-card`;
  const barGradientId = `${idPrefix}-character-share-bar`;
  const shadowFilterId = `${idPrefix}-character-share-shadow`;
  const badgeShadowFilterId = `${idPrefix}-character-share-badge-shadow`;

  return (
    <div className="overflow-hidden rounded-[28px] border border-[#e4e8ef] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(245,247,251,0.98)_100%)] p-4 shadow-[0_18px_48px_rgba(31,41,55,0.08)] md:p-5">
      <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="h-auto w-full" role="img" aria-label={ariaLabel}>
        <defs>
          <linearGradient id={cardGradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.96)" />
            <stop offset="100%" stopColor="rgba(245,247,251,0.96)" />
          </linearGradient>
          <linearGradient id={barGradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#31496b" />
            <stop offset="55%" stopColor="#466286" />
            <stop offset="100%" stopColor="#6c84a6" />
          </linearGradient>
          <filter id={shadowFilterId} x="-20%" y="-20%" width="140%" height="160%">
            <feDropShadow dx="0" dy="12" stdDeviation="14" floodColor="rgba(49,73,107,0.16)" />
          </filter>
          <filter id={badgeShadowFilterId} x="-20%" y="-20%" width="140%" height="160%">
            <feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="rgba(31,41,55,0.08)" />
          </filter>
        </defs>

        <rect x="1" y="1" width={CHART_WIDTH - 2} height={CHART_HEIGHT - 2} rx="28" fill={`url(#${cardGradientId})`} />
        <ellipse cx={CHART_WIDTH - 80} cy="24" rx="120" ry="46" fill="rgba(244,199,104,0.10)" />
        <ellipse cx="92" cy={CHART_HEIGHT - 26} rx="148" ry="54" fill="rgba(49,73,107,0.06)" />
        <rect
          x={CHART_PADDING.left}
          y={CHART_PADDING.top}
          width={plotWidth}
          height={plotHeight}
          rx={22}
          fill="rgba(245,247,251,0.72)"
        />

        {tickValues.map((tickValue) => {
          const y = CHART_PADDING.top + plotHeight - (tickValue / axisMax) * plotHeight;
          return (
            <g key={tickValue}>
              <line
                x1={CHART_PADDING.left}
                x2={CHART_PADDING.left + plotWidth}
                y1={y}
                y2={y}
                stroke="rgba(95,107,121,0.16)"
                strokeDasharray={tickValue === 0 ? undefined : '4 6'}
              />
              <text
                x={CHART_PADDING.left - 10}
                y={y + 4}
                textAnchor="end"
                fontSize="12"
                fill="rgba(95,107,121,0.92)"
              >
                {tickValue}%
              </text>
            </g>
          );
        })}

        <line
          x1={CHART_PADDING.left}
          x2={CHART_PADDING.left + plotWidth}
          y1={CHART_PADDING.top + plotHeight}
          y2={CHART_PADDING.top + plotHeight}
          stroke="rgba(24,32,42,0.18)"
        />

        {characters.map((character, index) => {
          const barHeight = (character.sharePercent / axisMax) * plotHeight;
          const centerX = CHART_PADDING.left + groupWidth * index + groupWidth / 2;
          const barX = centerX - barWidth / 2;
          const barY = CHART_PADDING.top + plotHeight - barHeight;
          const roleLabel = truncateChartLabel(character.role || roleFallback, 14);
          const valueLabel = formatChartPercent(character.sharePercent);
          const badgeWidth = Math.max(66, valueLabel.length * 10 + 22);
          const badgeX = centerX - badgeWidth / 2;
          const badgeY = Math.max(8, barY - 42);

          return (
            <g key={character.name}>
              <title>{`${character.name} ${valueLabel}`}</title>
              <line
                x1={centerX}
                x2={centerX}
                y1={CHART_PADDING.top + plotHeight}
                y2={CHART_PADDING.top + plotHeight + 8}
                stroke="rgba(24,32,42,0.16)"
              />
              <g filter={`url(#${badgeShadowFilterId})`}>
                <rect
                  x={badgeX}
                  y={badgeY}
                  width={badgeWidth}
                  height="28"
                  rx="14"
                  fill="rgba(255,253,249,0.98)"
                  stroke="rgba(217,146,0,0.26)"
                />
              </g>
              <text
                x={centerX}
                y={badgeY + 18}
                textAnchor="middle"
                fontSize="15"
                fontWeight="700"
                fill="#b97900"
              >
                {valueLabel}
              </text>
              <rect
                x={barX}
                y={barY}
                width={barWidth}
                height={Math.max(barHeight, 6)}
                rx={18}
                fill={`url(#${barGradientId})`}
                filter={`url(#${shadowFilterId})`}
              />
              <text
                x={centerX}
                y={CHART_PADDING.top + plotHeight + 34}
                textAnchor="middle"
                fontSize="16"
                fontWeight="600"
                fill="#18202a"
              >
                {truncateChartLabel(character.name, 8)}
              </text>
              <text
                x={centerX}
                y={CHART_PADDING.top + plotHeight + 58}
                textAnchor="middle"
                fontSize="12"
                fill="rgba(95,107,121,0.92)"
              >
                {roleLabel}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function getShareChartStep(maxValue: number): number {
  if (maxValue <= 20) return 5;
  if (maxValue <= 50) return 10;
  return 20;
}

function formatChartPercent(value: number): string {
  const normalized = Number(value.toFixed(1));
  return Number.isInteger(normalized) ? `${normalized.toFixed(0)}%` : `${normalized}%`;
}

function truncateChartLabel(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}
