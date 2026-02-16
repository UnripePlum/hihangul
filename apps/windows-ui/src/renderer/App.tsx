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
type WorkspaceFile = { id: string; name: string; size: string; type: string; date: string };
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
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected'>('idle');

  const handleConnect = async () => {
    if (!selectedModel || isConnecting) return;
    try {
      setIsConnecting(true);
      setStatus('connecting');
      await new Promise((r) => window.setTimeout(r, 800));
      setStatus('connected');
      await new Promise((r) => window.setTimeout(r, 500));
      await onLogin(selectedModel);
    } catch (error) {
      logUiError('auth.connect', error, { selectedModel });
      setStatus('idle');
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
            {status === 'connected' ? '환경 진입 중...' : '시스템 연결 및 시작'}
          </button>
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

const FileListContent = ({ files, activeFileId, onSelect, onUploadClick }: any) => {
  const getFileIcon = (type: string) => {
    switch (type) {
      case 'xlsx':
        return <FileSpreadsheet className="w-4 h-4 text-green-600" />;
      case 'hwp':
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
          className="w-full py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm text-sm font-medium flex items-center justify-center gap-2"
          type="button"
        >
          <UploadCloud className="w-4 h-4" />
          Upload Files
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
      const appFile = { id: makeId('file'), name: 'target_document.hwp', size: 'Unknown', type: 'hwp', date: 'Now' };
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

  const handleFileChosen = (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const picked = Array.from(event.target.files ?? []);
      if (!picked.length || !activeSessionId) return;

      const mapped: WorkspaceFile[] = picked.map((file) => {
        const ext = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() : 'other';
        const sizeMb = file.size / (1024 * 1024);
        const size = sizeMb >= 1 ? `${sizeMb.toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`;
        return {
          id: makeId('file'),
          name: file.name,
          size,
          type: ext || 'other',
          date: 'Just now',
        };
      });

      updateActiveSession((session) => ({
        ...session,
        files: [...session.files, ...mapped],
        activeFileId: mapped[0]?.id ?? session.activeFileId,
        preview: `파일 ${mapped[0]?.name ?? ''} 업로드 완료`,
        messages: [...session.messages, { id: makeId('msg'), sender: 'ai', text: `파일(${mapped[0]?.name})이 업로드되었습니다. 문서 구조 분석을 완료했습니다.`, timestamp: 'Now' }],
      }));
      event.target.value = '';
    } catch (error) {
      logUiError('file.upload', error);
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
              <div className="flex-1 bg-slate-100 p-8 overflow-y-auto flex justify-center animate-in fade-in duration-300">
                <div className="w-full max-w-4xl bg-white shadow-xl min-h-[1000px] relative transition-all">
                  <div className="h-9 bg-slate-200 flex items-center px-4 gap-2 border-b border-slate-300">
                    <div className="flex gap-2 mr-4">
                      <div className="w-3 h-3 rounded-full bg-red-400" />
                      <div className="w-3 h-3 rounded-full bg-yellow-400" />
                      <div className="w-3 h-3 rounded-full bg-green-400" />
                    </div>
                    <div className="h-4 w-px bg-slate-400 mx-2" />
                    <span className="text-xs text-slate-600 font-mono font-medium flex-1 text-center">{activeFile ? activeFile.name : 'No file selected'}</span>
                    <div className="text-[10px] text-slate-500">100%</div>
                  </div>

                  <div className="p-16 font-serif text-slate-800 space-y-8">
                    <h1 className="text-4xl font-bold text-center mb-12">주간 업무 보고서</h1>

                    <div className="flex justify-between text-base mb-12 text-slate-600 border-b border-slate-800 pb-2">
                      <span>작성자: {hostUserName}</span>
                      <span>날짜: {new Date().toLocaleDateString('ko-KR')}</span>
                    </div>

                    <div className="space-y-4">
                      <h2 className="text-xl font-bold border-l-4 border-slate-800 pl-3 mb-6">1. 금주 주요 업무 실적</h2>
                      <p className="text-base leading-8 text-justify">
                        본 보고서는 금주 진행된 주요 프로젝트의 진행 상황과 차주 계획을 기술한다. 특히 AI 에이전트 도입을 위한 <span className={diffMode ? 'bg-green-100 text-green-800 px-1 rounded font-bold' : ''}>기반 환경 구축</span>이 완료되었다.
                      </p>
                    </div>

                    <div className="mt-12">
                      <h3 className="text-lg font-bold mb-4">2. 세부 진행 현황</h3>
                      <div className={`border-2 ${diffMode ? 'border-blue-600 relative ring-4 ring-blue-50 rounded-lg' : 'border-slate-800'}`}>
                        {diffMode && (
                          <div className="absolute -top-3 -right-3 bg-blue-600 text-white text-[10px] px-3 py-1 rounded-full shadow-lg z-10 font-bold flex items-center gap-1">
                            <Sparkles className="w-3 h-3" />
                            Modified by AI
                          </div>
                        )}
                        <table className="w-full text-base text-center">
                          <thead className="bg-slate-100 font-bold border-b-2 border-slate-800">
                            <tr>
                              <td className="p-3 border-r border-slate-300 w-1/4">구분</td>
                              <td className="p-3 border-r border-slate-300 w-1/2">내용</td>
                              <td className="p-3">비고</td>
                            </tr>
                          </thead>
                          <tbody>
                            <tr className="border-b border-slate-200 hover:bg-slate-50">
                              <td className="p-3 border-r border-slate-200 font-medium">Frontend</td>
                              <td className="p-3 border-r border-slate-200 text-left pl-6">UI 컴포넌트 개발 및 최적화</td>
                              <td className="p-3 text-slate-500">완료</td>
                            </tr>
                            <tr className="hover:bg-slate-50">
                              <td className="p-3 border-r border-slate-200 font-medium">Backend</td>
                              <td className="p-3 border-r border-slate-200 text-left pl-6">{diffMode ? <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded">API 연동 테스트 (Pass)</span> : 'API 개발'}</td>
                              <td className="p-3 text-slate-500">진행중</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      {diffMode && (
                        <div className="mt-3 text-sm text-blue-600 flex items-center gap-2 bg-blue-50 p-3 rounded-lg border border-blue-100">
                          <CheckCircle className="w-4 h-4" />
                          <span>테두리 스타일이 '투명선 제거' 및 '외곽선 굵게'로 변경되었습니다.</span>
                        </div>
                      )}
                    </div>
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
