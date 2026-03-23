import {
  AlertTriangle,
  ArrowLeft,
  CircleHelp,
  Loader2,
  Maximize2,
  Minimize2,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { PointerEvent as ReactPointerEvent, PointerEventHandler, ReactNode, RefObject } from 'react';
import type { CharacterGraphEdge } from '../../api/analysis';
import type { LayoutEdge, LayoutNode, ZoomState } from '../../utils/characterGraphLayout';
import BottomSheet from '../BottomSheet';
import CharacterGraphCanvas from './CharacterGraphCanvas';
import CharacterGraphInspector from './CharacterGraphInspector';
import CharacterGraphProfileContent from './CharacterGraphProfileContent';
import StatusPill from './StatusPill';

interface CharacterGraphStageProps {
  fullscreenRef: RefObject<HTMLDivElement | null>;
  actionMessage: string | null;
  canPanCanvas: boolean;
  canRefreshOverview: boolean;
  focusNodeId: string | null;
  graphGeneratedAt: string | null | undefined;
  highlightedNodeIds: ReadonlySet<string>;
  isComplete: boolean;
  isFullscreen: boolean;
  isMobile: boolean;
  isPanning: boolean;
  isRefreshingOverview: boolean;
  layoutEdges: LayoutEdge[];
  layoutNodes: LayoutNode[];
  novelId: number;
  novelTitle: string;
  relatedEdges: CharacterGraphEdge[];
  selectedNode: LayoutNode | null;
  selectedNodeId: string | null;
  stageMeta: string[];
  zoomState: ZoomState;
  svgRef: RefObject<SVGSVGElement | null>;
  onCanvasPointerDown: PointerEventHandler<SVGSVGElement>;
  onClearSelection: () => void;
  onNodeMouseEnter: (nodeId: string) => void;
  onNodeMouseLeave: (nodeId: string) => void;
  onNodePointerDown: (event: ReactPointerEvent<SVGGElement>, node: LayoutNode) => void;
  onRefreshOverview: () => void;
  onResetLayout: () => void;
  onSelectNode: (nodeId: string) => void;
  onToggleFullscreen: () => void;
}

export default function CharacterGraphStage({
  fullscreenRef,
  actionMessage,
  canPanCanvas,
  canRefreshOverview,
  focusNodeId,
  graphGeneratedAt,
  highlightedNodeIds,
  isComplete,
  isFullscreen,
  isMobile,
  isPanning,
  isRefreshingOverview,
  layoutEdges,
  layoutNodes,
  novelId,
  novelTitle,
  relatedEdges,
  selectedNode,
  selectedNodeId,
  stageMeta,
  zoomState,
  svgRef,
  onCanvasPointerDown,
  onClearSelection,
  onNodeMouseEnter,
  onNodeMouseLeave,
  onNodePointerDown,
  onRefreshOverview,
  onResetLayout,
  onSelectNode,
  onToggleFullscreen,
}: CharacterGraphStageProps) {
  const { t } = useTranslation();
  const canvasHeightClass = isFullscreen ? 'h-screen' : 'h-[calc(100vh-4rem)]';
  const generatedAtText = graphGeneratedAt
    ? t('characterGraph.metaGeneratedAt', { time: new Date(graphGeneratedAt).toLocaleString() })
    : null;
  const [mobileSheetPreference, setMobileSheetPreference] = useState<'help' | null>(null);
  const mobileSheetMode = !isMobile ? null : (selectedNode ? 'details' : mobileSheetPreference);
  const detailNode = mobileSheetMode === 'details' ? selectedNode : null;

  function handleCloseMobileSheet(): void {
    const shouldClearSelection = mobileSheetMode === 'details' && selectedNode;
    setMobileSheetPreference(null);
    if (shouldClearSelection) {
      onClearSelection();
    }
  }

  return (
    <div className="h-[calc(100vh-4rem)] overflow-hidden bg-[#f5f2eb] text-[#18202a]">
      <div ref={fullscreenRef} className={`relative w-full overflow-hidden ${canvasHeightClass}`}>
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#fcfbf8_0%,#f5f2eb_100%)]" />
        <div className="absolute inset-0 opacity-60 [background-image:linear-gradient(rgba(113,120,129,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(113,120,129,0.07)_1px,transparent_1px)] [background-size:72px_72px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(52,82,122,0.06),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(24,32,42,0.04),transparent_34%)]" />

        {isMobile ? (
          <>
            <div className="absolute inset-x-3 top-3 z-20 flex flex-col gap-2 md:hidden">
              <div className="flex items-center gap-2">
                <Link
                  to={`/novel/${novelId}`}
                  aria-label={t('characterGraph.backToBook')}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#ddd7cc] bg-[#fffdfa]/94 text-[#5f6b79] backdrop-blur transition hover:border-[#cfc7b9] hover:text-[#18202a]"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Link>

                <div className="min-w-0 flex-1 rounded-[24px] border border-[#ddd7cc] bg-[#fffdfa]/96 px-4 py-3 backdrop-blur">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#34527a]">
                    {t('characterGraph.title')}
                  </p>
                  <p className="mt-1 truncate text-sm font-medium text-[#18202a]">{novelTitle}</p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {canRefreshOverview && (
                    <StageIconButton
                      label={t('characterGraph.refreshGraph')}
                      disabled={isRefreshingOverview}
                      onClick={onRefreshOverview}
                    >
                      {isRefreshingOverview ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    </StageIconButton>
                  )}
                  <StageIconButton label={t('characterGraph.resetLayout')} onClick={onResetLayout}>
                    <RotateCcw className="h-4 w-4" />
                  </StageIconButton>
                  <StageIconButton
                    label={isFullscreen ? t('characterGraph.exitFullscreen') : t('characterGraph.enterFullscreen')}
                    onClick={onToggleFullscreen}
                  >
                    {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                  </StageIconButton>
                </div>
              </div>

              <div className="rounded-[24px] border border-[#ddd7cc] bg-[#fffdfa]/94 px-3 py-3 shadow-[0_16px_40px_rgba(28,35,45,0.06)] backdrop-blur">
                <div className="flex flex-wrap gap-2">
                  {stageMeta.map((item) => (
                    <span
                      key={item}
                      className="rounded-full border border-[#e2ddd3] bg-[#f7f5f0] px-3 py-2 text-xs text-[#5f6b79]"
                    >
                      {item}
                    </span>
                  ))}
                  <span className={`rounded-full border px-3 py-2 text-xs ${
                    isComplete
                      ? 'border-[#d6dde5] bg-[#eef1f4] text-[#34527a]'
                      : 'border-[#ffd6a5] bg-[#fff5e8] text-[#a06528]'
                  }`}>
                    {isComplete ? t('characterGraph.metaComplete') : t('characterGraph.metaPartial')}
                  </span>
                </div>
              </div>

              {(actionMessage || !isComplete) && (
                <div className="space-y-2">
                  {actionMessage && (
                    <div className="rounded-[20px] border border-[#d7deea] bg-[#f8fafc]/96 px-4 py-3 text-sm text-[#5f6b79] shadow-[0_12px_30px_rgba(28,35,45,0.05)] backdrop-blur">
                      {actionMessage}
                    </div>
                  )}
                  {!isComplete && (
                    <div className="flex gap-2 rounded-[20px] border border-[#ffd6a5] bg-[#fff5e8]/96 px-4 py-3 text-sm text-[#a06528] shadow-[0_12px_30px_rgba(28,35,45,0.05)] backdrop-blur">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{t('characterGraph.partialHint')}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {!selectedNode && mobileSheetMode !== 'help' && (
              <button
                type="button"
                onClick={() => setMobileSheetPreference('help')}
                className="absolute bottom-4 right-4 z-20 inline-flex items-center gap-2 rounded-full border border-[#ddd7cc] bg-[#fffdfa]/96 px-4 py-3 text-sm font-medium text-[#34527a] shadow-[0_18px_42px_rgba(28,35,45,0.1)] backdrop-blur"
              >
                <CircleHelp className="h-4 w-4" />
                {t('characterGraph.helpSheetTrigger')}
              </button>
            )}

            {mobileSheetMode && (
              <BottomSheet
                isOpen
                onClose={handleCloseMobileSheet}
                title={detailNode ? t('characterGraph.profileTitle') : t('characterGraph.graphStatusTitle')}
                closeLabel={t('characterGraph.closePanel')}
                subtitle={detailNode
                  ? (
                    <>
                      <h2 className="mt-2 truncate text-2xl font-semibold text-[#18202a]">{detailNode.name}</h2>
                      <p className="mt-2 text-xs text-[#697384]">{detailNode.role || t('characterGraph.noRole')}</p>
                    </>
                  )
                  : t('characterGraph.mobileGuideSummary')}
              >
                {detailNode ? (
                  <CharacterGraphProfileContent
                    selectedNode={detailNode}
                    relatedEdges={relatedEdges}
                    onSelectNode={onSelectNode}
                  />
                ) : (
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      {stageMeta.map((item) => (
                        <span
                          key={item}
                          className="rounded-full border border-[#ddd7cc] bg-[#f8f7f3] px-3 py-2 text-xs text-[#5f6b79]"
                        >
                          {item}
                        </span>
                      ))}
                      <span className={`rounded-full border px-3 py-2 text-xs ${
                        isComplete
                          ? 'border-[#d6dde5] bg-[#eef1f4] text-[#34527a]'
                          : 'border-[#ffd6a5] bg-[#fff5e8] text-[#a06528]'
                      }`}>
                        {isComplete ? t('characterGraph.metaComplete') : t('characterGraph.metaPartial')}
                      </span>
                    </div>

                    {generatedAtText && (
                      <div className="rounded-[20px] border border-[#ddd7cc] bg-[#f8f7f3] px-4 py-3 text-sm text-[#5f6b79]">
                        {generatedAtText}
                      </div>
                    )}

                    {actionMessage && (
                      <div className="rounded-[20px] border border-[#d7deea] bg-[#f8fafc] px-4 py-3 text-sm text-[#5f6b79]">
                        {actionMessage}
                      </div>
                    )}

                    {!isComplete && (
                      <div className="rounded-[20px] border border-[#ffd6a5] bg-[#fff5e8] px-4 py-3 text-sm leading-6 text-[#a06528]">
                        {t('characterGraph.partialHint')}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2 text-[11px] font-semibold tracking-[0.08em] text-[#34527a]">
                      <span className="rounded-full bg-[#eef1f4] px-3 py-1.5">{t('characterGraph.legendCore')}</span>
                      <span className="rounded-full bg-[#f4f2ed] px-3 py-1.5 text-[#697384]">{t('characterGraph.legendRelation')}</span>
                    </div>

                    <div className="rounded-[24px] border border-[#ddd7cc] bg-[#f7f5f0] px-4 py-4 text-sm leading-7 text-[#4e5c6d]">
                      {t('characterGraph.dragHint')}
                    </div>
                  </div>
                )}
              </BottomSheet>
            )}
          </>
        ) : (
          <>
            <div className="absolute left-4 top-4 z-20 flex max-w-[min(62rem,calc(100%-2rem))] flex-wrap items-center gap-3 md:left-6 md:top-6">
              <Link
                to={`/novel/${novelId}`}
                className="inline-flex items-center gap-2 rounded-full border border-[#ddd7cc] bg-[#fffdfa]/94 px-4 py-2 text-xs text-[#5f6b79] backdrop-blur transition hover:border-[#cfc7b9] hover:text-[#18202a]"
              >
                <ArrowLeft className="h-4 w-4" />
                {t('characterGraph.backToBook')}
              </Link>
              <div className="rounded-full border border-[#ddd7cc] bg-[#fffdfa]/96 px-4 py-2 backdrop-blur">
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#34527a]">{t('characterGraph.title')}</p>
                <p className="mt-1 text-xs text-[#18202a] md:text-sm">{novelTitle}</p>
              </div>
              <div className="hidden rounded-full border border-[#ddd7cc] bg-[#fffdfa]/94 px-4 py-2 text-xs text-[#697384] backdrop-blur lg:block">
                {t('characterGraph.canvasHint')}
              </div>
            </div>

            <div className="absolute right-4 top-4 z-20 flex max-w-[min(36rem,calc(100%-2rem))] flex-wrap justify-end gap-2 md:right-6 md:top-6">
              {stageMeta.map((item) => (
                <StatusPill key={item} text={item} />
              ))}
              <StatusPill text={isComplete ? t('characterGraph.metaComplete') : t('characterGraph.metaPartial')} accent />
              {generatedAtText && <StatusPill text={generatedAtText} />}
              {canRefreshOverview && (
                <button
                  type="button"
                  onClick={onRefreshOverview}
                  disabled={isRefreshingOverview}
                  className="inline-flex items-center gap-2 rounded-full border border-[#ddd7cc] bg-[#fffdfa]/94 px-4 py-2 text-xs text-[#5f6b79] backdrop-blur transition hover:border-[#cfc7b9] hover:text-[#18202a] disabled:opacity-60"
                >
                  {isRefreshingOverview ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  {t('characterGraph.refreshGraph')}
                </button>
              )}
              <button
                type="button"
                onClick={onResetLayout}
                className="inline-flex items-center gap-2 rounded-full border border-[#ddd7cc] bg-[#fffdfa]/94 px-4 py-2 text-xs text-[#5f6b79] backdrop-blur transition hover:border-[#cfc7b9] hover:text-[#18202a]"
              >
                <RotateCcw className="h-4 w-4" />
                {t('characterGraph.resetLayout')}
              </button>
              <button
                type="button"
                onClick={onToggleFullscreen}
                className="inline-flex items-center gap-2 rounded-full border border-[#ddd7cc] bg-[#fffdfa]/94 px-4 py-2 text-xs text-[#5f6b79] backdrop-blur transition hover:border-[#cfc7b9] hover:text-[#18202a]"
              >
                {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                {isFullscreen ? t('characterGraph.exitFullscreen') : t('characterGraph.enterFullscreen')}
              </button>
            </div>

            <div className="absolute bottom-4 left-4 z-20 max-w-[min(28rem,calc(100%-2rem))] rounded-[22px] border border-[#ddd7cc] bg-[#fffdfa]/96 p-4 text-xs text-[#697384] shadow-[0_18px_45px_rgba(28,35,45,0.07)] backdrop-blur md:bottom-6 md:left-6">
              <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#34527a]">
                <span className="rounded-full bg-[#eef1f4] px-3 py-1">{t('characterGraph.legendCore')}</span>
                <span className="rounded-full bg-[#f4f2ed] px-3 py-1 text-[#697384]">{t('characterGraph.legendRelation')}</span>
              </div>
              <p className="mt-3 leading-6">{t('characterGraph.dragHint')}</p>
              {actionMessage && (
                <div className="mt-3 rounded-2xl border border-[#d7deea] bg-[#f8fafc] px-3 py-2 text-[#5f6b79]">
                  {actionMessage}
                </div>
              )}
              {!isComplete && (
                <div className="mt-3 flex gap-2 rounded-2xl border border-[#ffd6a5] bg-[#fff5e8] px-3 py-2 text-[#a06528]">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{t('characterGraph.partialHint')}</span>
                </div>
              )}
            </div>

            {selectedNode && (
              <CharacterGraphInspector
                selectedNode={selectedNode}
                relatedEdges={relatedEdges}
                onClose={onClearSelection}
                onSelectNode={onSelectNode}
              />
            )}
          </>
        )}

        <CharacterGraphCanvas
          svgRef={svgRef}
          canPanCanvas={canPanCanvas}
          focusNodeId={focusNodeId}
          highlightedNodeIds={highlightedNodeIds}
          isPanning={isPanning}
          layoutEdges={layoutEdges}
          layoutNodes={layoutNodes}
          selectedNodeId={selectedNodeId}
          zoomState={zoomState}
          onCanvasPointerDown={onCanvasPointerDown}
          onNodeMouseEnter={onNodeMouseEnter}
          onNodeMouseLeave={onNodeMouseLeave}
          onNodePointerDown={onNodePointerDown}
        />
      </div>
    </div>
  );
}

interface StageIconButtonProps {
  children: ReactNode;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}

function StageIconButton({ children, label, disabled = false, onClick }: StageIconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#ddd7cc] bg-[#fffdfa]/94 text-[#5f6b79] shadow-[0_12px_30px_rgba(28,35,45,0.06)] backdrop-blur transition hover:border-[#cfc7b9] hover:text-[#18202a] disabled:opacity-60"
    >
      {children}
    </button>
  );
}
