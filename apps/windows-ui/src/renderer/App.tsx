// @ts-nocheck
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Terminal,
  MessageSquare,
  FileText,
  Settings,
  Play,
  Save,
  CheckCircle,
  Cpu,
  Send,
  ArrowRightLeft,
  Loader2,
  Box,
  Bot,
  Sparkles,
  Home,
  Grid,
  Plus,
  X,
  ChevronRight,
  UploadCloud,
  FileUp,
  File,
  FileSpreadsheet,
  FolderOpen,
} from 'lucide-react';

type Provider = 'claude' | 'codex';

type ChatMessage = { id: string; sender: 'ai' | 'user'; text: string; timestamp: string };
type WorkspaceFile = {
  id: string;
  name: string;
  size: string;
  type: string;
  date: string;
  mime?: string;
  uploadedAt?: number;
  lineageKey?: string;
  parentFileId?: string | null;
  compareText?: string;
  compareLineTokens?: string[];
};
type RichRun = { text: string; font_size_px: number; bold: boolean; font_family?: string };
type BlockBBox = { page: number; x: number; y: number; w: number; h: number; unit?: string; source?: string };
type RichBlock =
  | { type: 'paragraph'; runs: RichRun[]; bbox?: BlockBBox }
  | { type: 'table'; rows: string[][]; bbox?: BlockBBox };
type FilePreview =
  | { kind: 'none'; note: string }
  | { kind: 'text'; content: string; truncated: boolean; compareText?: string; compareLineTokens?: string[] }
  | { kind: 'rich'; blocks: RichBlock[]; content: string; truncated: boolean; compareText?: string; compareLineTokens?: string[] }
  | { kind: 'image'; url: string }
  | { kind: 'pdf'; url: string; compareText?: string; compareLineTokens?: string[]; richBlocks?: RichBlock[] };
type UiSession = {
  id: string;
  title: string;
  date: string;
  preview: string;
  messages: ChatMessage[];
  files: WorkspaceFile[];
  activeFileId: string | null;
};

type SessionContextMenu = { x: number; y: number; sessionId: string };
type DiffPair = {
  originalFile: WorkspaceFile;
  resultFile: WorkspaceFile;
  originalPreview: FilePreview;
  resultPreview: FilePreview;
  lineageKey: string;
  relation: 'parent-child';
};
type ComparableLine = { text: string; styleKey: string };
type PdfHighlightBox = { page: number; x: number; y: number; w: number; h: number };

const MOCK_LAUNCHER_APPS = [
  { id: 'app1', title: '표 테두리 자동화', description: '모든 표 투명선 제거 및 굵은 테두리 적용', usageCount: 128, type: 'hwp' },
  { id: 'app2', title: '개인정보 마스킹', description: '주민번호 패턴 감지 후 * 처리', usageCount: 45, type: 'hwp' },
  { id: 'app3', title: '월별 매출 집계', description: '각 시트의 데이터를 취합하여 요약 시트 생성', usageCount: 32, type: 'excel' },
];

const DEFAULT_MESSAGE: ChatMessage = {
  id: 'msg-init',
  sender: 'ai',
  text: '안녕하세요. HiHangul 비서입니다. Windows VM과 연결되었습니다. 어떤 작업을 도와드릴까요?',
  timestamp: 'Now',
};

const EXISTING_SESSION_FILES: WorkspaceFile[] = [
  { id: 'f1', name: 'report_v1.hwp', size: '1.2 MB', type: 'hwp', date: '2024-05-20' },
  { id: 'f2', name: 'data_sheet.xlsx', size: '450 KB', type: 'xlsx', date: '2024-05-19' },
  { id: 'f3', name: 'guidelines.pdf', size: '2.1 MB', type: 'pdf', date: '2024-05-18' },
];

function logUi(scope: string, message: string, ctx?: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.log(`[ui:${scope}] ${message}`, ctx ?? {});
}

function logUiError(scope: string, error: unknown, ctx?: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.error(`[ui:${scope}]`, error, ctx ?? {});
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

const TEXT_EXTENSIONS = new Set(['txt', 'md', 'json', 'csv', 'log', 'xml', 'yaml', 'yml']);
const MAX_TEXT_PREVIEW_LEN = 50000;

function normalizeFileStem(fileName: string): string {
  const stem = fileName.replace(/\.[^.]+$/, '').toLowerCase();
  return stem
    .replace(/(원본|결과|수정본|orig(?:inal)?|source|before|input|result|output|after|modified|final|copy)/g, '')
    .replace(/[-_ ]?v\d+/g, '')
    .replace(/\(\d+\)/g, '')
    .replace(/[^a-z0-9가-힣]/g, '');
}

function isHwpFamily(file: WorkspaceFile): boolean {
  return file.type === 'hwp' || file.type === 'hwpx';
}

function buildLineageKey(fileName: string): string {
  const normalized = normalizeFileStem(fileName);
  if (normalized) return normalized;
  return fileName.replace(/\.[^.]+$/, '').toLowerCase();
}

function extractComparableText(preview: FilePreview | undefined): string | null {
  if (!preview) return null;
  if ('compareText' in preview && typeof preview.compareText === 'string') return preview.compareText;
  if (preview.kind === 'text') return preview.content || '';
  if (preview.kind === 'rich') return preview.content || '';
  return null;
}

function splitLines(text: string): ComparableLine[] {
  return text.replace(/\r\n/g, '\n').split('\n').map((line) => ({ text: line, styleKey: '' }));
}

function lineStyleKeyFromRun(run: RichRun): string {
  return `${run.font_size_px || 0}|${run.bold ? 1 : 0}|${(run.font_family || '').toLowerCase()}`;
}

function richBlocksToComparableLines(blocks: RichBlock[]): ComparableLine[] {
  const lines: ComparableLine[] = [];
  let currentText = '';
  let currentStyle = '';
  const flush = () => {
    lines.push({ text: currentText, styleKey: currentStyle });
    currentText = '';
    currentStyle = '';
  };

  for (const block of blocks) {
    if (block.type === 'table') {
      if (currentText || currentStyle) flush();
      for (const row of block.rows) {
        lines.push({ text: row.join(' | '), styleKey: 'table' });
      }
      continue;
    }

    for (const run of block.runs) {
      const parts = (run.text || '').replace(/\r\n/g, '\n').split('\n');
      const key = lineStyleKeyFromRun(run);
      for (let i = 0; i < parts.length; i += 1) {
        const part = parts[i];
        if (part.length > 0) {
          currentText += part;
          currentStyle += `${key};`;
        }
        if (i < parts.length - 1) flush();
      }
      currentText += ' ';
    }
    flush();
  }

  if (!lines.length) lines.push({ text: '', styleKey: '' });
  return lines;
}

function extractComparableLines(preview: FilePreview | undefined): ComparableLine[] | null {
  if (!preview) return null;
  if ('compareLineTokens' in preview && Array.isArray(preview.compareLineTokens) && preview.compareLineTokens.length > 0) {
    return preview.compareLineTokens.map((token) => {
      const [text, styleKey] = token.split('\u241F');
      return { text: text ?? '', styleKey: styleKey ?? '' };
    });
  }
  if (preview.kind === 'rich') return richBlocksToComparableLines(preview.blocks);
  const text = extractComparableText(preview);
  if (text === null) return null;
  return splitLines(text);
}

function parseComparableLinesFromTokens(tokens: string[] | undefined, fallbackText: string | undefined): ComparableLine[] | null {
  if (Array.isArray(tokens) && tokens.length > 0) {
    return tokens.map((token) => {
      const [text, styleKey] = token.split('\u241F');
      return { text: text ?? '', styleKey: styleKey ?? '' };
    });
  }
  if (typeof fallbackText === 'string') {
    return splitLines(fallbackText);
  }
  return null;
}

function buildComparablePayload(preview: FilePreview | undefined): { compareText: string; compareLineTokens: string[] } | null {
  const lines = extractComparableLines(preview);
  if (!lines) return null;
  const compareText = lines.map((line) => line.text).join('\n');
  const compareLineTokens = lines.map((line) => `${line.text}\u241F${line.styleKey}`);
  return { compareText, compareLineTokens };
}

function extractRichBlocks(preview: FilePreview | undefined): RichBlock[] | null {
  if (!preview) return null;
  if (preview.kind === 'rich') return preview.blocks;
  if (preview.kind === 'pdf' && Array.isArray(preview.richBlocks)) return preview.richBlocks;
  return null;
}

function blockSignature(block: RichBlock): string {
  if (block.type === 'table') {
    return `table:${block.rows.map((row) => row.join('|')).join('||')}`;
  }
  return `paragraph:${block.runs.map((run) => `${run.text}@@${lineStyleKeyFromRun(run)}`).join('##')}`;
}

function changedLinesByLcs(originalLines: ComparableLine[], resultLines: ComparableLine[]): boolean[] {
  const n = originalLines.length;
  const m = resultLines.length;
  if (n === 0) return resultLines.map((line) => line.text.trim().length > 0);

  // Prevent quadratic blow-up on very large documents.
  if (n > 400 || m > 400) {
    const originalSet = new Set(originalLines.map((line) => `${line.text.trim()}@@${line.styleKey}`));
    return resultLines.map((line) => {
      const normalized = line.text.trim();
      if (!normalized) return false;
      return !originalSet.has(`${normalized}@@${line.styleKey}`);
    });
  }

  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      if (
        originalLines[i].text === resultLines[j].text
        && originalLines[i].styleKey === resultLines[j].styleKey
      ) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const keep = new Set<number>();
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (
      originalLines[i].text === resultLines[j].text
      && originalLines[i].styleKey === resultLines[j].styleKey
    ) {
      keep.add(j);
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i += 1;
    } else {
      j += 1;
    }
  }

  return resultLines.map((line, idx) => {
    if (!line.text.trim()) return false;
    return !keep.has(idx);
  });
}

function inferParentFileId(
  lineageKey: string,
  uploadedAt: number,
  pool: WorkspaceFile[],
): string | null {
  const candidates = pool
    .filter((file) => {
      if (!isHwpFamily(file)) return false;
      const key = file.lineageKey || buildLineageKey(file.name);
      return key === lineageKey && (file.uploadedAt ?? 0) < uploadedAt;
    })
    .sort((a, b) => (b.uploadedAt ?? 0) - (a.uploadedAt ?? 0));
  return candidates[0]?.id ?? null;
}

function findNearestParentByLineage(activeFile: WorkspaceFile, files: WorkspaceFile[]): WorkspaceFile | null {
  const activeKey = activeFile.lineageKey || buildLineageKey(activeFile.name);
  const activeTs = activeFile.uploadedAt ?? 0;
  const parentCandidates = files
    .filter((file) => {
      if (file.id === activeFile.id || !isHwpFamily(file)) return false;
      const key = file.lineageKey || buildLineageKey(file.name);
      return key === activeKey && (file.uploadedAt ?? 0) < activeTs;
    })
    .sort((a, b) => (b.uploadedAt ?? 0) - (a.uploadedAt ?? 0));
  return parentCandidates[0] ?? null;
}

function findNearestChildByLineage(activeFile: WorkspaceFile, files: WorkspaceFile[]): WorkspaceFile | null {
  const activeKey = activeFile.lineageKey || buildLineageKey(activeFile.name);
  const activeTs = activeFile.uploadedAt ?? 0;
  const childCandidates = files
    .filter((file) => {
      if (file.id === activeFile.id || !isHwpFamily(file)) return false;
      const key = file.lineageKey || buildLineageKey(file.name);
      return key === activeKey && (file.uploadedAt ?? 0) > activeTs;
    })
    .sort((a, b) => (b.uploadedAt ?? 0) - (a.uploadedAt ?? 0));
  return childCandidates[0] ?? null;
}

function isChildFileByRule(activeFile: WorkspaceFile | null, files: WorkspaceFile[]): boolean {
  if (!activeFile || !isHwpFamily(activeFile)) return false;
  if (activeFile.parentFileId) return true;
  return !!findNearestParentByLineage(activeFile, files);
}

function findDiffPairForActiveFile(
  activeFile: WorkspaceFile | null,
  files: WorkspaceFile[],
  previews: Record<string, FilePreview>,
): DiffPair | null {
  if (!activeFile || !isHwpFamily(activeFile)) return null;

  const lineageKey = activeFile.lineageKey || buildLineageKey(activeFile.name);

  // Case 1: selected file is child (has parent reference or inferable parent)
  const explicitParent = activeFile.parentFileId ? files.find((file) => file.id === activeFile.parentFileId) || null : null;
  const inferredParent = explicitParent || findNearestParentByLineage(activeFile, files);
  if (inferredParent) {
    const originalPreview = previews[inferredParent.id];
    const resultPreview = previews[activeFile.id];
    if (!hasComparableData(inferredParent, originalPreview) || !hasComparableData(activeFile, resultPreview)) return null;
    return {
      originalFile: inferredParent,
      resultFile: activeFile,
      originalPreview,
      resultPreview,
      lineageKey,
      relation: 'parent-child',
    };
  }

  // Case 2: selected file is parent -> compare with the nearest newer child
  const inferredChild = findNearestChildByLineage(activeFile, files);
  if (!inferredChild) return null;
  const originalPreview = previews[activeFile.id];
  const resultPreview = previews[inferredChild.id];
  if (!hasComparableData(activeFile, originalPreview) || !hasComparableData(inferredChild, resultPreview)) return null;
  return {
    originalFile: activeFile,
    resultFile: inferredChild,
    originalPreview,
    resultPreview,
    lineageKey,
    relation: 'parent-child',
  };
}

function hasComparableData(file: WorkspaceFile, preview: FilePreview | undefined): boolean {
  if (extractComparableLines(preview)) return true;
  return !!parseComparableLinesFromTokens(file.compareLineTokens, file.compareText);
}

function laneNumberFromSessionId(sessionId: string): number {
  if (!sessionId) return 100;
  let hash = 0;
  for (let i = 0; i < sessionId.length; i += 1) hash = ((hash << 5) - hash + sessionId.charCodeAt(i)) | 0;
  return Math.abs(hash % 900) + 100;
}

function toUiSession(raw: any, idx: number): UiSession {
  const messages: ChatMessage[] = Array.isArray(raw?.messages)
    ? raw.messages.map((m: any, mi: number) => ({
        id: typeof m?.id === 'string' ? m.id : makeId(`m-${mi}`),
        sender: m?.role === 'user' ? 'user' : 'ai',
        text: typeof m?.content === 'string' ? m.content : '',
        timestamp: 'Now',
      }))
    : [DEFAULT_MESSAGE];

  return {
    id: typeof raw?.id === 'string' ? raw.id : `session-${idx}`,
    title: typeof raw?.title === 'string' && raw.title ? raw.title : '새 세션',
    date: new Date(typeof raw?.updatedAt === 'number' ? raw.updatedAt : Date.now()).toISOString().slice(0, 10),
    preview: messages[messages.length - 1]?.text?.slice(0, 60) || '대화 없음',
    messages,
    files: Array.isArray(raw?.files) ? raw.files : [],
    activeFileId: typeof raw?.activeFileId === 'string' ? raw.activeFileId : null,
  };
}

function fromUiSession(s: UiSession): any {
  return {
    id: s.id,
    title: s.title,
    updatedAt: Date.now(),
    activeFileId: s.activeFileId,
    files: s.files,
    messages: s.messages.map((m) => ({
      id: m.id,
      role: m.sender === 'user' ? 'user' : 'assistant',
      content: m.text,
    })),
  };
}

const AuthScreen = ({ onLogin }: { onLogin: (provider: Provider) => Promise<void> }) => {
  const [selectedModel, setSelectedModel] = useState<Provider | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'ready' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState('');

  const waitForRuntimeReady = async (intervalMs: number = 1500): Promise<void> => {
    while (true) {
      const [brainOk, agentOk] = await Promise.all([
        fetch(`${window.hihangul.brainBaseUrl}/health`).then((r) => r.ok).catch(() => false),
        fetch(`${window.hihangul.agentBaseUrl}/health`).then((r) => r.ok).catch(() => false),
      ]);
      if (brainOk && agentOk) return;
      setStatusMessage(`서비스 대기 중... Brain(${brainOk ? 'ok' : 'x'}) Agent(${agentOk ? 'ok' : 'x'})`);
      await new Promise((r) => window.setTimeout(r, intervalMs));
    }
  };

  const handleConnect = async () => {
    if (!selectedModel || isConnecting) return;
    try {
      setIsConnecting(true);
      setStatus('connecting');
      setStatusMessage('Windows 런타임(Brain/Agent) 상태를 확인하는 중...');
      await waitForRuntimeReady();
      setStatus('ready');
      setStatusMessage('런타임 준비 완료. 워크스페이스로 진입합니다.');
      await onLogin(selectedModel);
    } catch (error) {
      logUiError('auth.connect', error, { selectedModel });
      setStatus('error');
      setStatusMessage(`연결 실패: ${(error as Error).message || 'unknown error'}`);
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div className="hihangul-tailwind-ui flex items-center justify-center h-screen bg-slate-50 text-slate-800">
      <div className="w-full max-w-md p-8 bg-white rounded-2xl shadow-xl border border-slate-100">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl mx-auto flex items-center justify-center mb-4 shadow-lg shadow-blue-200">
            <span className="text-white font-bold text-2xl">Hi</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">HiHangul 시작하기</h1>
          <p className="text-slate-500 mt-2 text-sm">사용할 AI 엔진을 선택하여 Windows 환경과 연결합니다.</p>
        </div>

        <div className="space-y-6">
          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-700">AI Model Selection</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setSelectedModel('claude')}
                className={`p-4 rounded-xl border text-left transition-all relative overflow-hidden ${
                  selectedModel === 'claude'
                    ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100 shadow-md'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
                type="button"
              >
                <div className="flex items-center justify-between mb-2">
                  <Sparkles className={`w-5 h-5 ${selectedModel === 'claude' ? 'text-blue-600' : 'text-slate-400'}`} />
                  {selectedModel === 'claude' && <div className="w-2 h-2 bg-blue-500 rounded-full" />}
                </div>
                <div className="font-bold text-slate-800">Claude</div>
                <div className="text-xs text-slate-500 mt-1">Anthropic Sonnet</div>
              </button>

              <button
                onClick={() => setSelectedModel('codex')}
                className={`p-4 rounded-xl border text-left transition-all relative overflow-hidden ${
                  selectedModel === 'codex'
                    ? 'border-green-500 bg-green-50 ring-2 ring-green-100 shadow-md'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
                type="button"
              >
                <div className="flex items-center justify-between mb-2">
                  <Bot className={`w-5 h-5 ${selectedModel === 'codex' ? 'text-green-600' : 'text-slate-400'}`} />
                  {selectedModel === 'codex' && <div className="w-2 h-2 bg-green-500 rounded-full" />}
                </div>
                <div className="font-bold text-slate-800">Codex</div>
                <div className="text-xs text-slate-500 mt-1">OpenAI Code</div>
              </button>
            </div>
          </div>

          <button
            onClick={handleConnect}
            disabled={!selectedModel || isConnecting}
            className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors shadow-lg shadow-blue-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            type="button"
          >
            {isConnecting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Cpu className="w-5 h-5" />}
            {status === 'ready' ? '환경 진입 중...' : '시스템 연결 및 시작'}
          </button>
          {status !== 'idle' ? (
            <p className={`text-xs ${status === 'error' ? 'text-rose-600' : 'text-slate-500'}`}>
              {statusMessage}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
};

const Dashboard = ({ onNavigate, onStartApp, sessions, hostUserName, visibleRecentCount }: any) => {
  return (
    <div className="flex-1 bg-slate-50 p-8 overflow-y-auto">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold text-slate-900">반갑습니다, {hostUserName}님</h1>
          <p className="text-slate-500">오늘도 HiHangul과 함께 반복 업무를 자동화해보세요.</p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Grid className="w-5 h-5 text-blue-600" />
              나의 자동화 앱 (Launcher)
            </h2>
            <button className="text-sm text-blue-600 font-medium hover:underline flex items-center gap-1" type="button">
              전체보기 <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <button
              onClick={() => onNavigate('new')}
              className="bg-slate-100 border-2 border-dashed border-slate-300 rounded-xl p-5 flex flex-col items-center justify-center text-slate-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-all gap-3 h-full min-h-[160px]"
              type="button"
            >
              <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm">
                <Plus className="w-6 h-6" />
              </div>
              <span className="font-medium text-sm">새로운 앱 만들기</span>
            </button>

            {MOCK_LAUNCHER_APPS.map((app) => {
              const isExcel = app.type === 'excel';
              const iconBg = isExcel ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600';
              const iconHover = isExcel ? 'group-hover:bg-green-600' : 'group-hover:bg-blue-600';
              const borderHover = isExcel ? 'hover:border-green-200' : 'hover:border-blue-200';
              const badgeStyle = isExcel ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700';
              const playHover = isExcel ? 'group-hover:text-green-600' : 'group-hover:text-blue-600';

              return (
                <div
                  key={app.id}
                  onClick={() => onStartApp(app)}
                  className={`bg-white p-5 rounded-xl shadow-sm border border-slate-200 hover:shadow-lg hover:-translate-y-1 ${borderHover} transition-all cursor-pointer group flex flex-col justify-between h-full min-h-[160px]`}
                >
                  <div>
                    <div className="flex items-start justify-between mb-3">
                      <div className={`p-2 rounded-lg ${iconBg} ${iconHover} group-hover:text-white transition-colors`}>
                        {isExcel ? <FileSpreadsheet className="w-6 h-6" /> : <Box className="w-6 h-6" />}
                      </div>
                      <div className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeStyle}`}>{isExcel ? 'XLSX' : 'HWP'}</div>
                    </div>
                    <h3 className="font-bold text-slate-800 mb-1">{app.title}</h3>
                    <p className="text-xs text-slate-500 line-clamp-2">{app.description}</p>
                  </div>
                  <div className="mt-4 flex items-center justify-between pt-3 border-t border-slate-50 text-xs text-slate-400">
                    <span>{app.usageCount}회 실행됨</span>
                    <Play className={`w-3 h-3 text-slate-300 ${playHover}`} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-4">
            <MessageSquare className="w-5 h-5 text-green-600" />최근 대화 세션
          </h2>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 divide-y divide-slate-100">
            {sessions.length === 0 ? (
              <div className="p-6 text-sm text-slate-400">세션이 없습니다. 새로운 세션을 시작하세요.</div>
            ) : (
              sessions.slice(0, visibleRecentCount).map((session: UiSession) => (
                <div
                  key={session.id}
                  onClick={() => onNavigate(session.id)}
                  className="p-4 flex items-center justify-between hover:bg-slate-50 cursor-pointer transition-colors group"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-slate-100 text-slate-500">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-medium text-slate-800 group-hover:text-blue-600 transition-colors truncate">{session.title}</h4>
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{session.preview}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0">
                    <span className="text-xs text-slate-400">{session.date}</span>
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500" />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const SaveLogicModal = ({ isOpen, onClose, onSave }: any) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-2xl p-6 shadow-2xl scale-100 transform transition-all">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-slate-900">자동화 앱으로 저장</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" type="button">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">앱 이름</label>
            <input type="text" placeholder="예: 주간보고서 포맷팅" className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-100 outline-none text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">설명</label>
            <textarea placeholder="이 앱이 수행하는 작업을 간단히 적어주세요." className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-100 outline-none text-sm h-24 resize-none" />
          </div>
          <div className="bg-blue-50 p-3 rounded-lg flex gap-3 items-start">
            <div className="mt-0.5 text-blue-600">
              <Sparkles className="w-4 h-4" />
            </div>
            <p className="text-xs text-blue-700 leading-relaxed">
              현재 대화의 컨텍스트와 실행 로직이 패키징되어 <strong>Launcher</strong>에 등록됩니다. 등록 후에는 채팅 없이 버튼 하나로 실행할 수 있습니다.
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-slate-600 font-medium text-sm hover:bg-slate-100 rounded-lg" type="button">취소</button>
          <button onClick={() => { onSave(); onClose(); }} className="px-4 py-2 bg-blue-600 text-white font-medium text-sm hover:bg-blue-700 rounded-lg shadow-lg shadow-blue-100" type="button">
            앱 생성하기
          </button>
        </div>
      </div>
    </div>
  );
};

const PanelTab = ({ label, icon: Icon, active, onClick, badge }: any) => (
  <button
    onClick={onClick}
    className={`flex-1 py-3 flex items-center justify-center gap-2 text-sm font-medium border-b-2 transition-colors relative ${
      active ? 'border-blue-600 text-blue-600 bg-blue-50/50' : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
    }`}
    type="button"
  >
    <Icon className="w-4 h-4" />
    {label}
    {badge > 0 && <span className="ml-1 bg-blue-100 text-blue-700 text-[10px] px-1.5 py-0.5 rounded-full font-bold">{badge}</span>}
  </button>
);

const FileListContent = ({ files, activeFileId, onSelect, onUploadClick, loading }: any) => {
  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    files.forEach((f: WorkspaceFile) => map.set(f.id, f.name));
    return map;
  }, [files]);

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'xlsx':
        return <FileSpreadsheet className="w-4 h-4 text-green-600" />;
      case 'hwp':
      case 'hwpx':
        return <FileText className="w-4 h-4 text-blue-600" />;
      default:
        return <File className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="p-4 bg-white border-b border-slate-200">
        <button
          onClick={onUploadClick}
          className="w-full py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          disabled={loading}
          type="button"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
          {loading ? '파일 처리 중...' : 'Upload Files'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {files.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50 m-2">
            <FolderOpen className="w-10 h-10 mb-2 opacity-20" />
            <p className="text-xs">No files uploaded</p>
          </div>
        ) : (
          files.map((file: WorkspaceFile) => (
            <div
              key={file.id}
              onClick={() => onSelect(file)}
              className={`group flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border shadow-sm ${
                activeFileId === file.id ? 'bg-white border-blue-400 ring-2 ring-blue-50 z-10' : 'bg-white border-slate-200 hover:border-blue-300 hover:shadow-md'
              }`}
            >
              <div className={`p-2.5 rounded-lg ${activeFileId === file.id ? 'bg-blue-50' : 'bg-slate-100 group-hover:bg-blue-50'}`}>
                {getFileIcon(file.type)}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className={`text-sm font-semibold truncate ${activeFileId === file.id ? 'text-blue-700' : 'text-slate-800'}`}>{file.name}</h4>
                <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                  <span>{file.size}</span>
                  <span className="text-slate-300">|</span>
                  <span>{file.date}</span>
                </div>
                {file.parentFileId ? (
                  <div className="mt-1 text-[11px] text-emerald-700 truncate">
                    child of {nameById.get(file.parentFileId) || file.parentFileId}
                  </div>
                ) : null}
              </div>
              {activeFileId === file.id && <CheckCircle className="w-4 h-4 text-blue-600" />}
            </div>
          ))
        )}
      </div>

      <div className="p-3 border-t border-slate-200 text-center bg-slate-50">
        <p className="text-[10px] text-slate-400">Parallels Shared Folder: <span className="font-mono text-slate-500">Z:\Mac\Project</span></p>
      </div>
    </div>
  );
};

const PdfOverlayViewer = ({
  title,
  pdfUrl,
  highlights,
}: {
  title: string;
  pdfUrl: string;
  highlights?: PdfHighlightBox[];
}) => {
  const [pages, setPages] = useState<Array<{ page: number; dataUrl: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const renderPdf = async () => {
      setLoading(true);
      setError(null);
      setPages([]);
      try {
        const mod: any = await import(/* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build/pdf.min.mjs');
        const pdfjs = mod?.default || mod;
        if (!pdfjs?.getDocument) throw new Error('pdfjs not available');
        pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build/pdf.worker.min.mjs';
        const doc = await pdfjs.getDocument(pdfUrl).promise;
        const rendered: Array<{ page: number; dataUrl: string }> = [];
        for (let pageNo = 1; pageNo <= doc.numPages; pageNo += 1) {
          const page = await doc.getPage(pageNo);
          const viewport = page.getViewport({ scale: 1.35 });
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          await page.render({ canvasContext: ctx, viewport }).promise;
          rendered.push({ page: pageNo, dataUrl: canvas.toDataURL('image/png') });
        }
        if (!cancelled) setPages(rendered);
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message || 'pdf render failed');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    renderPdf();
    return () => {
      cancelled = true;
    };
  }, [pdfUrl]);

  const byPage = useMemo(() => {
    const map = new Map<number, PdfHighlightBox[]>();
    (highlights || []).forEach((box) => {
      if (!map.has(box.page)) map.set(box.page, []);
      map.get(box.page)!.push(box);
    });
    return map;
  }, [highlights]);

  if (loading) {
    return (
      <div className="w-full h-full min-h-0 bg-white flex items-center justify-center text-xs text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin mr-2" /> PDF 렌더링 중...
      </div>
    );
  }

  if (error || pages.length === 0) {
    return (
      <iframe
        title={title}
        src={`${pdfUrl}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
        className="w-full h-full border-0 min-h-0 flex-1"
      />
    );
  }

  return (
    <div className="w-full h-full min-h-0 overflow-auto bg-slate-50 p-2 space-y-3">
      {pages.map((page) => (
        <div key={`${title}-p-${page.page}`} className="relative w-full bg-white border border-slate-200 rounded overflow-hidden">
          <img src={page.dataUrl} alt={`${title} page ${page.page}`} className="w-full h-auto block" />
          {(byPage.get(page.page) || []).map((box, idx) => (
            <div
              key={`${title}-hl-${page.page}-${idx}`}
              className="absolute bg-lime-300/40 pointer-events-none"
              style={{
                left: `${Math.max(0, Math.min(1, box.x)) * 100}%`,
                top: `${Math.max(0, Math.min(1, box.y)) * 100}%`,
                width: `${Math.max(0, Math.min(1, box.w)) * 100}%`,
                height: `${Math.max(0, Math.min(1, box.h)) * 100}%`,
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
};

const MainApp = ({ hostUserName, appVersion }: { hostUserName: string; appVersion: string }) => {
  const [currentView, setCurrentView] = useState<'dashboard' | 'workspace'>('dashboard');
  const [sessions, setSessions] = useState<UiSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'chat' | 'files'>('chat');
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [diffMode, setDiffMode] = useState(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<SessionContextMenu | null>(null);
  const [visibleRecentCount, setVisibleRecentCount] = useState(4);
  const [storeReady, setStoreReady] = useState(false);
  const [isFileLoading, setIsFileLoading] = useState(false);
  const [filePreviewById, setFilePreviewById] = useState<Record<string, FilePreview>>({});
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const hiddenFileInputRef = useRef<HTMLInputElement | null>(null);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) || null,
    [sessions, activeSessionId],
  );
  const fileList = activeSession?.files ?? [];
  const activeFile = fileList.find((f) => f.id === activeSession?.activeFileId) ?? fileList[0] ?? null;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeSession?.messages, activeTab]);

  useEffect(() => {
    const computeVisibleRecent = () => {
      const viewport = window.innerHeight;
      const rough = Math.max(1, Math.min(8, Math.floor((viewport - 520) / 68) + 3));
      setVisibleRecentCount(rough);
    };
    computeVisibleRecent();
    window.addEventListener('resize', computeVisibleRecent);
    return () => window.removeEventListener('resize', computeVisibleRecent);
  }, []);

  useEffect(() => {
    return () => {
      Object.values(filePreviewById).forEach((preview) => {
        if ((preview.kind === 'image' || preview.kind === 'pdf') && preview.url.startsWith('blob:')) {
          URL.revokeObjectURL(preview.url);
        }
      });
    };
  }, [filePreviewById]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await window.hihangul.loadSessions();
        if (cancelled || !loaded?.ok) {
          setStoreReady(true);
          return;
        }
        const normalized = (Array.isArray(loaded.sessions) ? loaded.sessions : []).map((it: any, idx: number) => toUiSession(it, idx));
        setSessions(normalized);
        const activeId = typeof loaded.activeSessionId === 'string' ? loaded.activeSessionId : null;
        if (activeId && normalized.some((s: UiSession) => s.id === activeId)) {
          setActiveSessionId(activeId);
        } else {
          setActiveSessionId(normalized[0]?.id ?? null);
        }
      } catch (error) {
        logUiError('session.load', error);
      } finally {
        if (!cancelled) setStoreReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!storeReady) return;
    const t = window.setTimeout(async () => {
      try {
        await window.hihangul.saveSessions({
          sessions: sessions.map(fromUiSession),
          activeSessionId: activeSessionId ?? '',
        });
      } catch (error) {
        logUiError('session.save', error);
      }
    }, 250);
    return () => window.clearTimeout(t);
  }, [sessions, activeSessionId, storeReady]);

  useEffect(() => {
    const closeContext = () => setContextMenu(null);
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    window.addEventListener('click', closeContext);
    window.addEventListener('keydown', onEsc);
    return () => {
      window.removeEventListener('click', closeContext);
      window.removeEventListener('keydown', onEsc);
    };
  }, []);

  const updateActiveSession = (updater: (s: UiSession) => UiSession) => {
    if (!activeSessionId) return;
    setSessions((prev) => prev.map((s) => (s.id === activeSessionId ? updater(s) : s)));
  };

  const handleNavigateSession = (sessionId: string) => {
    try {
      if (sessionId === 'new') {
        const id = makeId('session');
        const s: UiSession = {
          id,
          title: '새 세션',
          date: new Date().toISOString().slice(0, 10),
          preview: '새로운 세션이 시작되었습니다.',
          messages: [{ id: makeId('msg'), sender: 'ai', text: '새로운 세션이 시작되었습니다. 작업하실 파일을 업로드해주세요.', timestamp: 'Now' }],
          files: [],
          activeFileId: null,
        };
        setSessions((prev) => [s, ...prev]);
        setActiveSessionId(id);
        setCurrentView('workspace');
        setActiveTab('files');
        return;
      }

      const exists = sessions.some((s) => s.id === sessionId);
      if (!exists) {
        logUi('session.open', 'missing session id', { sessionId });
        return;
      }
      setActiveSessionId(sessionId);
      setCurrentView('workspace');
      setActiveTab('chat');
    } catch (error) {
      logUiError('session.navigate', error, { sessionId });
    }
  };

  const handleStartApp = (app: any) => {
    try {
      const id = makeId('session');
      const appFile = {
        id: makeId('file'),
        name: 'target_document.hwp',
        size: 'Unknown',
        type: 'hwp',
        date: 'Now',
        uploadedAt: Date.now(),
        lineageKey: buildLineageKey('target_document.hwp'),
        parentFileId: null,
      };
      const s: UiSession = {
        id,
        title: app.title,
        date: new Date().toISOString().slice(0, 10),
        preview: `${app.title} 앱을 실행합니다.`,
        messages: [{ id: makeId('msg'), sender: 'ai', text: `${app.title} 앱을 실행합니다. 설정된 로직에 따라 문서를 분석 중입니다...`, timestamp: 'Now' }],
        files: [appFile],
        activeFileId: appFile.id,
      };
      setSessions((prev) => [s, ...prev]);
      setActiveSessionId(id);
      setCurrentView('workspace');
      setActiveTab('chat');
      setIsProcessing(true);
      window.setTimeout(() => {
        setIsProcessing(false);
        setDiffMode(true);
        setSessions((prev) =>
          prev.map((row) =>
            row.id === id
              ? {
                  ...row,
                  preview: '실행이 완료되었습니다. 결과물을 확인해주세요.',
                  messages: [...row.messages, { id: makeId('msg'), sender: 'ai', text: '실행이 완료되었습니다. 결과물을 확인해주세요.', timestamp: 'Now' }],
                }
              : row,
          ),
        );
      }, 1200);
    } catch (error) {
      logUiError('launcher.start', error, { app });
    }
  };

  const getFileExt = (filename: string) => {
    const dot = filename.lastIndexOf('.');
    if (dot < 0) return '';
    return filename.slice(dot + 1).toLowerCase();
  };

  const buildPreviewForFile = async (file: File): Promise<FilePreview> => {
    const ext = getFileExt(file.name);
    const mime = (file.type || '').toLowerCase();

    if (mime.startsWith('image/')) {
      return { kind: 'image', url: URL.createObjectURL(file) };
    }
    if (mime === 'application/pdf' || ext === 'pdf') {
      return { kind: 'pdf', url: URL.createObjectURL(file) };
    }
    if (mime.startsWith('text/') || TEXT_EXTENSIONS.has(ext)) {
      const raw = await file.text();
      const truncated = raw.length > MAX_TEXT_PREVIEW_LEN;
      const textContent = truncated ? raw.slice(0, MAX_TEXT_PREVIEW_LEN) : raw;
      const compareLineTokens = splitLines(textContent).map((line) => `${line.text}\u241F${line.styleKey}`);
      return {
        kind: 'text',
        content: textContent,
        truncated,
        compareText: textContent,
        compareLineTokens,
      };
    }
    if (ext === 'hwp' || ext === 'hwpx') {
      const fetchComparablePreview = async (): Promise<{ rich?: FilePreview; text?: FilePreview; detail?: string }> => {
        const fallbackForm = new FormData();
        fallbackForm.append('file', file, file.name);
        const res = await fetch(`${window.hihangul.agentBaseUrl}/v1/viewer/preview?layout_mode=precise`, {
          method: 'POST',
          body: fallbackForm,
        });
        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          return { detail: detail || String(res.status) };
        }
        const data = await res.json();
        const preview = data?.preview;
        if (preview?.kind === 'rich' && Array.isArray(preview.blocks)) {
          const content = typeof preview.content === 'string' ? preview.content : '';
          const lines = richBlocksToComparableLines(preview.blocks);
          const compareLineTokens = lines.map((line) => `${line.text}\u241F${line.styleKey}`);
          return {
            rich: {
              kind: 'rich',
              blocks: preview.blocks,
              content,
              truncated: !!preview.truncated,
              compareText: content,
              compareLineTokens,
            },
          };
        }
        if (preview?.kind === 'text' && typeof preview.content === 'string') {
          const lines = splitLines(preview.content);
          const compareLineTokens = lines.map((line) => `${line.text}\u241F${line.styleKey}`);
          return {
            text: {
              kind: 'text',
              content: preview.content,
              truncated: !!preview.truncated,
              compareText: preview.content,
              compareLineTokens,
            },
          };
        }
        return { detail: 'HWP 미리보기 결과를 해석할 수 없습니다.' };
      };

      try {
        const form = new FormData();
        form.append('file', file, file.name);
        const pdfRes = await fetch(`${window.hihangul.agentBaseUrl}/v1/viewer/render-pdf`, {
          method: 'POST',
          body: form,
        });
        if (pdfRes.ok) {
          const pdfBlob = await pdfRes.blob();
          const compare = await fetchComparablePreview().catch(() => ({}));
          const compareText = compare.rich?.compareText || compare.text?.compareText;
          const compareLineTokens = compare.rich?.compareLineTokens || compare.text?.compareLineTokens;
          const richBlocks = compare.rich?.kind === 'rich' ? compare.rich.blocks : undefined;
          return { kind: 'pdf', url: URL.createObjectURL(pdfBlob), compareText, compareLineTokens, richBlocks };
        }
        const renderDetail = await pdfRes.text().catch(() => '');
        const compare = await fetchComparablePreview().catch(() => ({}));
        if (compare.rich) return compare.rich;
        if (compare.text) return compare.text;
        const detail = compare.detail || renderDetail || 'unknown error';
        return { kind: 'none', note: `HWP 미리보기 생성 실패: ${detail}` };
      } catch (error) {
        logUiError('file.preview.hwp', error, { file: file.name });
        return { kind: 'none', note: 'HWP 미리보기 요청 실패: windows-agent 연결 상태를 확인하세요.' };
      }
    }
    if (ext === 'xlsx' || ext === 'xls') {
      return { kind: 'none', note: 'Excel 바이너리 파일은 표준 미리보기 대신 실행 기반 분석으로 확인합니다.' };
    }
    return { kind: 'none', note: '이 파일 형식은 현재 미리보기를 지원하지 않습니다.' };
  };

  const handleGoHome = () => {
    setCurrentView('dashboard');
    setActiveSessionId(null);
  };

  const handleSendMessage = () => {
    if (!inputText.trim() || !activeSessionId) return;
    const value = inputText.trim();
    setInputText('');
    setIsProcessing(true);
    updateActiveSession((session) => ({
      ...session,
      preview: value,
      messages: [...session.messages, { id: makeId('msg'), sender: 'user', text: value, timestamp: 'Now' }],
    }));

    window.setTimeout(() => {
      setIsProcessing(false);
      setDiffMode(true);
      updateActiveSession((session) => ({
        ...session,
        preview: '요청하신 작업을 완료했습니다.',
        messages: [
          ...session.messages,
          {
            id: makeId('msg'),
            sender: 'ai',
            text: '요청하신대로 표의 테두리 스타일을 변경했습니다. 우측 미리보기에서 변경 사항(Diff)을 확인해주세요.',
            timestamp: 'Now',
          },
        ],
      }));
    }, 1200);
  };

  const openFileDialog = () => {
    hiddenFileInputRef.current?.click();
  };

  const handleFileChosen = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const picked = Array.from(event.target.files ?? []);
      if (!picked.length || !activeSessionId) return;
      setIsFileLoading(true);

      const now = Date.now();
      const mapped: WorkspaceFile[] = picked.map((file, index) => {
        const ext = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() : 'other';
        const sizeMb = file.size / (1024 * 1024);
        const size = sizeMb >= 1 ? `${sizeMb.toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`;
        return {
          id: makeId('file'),
          name: file.name,
          size,
          type: ext || 'other',
          date: 'Just now',
          mime: file.type || 'application/octet-stream',
          uploadedAt: now + index,
        };
      });

      const existingFiles = activeSession?.files ?? [];
      const withLineage: WorkspaceFile[] = [];
      for (const file of mapped) {
        if (!isHwpFamily(file)) {
          withLineage.push(file);
          continue;
        }
        const lineageKey = buildLineageKey(file.name);
        const pool = [...existingFiles, ...withLineage];
        const parentFileId = inferParentFileId(lineageKey, file.uploadedAt ?? now, pool);
        withLineage.push({
          ...file,
          lineageKey,
          parentFileId,
        });
      }

      const previews = await Promise.all(picked.map((file) => buildPreviewForFile(file)));
      const nextPreviewById: Record<string, FilePreview> = {};
      const withComparable = withLineage.map((f, idx) => {
        const preview = previews[idx];
        nextPreviewById[f.id] = preview;
        const payload = buildComparablePayload(preview);
        if (!payload) return f;
        return {
          ...f,
          compareText: payload.compareText,
          compareLineTokens: payload.compareLineTokens,
        };
      });
      setFilePreviewById((prev) => ({ ...prev, ...nextPreviewById }));

      updateActiveSession((session) => ({
        ...session,
        files: [...session.files, ...withComparable],
        activeFileId: withComparable[0]?.id ?? session.activeFileId,
        preview: `파일 ${withComparable[0]?.name ?? ''} 업로드 완료`,
        messages: [...session.messages, { id: makeId('msg'), sender: 'ai', text: `파일(${withComparable[0]?.name})이 업로드되었습니다. 문서 구조 분석을 완료했습니다.`, timestamp: 'Now' }],
      }));
      event.target.value = '';
    } catch (error) {
      logUiError('file.upload', error);
    } finally {
      setIsFileLoading(false);
    }
  };

  const handleFileSelect = (file: WorkspaceFile) => {
    updateActiveSession((session) => ({ ...session, activeFileId: file.id }));
  };

  const handleDeleteSession = (sessionId: string) => {
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== sessionId);
      if (activeSessionId === sessionId) {
        setCurrentView('dashboard');
        setActiveSessionId(null);
      }
      return next;
    });
    setContextMenu(null);
  };

  const laneNumber = laneNumberFromSessionId(activeSessionId ?? '');
  const activeFilePreview = activeFile ? filePreviewById[activeFile.id] : undefined;
  const diffPair = useMemo(
    () => findDiffPairForActiveFile(activeFile, fileList, filePreviewById),
    [activeFile, fileList, filePreviewById],
  );
  const diffData = useMemo(() => {
    if (!diffPair) return null;
    const originalLines =
      extractComparableLines(diffPair.originalPreview)
      || parseComparableLinesFromTokens(diffPair.originalFile.compareLineTokens, diffPair.originalFile.compareText);
    const resultLines =
      extractComparableLines(diffPair.resultPreview)
      || parseComparableLinesFromTokens(diffPair.resultFile.compareLineTokens, diffPair.resultFile.compareText);
    if (!originalLines || !resultLines) return null;
    const changedInResult = changedLinesByLcs(originalLines, resultLines);
    const changedCount = changedInResult.filter(Boolean).length;
    return { originalLines, resultLines, changedInResult, changedCount };
  }, [diffPair]);
  const diffRichData = useMemo(() => {
    if (!diffPair) return null;
    const originalBlocks = extractRichBlocks(diffPair.originalPreview);
    const resultBlocks = extractRichBlocks(diffPair.resultPreview);
    if (!originalBlocks || !resultBlocks) return null;
    const originalSignatureSet = new Set(originalBlocks.map((block) => blockSignature(block)));
    const changedBlockIndexes = resultBlocks
      .map((block, idx) => (originalSignatureSet.has(blockSignature(block)) ? -1 : idx))
      .filter((idx) => idx >= 0);
    return {
      originalBlocks,
      resultBlocks,
      changedBlockIndexes: new Set(changedBlockIndexes),
      changedCount: changedBlockIndexes.length,
    };
  }, [diffPair]);

  useEffect(() => {
    setDiffMode(isChildFileByRule(activeFile, fileList));
  }, [activeFile?.id, fileList]);

  return (
    <div className="hihangul-tailwind-ui flex h-screen bg-slate-50 text-slate-800 font-sans overflow-hidden">
      <div className="w-64 bg-slate-900 text-slate-300 flex flex-col flex-shrink-0 transition-all duration-300 sticky top-0 h-screen">
        <div onClick={handleGoHome} className="p-5 flex items-center gap-3 border-b border-slate-800 cursor-pointer hover:bg-slate-800/50 transition-colors">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-900/50">
            <span className="text-white font-bold">Hi</span>
          </div>
          <span className="font-semibold text-white tracking-wide">HiHangul</span>
        </div>

        <div className="flex-1 overflow-y-auto py-4">
          <div className="px-3 mb-6">
            <button
              onClick={handleGoHome}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${currentView === 'dashboard' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
              type="button"
            >
              <Home className="w-4 h-4" />
              Dashboard
            </button>
          </div>

          <div className="px-4 mb-2 text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
            <span>Active Sessions</span>
            <button
              onClick={() => handleNavigateSession('new')}
              className="inline-flex items-center justify-center w-5 h-5 rounded text-slate-400 hover:text-blue-400 hover:bg-slate-800"
              type="button"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-1 px-2 mb-8">
            {sessions.map((session) => (
              <button
                key={session.id}
                onClick={() => handleNavigateSession(session.id)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setContextMenu({ x: event.clientX, y: event.clientY, sessionId: session.id });
                }}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center gap-3 transition-colors ${
                  activeSessionId === session.id && currentView === 'workspace' ? 'bg-slate-800 text-white border-l-2 border-blue-500' : 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
                type="button"
              >
                <MessageSquare className="w-4 h-4 opacity-70" />
                <span className="truncate">{session.title}</span>
              </button>
            ))}
          </div>

          <div className="px-4 mb-2 text-xs font-bold text-slate-500 uppercase tracking-wider">Launcher</div>
          <div className="space-y-1 px-2">
            {MOCK_LAUNCHER_APPS.map((app) => (
              <div
                key={app.id}
                onClick={() => handleStartApp(app)}
                className="group relative w-full text-left px-3 py-3 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer border border-transparent hover:border-slate-700"
              >
                <div className="flex items-center gap-3 mb-1">
                  <div className="p-1.5 bg-indigo-500/20 text-indigo-400 rounded-md">
                    <Box className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-medium text-slate-200">{app.title}</span>
                </div>
                <p className="text-xs text-slate-500 pl-10 truncate">{app.description}</p>
                <button className="absolute right-2 top-3 opacity-0 group-hover:opacity-100 p-1 bg-blue-600 rounded text-white hover:bg-blue-500 transition-all" type="button">
                  <Play className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 border-t border-slate-800">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-slate-500 uppercase tracking-wide">HiHangul v{appVersion}</span>
            <span className="text-xs text-slate-300 truncate">{hostUserName}</span>
          </div>
        </div>
      </div>

      {currentView === 'dashboard' ? (
        <Dashboard
          onNavigate={handleNavigateSession}
          onStartApp={handleStartApp}
          sessions={sessions}
          hostUserName={hostUserName}
          visibleRecentCount={visibleRecentCount}
        />
      ) : (
        <div className="flex-1 flex flex-col min-w-0 animate-in fade-in duration-300">
          <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 flex-shrink-0">
            <div className="flex items-center gap-4">
              <h2 className="font-bold text-lg text-slate-800">{activeSession?.title ?? 'New Session'}</h2>
              <span className="px-2 py-1 bg-blue-50 text-blue-600 text-xs font-medium rounded-full border border-blue-100 flex items-center gap-1">
                <Cpu className="w-3 h-3" /> Lane #{laneNumber} Active
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setCurrentView('dashboard')}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-500 hover:bg-slate-100"
                type="button"
              >
                <Home className="w-4 h-4" />Home
              </button>
              <button
                onClick={() => setDiffMode(!diffMode)}
                disabled={!activeFile}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  diffMode ? 'bg-indigo-50 text-indigo-600 border border-indigo-200' : 'text-slate-500 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed'
                }`}
                type="button"
              >
                <ArrowRightLeft className="w-4 h-4" />
                {diffMode ? 'Diff Mode On' : 'View Diff'}
              </button>
              <div className="h-4 w-px bg-slate-300 mx-1" />
              <button
                onClick={() => setIsSaveModalOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg text-sm font-medium transition-colors"
                type="button"
              >
                <Save className="w-4 h-4" />
                <span>Save as App</span>
              </button>
              <button className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100" type="button">
                <Settings className="w-5 h-5" />
              </button>
            </div>
          </header>

          <div className="flex-1 flex overflow-hidden">
            <div className="w-[450px] flex flex-col border-r border-slate-200 bg-white shadow-xl z-10 flex-shrink-0">
              <div className="flex border-b border-slate-200 bg-white">
                <PanelTab label="Chat Assistant" icon={MessageSquare} active={activeTab === 'chat'} onClick={() => setActiveTab('chat')} />
                <PanelTab label="Project Files" icon={FolderOpen} active={activeTab === 'files'} onClick={() => setActiveTab('files')} badge={fileList.length} />
              </div>

              {activeTab === 'chat' && (
                <div className="flex-1 flex flex-col min-h-0">
                  <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/30">
                    {(activeSession?.messages ?? []).map((msg) => (
                      <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[90%] rounded-2xl p-4 shadow-sm ${msg.sender === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-white border border-slate-200 text-slate-700 rounded-bl-none'}`}>
                          {msg.sender === 'ai' && (
                            <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-100/10">
                              <Terminal className="w-3 h-3" />
                              <span className="text-xs font-semibold opacity-70">Agent Logic</span>
                            </div>
                          )}
                          <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                          <div className={`text-[10px] mt-2 text-right ${msg.sender === 'user' ? 'opacity-70' : 'text-slate-400'}`}>{msg.timestamp}</div>
                        </div>
                      </div>
                    ))}

                    {isProcessing && (
                      <div className="flex justify-start">
                        <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-none p-4 shadow-sm flex items-center gap-3">
                          <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                          <span className="text-sm text-slate-500">{activeFile ? 'Windows 가상환경에서 실행 중...' : '파일 업로드 처리 중...'}</span>
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  <div className="p-4 bg-white border-t border-slate-200">
                    <div className="relative">
                      <input
                        type="text"
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                        placeholder={activeFile ? 'Hwp 문서에 대해 명령하세요...' : '파일을 먼저 업로드해주세요.'}
                        disabled={!activeFile}
                        className="w-full pl-4 pr-12 py-3 bg-slate-100 border-transparent focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 rounded-xl transition-all outline-none text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                      />
                      <button
                        onClick={handleSendMessage}
                        disabled={!inputText.trim() || isProcessing || !activeFile}
                        className="absolute right-2 top-2 p-1.5 w-8 h-8 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:bg-slate-400 transition-colors"
                        type="button"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'files' && (
                <FileListContent
                  files={fileList}
                  activeFileId={activeFile?.id}
                  onSelect={handleFileSelect}
                  onUploadClick={openFileDialog}
                  loading={isFileLoading}
                />
              )}
            </div>

            {activeSession && fileList.length === 0 ? (
              <div className="flex-1 bg-slate-100 p-8 flex items-center justify-center animate-in fade-in zoom-in-95 duration-300">
                <div
                  onClick={openFileDialog}
                  className="w-full max-w-xl p-12 border-2 border-dashed border-slate-300 rounded-3xl bg-white flex flex-col items-center justify-center text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50/50 transition-all group shadow-sm hover:shadow-md"
                >
                  <div className="w-20 h-20 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                    <UploadCloud className="w-10 h-10" />
                  </div>
                  <h3 className="text-2xl font-bold text-slate-800 mb-3">HWP 파일 업로드</h3>
                  <p className="text-slate-500 mb-8 leading-relaxed">
                    작업을 시작하려면 <strong>한글(.hwp)</strong> 파일을
                    <br />
                    이곳에 드래그하거나 클릭하여 업로드하세요.
                  </p>
                  <button className="px-8 py-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all shadow-xl shadow-blue-200 flex items-center gap-2 group-hover:translate-y-[-2px]" type="button">
                    <FileUp className="w-5 h-5" />
                    파일 선택하기
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex-1 bg-white overflow-hidden flex justify-center animate-in fade-in duration-300">
                <div className="w-full max-w-4xl h-full min-h-0 relative transition-all flex flex-col">
                  <div className="px-4 py-2.5 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white flex items-center justify-between gap-4 flex-shrink-0">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${diffMode ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                          {diffMode ? 'DIFF VIEW' : 'DOCUMENT VIEW'}
                        </span>
                        {diffMode && diffPair ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                            changed {diffRichData ? diffRichData.changedCount : diffData?.changedCount || 0}
                          </span>
                        ) : null}
                      </div>
                      <div className="text-sm font-semibold text-slate-800 truncate">
                        {diffMode && diffPair ? `${diffPair.originalFile.name} -> ${diffPair.resultFile.name}` : activeFile ? activeFile.name : 'No file selected'}
                      </div>
                    </div>
                    <div className="text-[11px] text-slate-500 font-medium flex-shrink-0">
                      {diffMode && diffPair ? 'Result-focused compare' : 'Preview'}
                    </div>
                  </div>
                  <div className={`${activeFilePreview?.kind === 'pdf' ? 'p-0 overflow-hidden' : 'p-8 overflow-auto'} text-slate-800 flex-1 min-h-0`}>

                    {diffMode ? (
                      diffPair && (diffData || diffRichData) ? (
                        <div className="h-full min-h-[420px] flex flex-col gap-3">
                          {(() => {
                            const bothPdf = diffPair.originalPreview.kind === 'pdf' && diffPair.resultPreview.kind === 'pdf';
                            const changedLines = diffData
                              ? diffData.resultLines
                                .map((line, idx) => ({ line, idx, changed: diffData.changedInResult[idx] }))
                                .filter((row) => row.changed)
                              : [];
                            if (bothPdf) {
                              const changedBboxes: PdfHighlightBox[] = diffRichData
                                ? diffRichData.resultBlocks
                                    .map((block, idx) => {
                                      if (!diffRichData.changedBlockIndexes.has(idx) || !block.bbox) return null;
                                      return {
                                        page: block.bbox.page,
                                        x: block.bbox.x,
                                        y: block.bbox.y,
                                        w: block.bbox.w,
                                        h: block.bbox.h,
                                      };
                                    })
                                    .filter(Boolean) as PdfHighlightBox[]
                                : [];
                              return (
                                <>
                                  <div className="px-3 py-2 rounded-lg border text-xs bg-emerald-50 border-emerald-200 text-emerald-800">
                                    PDF 내부 직접 하이라이트 모드: 결과 문서에 변경 좌표를 오버레이합니다. (하이라이트 {changedBboxes.length}개)
                                  </div>
                                  <div className="grid grid-cols-2 gap-3 min-h-0 flex-1">
                                    <div className="border border-slate-200 rounded-lg overflow-hidden bg-white min-h-0 flex flex-col">
                                      <div className="px-3 py-2 bg-slate-100 border-b border-slate-200 text-xs font-semibold text-slate-700">
                                        Original PDF · {diffPair.originalFile.name}
                                      </div>
                                      <PdfOverlayViewer
                                        title={`Original ${diffPair.originalFile.name}`}
                                        pdfUrl={diffPair.originalPreview.url}
                                      />
                                    </div>
                                    <div className="border border-slate-200 rounded-lg overflow-hidden bg-white min-h-0 flex flex-col">
                                      <div className="px-3 py-2 bg-slate-100 border-b border-slate-200 text-xs font-semibold text-slate-700">
                                        Result PDF · {diffPair.resultFile.name}
                                      </div>
                                      <PdfOverlayViewer
                                        title={`Result ${diffPair.resultFile.name}`}
                                        pdfUrl={diffPair.resultPreview.url}
                                        highlights={changedBboxes}
                                      />
                                    </div>
                                  </div>
                                  <div className="border border-emerald-200 bg-emerald-50 rounded-lg p-3 max-h-40 overflow-auto">
                                    <div className="text-xs font-semibold text-emerald-900 mb-2">
                                      변경 목록 ({changedLines.length})
                                    </div>
                                    {changedLines.length === 0 ? (
                                      <div className="text-xs text-emerald-800">비교 가능한 텍스트 변경이 감지되지 않았습니다.</div>
                                    ) : (
                                      <div className="space-y-1">
                                        {changedLines.slice(0, 80).map(({ line, idx }) => (
                                          <div key={`chg-${idx}`} className="text-xs bg-white/80 border border-emerald-200 rounded px-2 py-1 text-emerald-900">
                                            L{idx + 1}: {line.text || '(blank)'}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </>
                              );
                            }
                            return null;
                          })()}
                          {!(diffPair.originalPreview.kind === 'pdf' && diffPair.resultPreview.kind === 'pdf') ? (
                            <>
                              <div className="px-3 py-2 rounded-lg border text-xs bg-emerald-50 border-emerald-200 text-emerald-800">
                                Viewer Diff: <strong>{diffPair.originalFile.name}</strong> 대비 <strong>{diffPair.resultFile.name}</strong> 변경 항목
                                <strong> {diffRichData ? diffRichData.changedCount : diffData?.changedCount || 0}개</strong>를 결과 문서에 강조 표시합니다.
                              </div>
                              <div className="h-full min-h-0 overflow-auto bg-white rounded-lg border border-slate-200 p-4">
                                {diffRichData ? (
                                  <div className="m-0 text-[15px] leading-8 whitespace-pre-wrap break-words font-serif text-slate-800">
                                    {diffRichData.resultBlocks.map((block, blockIndex) => {
                                      const changed = diffRichData.changedBlockIndexes.has(blockIndex);
                                      const blockClass = changed ? 'bg-emerald-100/80 rounded px-2 py-1' : '';
                                      if (block.type === 'table') {
                                        return (
                                          <div key={`diff-tbl-${blockIndex}`} className={`my-6 overflow-auto border border-slate-300 ${blockClass}`}>
                                            {changed && block.bbox ? (
                                              <div className="text-[10px] px-2 py-1 bg-emerald-200/70 text-emerald-900 border-b border-emerald-300">
                                                p{block.bbox.page} x={block.bbox.x.toFixed(3)} y={block.bbox.y.toFixed(3)} w={block.bbox.w.toFixed(3)} h={block.bbox.h.toFixed(3)}
                                              </div>
                                            ) : null}
                                            <table className="w-full border-collapse text-[14px]">
                                              <tbody>
                                                {block.rows.map((row, rowIndex) => (
                                                  <tr key={`diff-row-${blockIndex}-${rowIndex}`} className="border-b border-slate-200">
                                                    {row.map((cell, cellIndex) => (
                                                      <td key={`diff-cell-${blockIndex}-${rowIndex}-${cellIndex}`} className="border-r border-slate-200 px-3 py-2 align-top">
                                                        {cell}
                                                      </td>
                                                    ))}
                                                  </tr>
                                                ))}
                                              </tbody>
                                            </table>
                                          </div>
                                        );
                                      }
                                      return (
                                        <p key={`diff-p-${blockIndex}`} className={`my-1 ${blockClass}`}>
                                          {changed && block.bbox ? (
                                            <span className="inline-block mr-2 text-[10px] px-1.5 py-0.5 rounded bg-emerald-200/70 text-emerald-900 align-middle">
                                              p{block.bbox.page} y={block.bbox.y.toFixed(3)}
                                            </span>
                                          ) : null}
                                          {block.runs.map((run, runIndex) => (
                                            <span
                                              key={`diff-run-${blockIndex}-${runIndex}`}
                                              style={{
                                                fontSize: `${run.font_size_px}px`,
                                                fontWeight: run.bold ? 700 : 400,
                                                fontFamily: run.font_family || 'Malgun Gothic, Noto Sans KR, sans-serif',
                                              }}
                                            >
                                              {run.text}{' '}
                                            </span>
                                          ))}
                                        </p>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <div className="text-[13px] leading-6 font-mono">
                                    {diffData.resultLines.map((line, idx) => (
                                      <div
                                        key={`res-${idx}`}
                                        className={`px-2 ${diffData.changedInResult[idx] ? 'bg-emerald-100 text-emerald-900 rounded' : 'text-slate-700'}`}
                                      >
                                        <span>{line.text || ' '}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </>
                          ) : null}
                        </div>
                      ) : (
                        <div className="bg-amber-50 p-4 rounded-lg border border-amber-200 text-sm text-amber-800">
                          비교 가능한 부모-자식 파일 쌍을 찾지 못했습니다. 같은 계보(lineage)의 HWP/HWPX 원본/파생 파일을 업로드한 뒤 다시 선택하세요.
                        </div>
                      )
                    ) : !activeFile ? (
                      <div className="text-sm text-slate-500">미리볼 파일을 선택하세요.</div>
                    ) : isFileLoading ? (
                      <div className="bg-white p-10 flex flex-col items-center justify-center gap-3 min-h-[320px]">
                        <Loader2 className="w-7 h-7 text-blue-600 animate-spin" />
                        <p className="text-sm text-slate-600">문서 미리보기를 생성하고 있습니다...</p>
                        <p className="text-xs text-slate-400">HWP/HWPX는 구조 분석에 시간이 조금 더 걸릴 수 있습니다.</p>
                      </div>
                    ) : activeFilePreview?.kind === 'image' ? (
                      <div className="bg-white p-1">
                        <img src={activeFilePreview.url} alt={activeFile.name} className="max-h-[720px] w-full object-contain rounded bg-white" />
                      </div>
                    ) : activeFilePreview?.kind === 'pdf' ? (
                      <div className="bg-white overflow-hidden w-full h-full">
                        <iframe
                          title={activeFile.name}
                          src={`${activeFilePreview.url}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
                          className="w-full h-full border-0"
                        />
                      </div>
                    ) : activeFilePreview?.kind === 'rich' ? (
                      <div className="h-full min-h-[420px]">
                        <div className="m-0 text-[15px] leading-8 whitespace-pre-wrap break-words font-serif text-slate-800 h-full overflow-auto bg-white">
                          {activeFilePreview.blocks.map((block, blockIndex) => {
                            if (block.type === 'table') {
                              return (
                                <div key={`tbl-${blockIndex}`} className="my-6 overflow-auto border border-slate-300">
                                  <table className="w-full border-collapse text-[14px]">
                                    <tbody>
                                      {block.rows.map((row, rowIndex) => (
                                        <tr key={`row-${rowIndex}`} className="border-b border-slate-200">
                                          {row.map((cell, cellIndex) => (
                                            <td key={`cell-${rowIndex}-${cellIndex}`} className="border-r border-slate-200 px-3 py-2 align-top">
                                              {cell}
                                            </td>
                                          ))}
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              );
                            }
                            return (
                              <p key={`p-${blockIndex}`} className="my-1">
                                {block.runs.map((run, runIndex) => (
                                  <span
                                    key={`run-${blockIndex}-${runIndex}`}
                                    style={{
                                      fontSize: `${run.font_size_px}px`,
                                      fontWeight: run.bold ? 700 : 400,
                                      fontFamily: run.font_family || 'Malgun Gothic, Noto Sans KR, sans-serif',
                                    }}
                                  >
                                    {run.text}{' '}
                                  </span>
                                ))}
                              </p>
                            );
                          })}
                        </div>
                        {activeFilePreview.truncated ? (
                          <div className="px-4 py-2 text-xs text-amber-700 bg-amber-50 border-t border-amber-200">
                            미리보기 길이 제한으로 일부만 표시했습니다.
                          </div>
                        ) : null}
                      </div>
                    ) : activeFilePreview?.kind === 'text' ? (
                      <div className="h-full min-h-[420px]">
                        <pre className="m-0 text-[15px] leading-8 whitespace-pre-wrap break-words font-serif text-slate-800 h-full overflow-auto bg-white">
                          {activeFilePreview.content}
                        </pre>
                        {activeFilePreview.truncated ? (
                          <div className="px-4 py-2 text-xs text-amber-700 bg-amber-50 border-t border-amber-200">
                            미리보기 길이 제한으로 일부만 표시했습니다.
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="bg-slate-50 p-5 text-sm text-slate-600">
                        <p className="mb-3 font-medium text-slate-800">미리보기 불가 파일</p>
                        <p>{activeFilePreview?.note ?? '파일 형식을 확인할 수 없습니다.'}</p>
                        <p className="mt-3 text-xs text-slate-500">
                          파일 형식: {activeFile.type.toUpperCase()} {activeFile.mime ? `(${activeFile.mime})` : ''}
                        </p>
                      </div>
                    )}

                    {diffMode ? (
                      <div className="mt-3 text-sm text-blue-600 flex items-center gap-2 bg-blue-50 p-3 rounded-lg border border-blue-100">
                        <CheckCircle className="w-4 h-4" />
                        <span>Diff 모드가 켜져 있습니다. 실행 결과 비교 시 강조 표시됩니다.</span>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {contextMenu ? (
        <div className="fixed z-[100] bg-white border border-slate-200 rounded-lg shadow-xl p-1" style={{ top: contextMenu.y, left: contextMenu.x }} onClick={(e) => e.stopPropagation()}>
          <button className="text-left text-sm px-3 py-2 rounded hover:bg-slate-100 text-rose-600" onClick={() => handleDeleteSession(contextMenu.sessionId)} type="button">
            세션 삭제
          </button>
        </div>
      ) : null}

      <SaveLogicModal isOpen={isSaveModalOpen} onClose={() => setIsSaveModalOpen(false)} onSave={() => logUi('launcher.save', 'saved current logic')} />

      <input ref={hiddenFileInputRef} type="file" multiple style={{ display: 'none' }} onChange={handleFileChosen} />
    </div>
  );
};

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [hostUserName, setHostUserName] = useState('사용자');
  const [appVersion, setAppVersion] = useState('0.1.0');

  useEffect(() => {
    const onError = (event: ErrorEvent) => logUiError('window.error', event.error ?? event.message);
    const onUnhandled = (event: PromiseRejectionEvent) => logUiError('window.unhandled', event.reason);
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandled);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandled);
    };
  }, []);

  const handleLogin = async (_provider: Provider) => {
    try {
      const version = await window.hihangul.getAppVersion();
      if (version?.ok && version.version) {
        setAppVersion(version.version);
      }
      const user = await window.hihangul.getHostUser();
      if (user?.username) {
        setHostUserName(user.username);
      }
    } catch (error) {
      logUiError('auth.host-user', error);
    }
    setIsLoggedIn(true);
  };

  return isLoggedIn ? <MainApp hostUserName={hostUserName} appVersion={appVersion} /> : <AuthScreen onLogin={handleLogin} />;
}

export { App };
