// Version 9.0d - 智慧代課系統：逐格人工修改雲端保存與連續輸入修正版
import React, { useState, useEffect, useRef } from 'react';
import { Users, Calendar, BarChart3, Clock, Plus, Trash2, UserCheck, Search, X, AlertCircle, CheckCircle, Upload, Download, FileText, Star, Cloud, CloudOff, Loader2, Save, RefreshCw, Image as ImageIcon, ArrowLeft, ArrowRight, ChevronsLeft, ChevronsRight, ClipboardEdit, Sparkles, Lock, Unlock, CheckCheck } from 'lucide-react';
import { doc, getDoc, setDoc } from "firebase/firestore";

// --- 常數設定 ---
const TOTAL_PERIODS = 9;
const PERIODS = Array.from({ length: TOTAL_PERIODS }, (_, i) => i + 1);
const CORE1_SUBJECTS = ['中文', '英文', '數學', 'CHI', 'ENG', 'MATH', 'CHINESE', 'ENGLISH', 'MATHEMATICS'];
const CORE2_SUBJECTS = ['人文', '科學', '常識', 'HUMANITIES', 'SCIENCE', 'GENERAL STUDIES', 'GS'];
const ABSENT_REASONS = ['病假', '事假', '進修', '覆診', '遲返', '早退', '交流', '帶隊', '補回空堂'];
const SWAPPABLE_SUBJECTS = ['體驗', 'Me Time', '藝創', '3S']; 

const STORAGE_KEY_TEACHERS = 'substitution_system_teachers_data_v3';
const STORAGE_KEY_LOGS = 'substitution_system_logs_data_v3';
const STORAGE_KEY_DUTIES = 'substitution_system_duties_data_v1';
const STORAGE_KEY_MANUAL_PREFIX = 'substitution_system_manual_html_v9_';
const STORAGE_KEY_MANUAL_OVERRIDES_PREFIX = 'substitution_system_manual_overrides_v9_2_';
const STORAGE_KEY_MANUAL_OVERRIDES_LEGACY_PREFIX = 'substitution_system_manual_overrides_v9_1_';

const getInitialDate = () => {
  const d = new Date();
  const day = d.getDay();
  if (day === 6) d.setDate(d.getDate() + 2);
  else if (day === 0) d.setDate(d.getDate() + 1);
  return new Date(d - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
};

const EXTRA_DUTY_ROWS = [
    { id: 'duty_pre_1', time: '7:45-8:20', label: '-' },
    { id: 'duty_pre_2', time: '7:55-8:15/8:20', label: '帶班' },
    { id: 'duty_pre_3', time: '8:20-8:35', label: '早會' },
    { id: 'duty_recess_1', time: '9:45-10:00', label: 'R1' },
    { id: 'duty_recess_2', time: '11:10-11:25', label: 'R2' },
    { id: 'duty_lunch_1', time: '12:35-1:05', label: '午1' },
    { id: 'duty_lunch_2', time: '1:05-1:35', label: '午2' },
    { id: 'duty_post_1', time: '3:25', label: '3:25' },
];

export default function SubstitutionApp() {
  const [teachers, setTeachers] = useState([]);
  const [logs, setLogs] = useState([]); 
  const [duties, setDuties] = useState({});
  const [isCloudEnabled, setIsCloudEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [lastSaved, setLastSaved] = useState(null);
  const [saveStatus, setSaveStatus] = useState('idle');
  const dbRef = useRef(null);

  const [currentView, setCurrentView] = useState('arrange'); 
  const [formDate, setFormDate] = useState(getInitialDate());
  
  const [manualHtml, setManualHtml] = useState('');
  const manualEditorRef = useRef(null);
  const manualSaveTimerRef = useRef(null);
  const [manualCloudStatus, setManualCloudStatus] = useState('idle');
  const [manualLastSaved, setManualLastSaved] = useState(null);
  const manualDirtyRef = useRef(false);
  // V9.0a：逐格人工修改層。人工修改優先於系統重新生成的日誌。
  const [manualOverrides, setManualOverrides] = useState({});
  const manualOverridesRef = useRef({});

  const [newAbsentId, setNewAbsentId] = useState('');
  const [newAbsentReason, setNewAbsentReason] = useState('病假');
  const [activeCell, setActiveCell] = useState(null); 
  
  const [statsMonth, setStatsMonth] = useState(new Date().toISOString().slice(0, 7));
  const [newTitle, setNewTitle] = useState(''); 
  const [newName, setNewName] = useState(''); 
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const [editableAbsentCounts, setEditableAbsentCounts] = useState({});
  const [confirmState, setConfirmState] = useState({});
  const [smartState, setSmartState] = useState({isOpen:false, mode:'priority', selectedLogIds:[], suggestions:[], generated:false});
  const [smartPrompted, setSmartPrompted] = useState({});
  const [optimizationVersion, setOptimizationVersion] = useState(0);

  const teacherImportRef = useRef(null);
  const timetableImportRef = useRef(null);
  const backupImportRef = useRef(null);
  const sortImportRef = useRef(null);

  const [modal, setModal] = useState({ isOpen: false, type: 'info', title: '', message: '', onConfirm: null });
  const [swapModal, setSwapModal] = useState({ isOpen: false, logId: null, subTeacher: null, options: [], selectedOption: null });
  const [replaceModal, setReplaceModal] = useState({ isOpen: false, originalTeacher: null, freeTeachers: [], selectedTeacherId: '' });
  const [assignModal, setAssignModal] = useState({ isOpen: false, teacher: null, assignType: 'extra' });
  const [absentColOrder, setAbsentColOrder] = useState([]);

  const mapFreePeriodsForDate = (list, dateString) => {
    if (!Array.isArray(list)) return [];
    const dayOfWeek = new Date(dateString).getDay();
    return list.map(t => {
       if (!t) return null;
       const busy = t.masterSchedule?.[dayOfWeek] || [];
       const free = (dayOfWeek >= 1 && dayOfWeek <= 5) ? PERIODS.filter(p => !busy.includes(p)) : [];
       return { ...t, freePeriods: free };
    }).filter(Boolean);
  };

  useEffect(() => {
    const initData = async () => {
      setIsLoading(true);
      let loadedFromCloud = false;
      try {
        const fb = await import('./firebaseConfig');
        if (fb && fb.db) dbRef.current = fb.db;
      } catch (e) { console.log("提示: 本機模式 (無 Firebase 設定)"); }

      if (dbRef.current) {
        try {
          const docSnap = await getDoc(doc(dbRef.current, "school_data", "main_backup_v3"));
          if (docSnap.exists()) {
            const data = docSnap.data();
            const rawTeachers = Array.isArray(data.teachers) ? data.teachers : [];
            setTeachers(mapFreePeriodsForDate(rawTeachers, formDate));
            setLogs(Array.isArray(data.logs) ? data.logs : []);
            const dutiesData = data.duties || {};
            setDuties(dutiesData);
            setLastSaved(data.lastUpdated ? new Date(data.lastUpdated) : new Date());
            loadedFromCloud = true;
            setIsCloudEnabled(true); 
          } else setIsCloudEnabled(true); 
        } catch (error) { setIsCloudEnabled(false); }
      }

      if (!loadedFromCloud) {
        let localTeachers = localStorage.getItem(STORAGE_KEY_TEACHERS);
        let localLogs = localStorage.getItem(STORAGE_KEY_LOGS);
        let localDuties = localStorage.getItem(STORAGE_KEY_DUTIES);
        if (localTeachers) {
          try { 
            const parsed = JSON.parse(localTeachers) || []; 
            setTeachers(mapFreePeriodsForDate(parsed, formDate));
          } catch(e) { setTeachers([]); }
        } else {
          setTeachers([{ id: 1, title: "", name: "陳大文", freePeriods: [], masterSchedule: {}, scheduleDetails: {}, sortOrder: 9999 }]);
        }
        if (localLogs) {
          try { setLogs(JSON.parse(localLogs) || []); } catch(e) { setLogs([]); }
        }
        const dutiesData = localDuties ? (JSON.parse(localDuties) || {}) : {};
        setDuties(dutiesData);
      }
      setIsLoading(false);
    };
    initData();
  }, []);

  useEffect(() => {
    setTeachers(prev => mapFreePeriodsForDate(prev, formDate));
    setAbsentColOrder([]);
    setEditableAbsentCounts({});
    setActiveCell(null);
    setConfirmState({});
  }, [formDate]);

  // V9.0d：每個表格方格使用「列ID__缺席老師ID」作為穩定鍵，避免新增缺席老師後舊資料消失。
  const getManualCellKey = (rowId, absentId) => `${String(rowId)}__${String(absentId)}`;

  const getManualOverrideValue = (rowId, absentId) => {
    const key = getManualCellKey(rowId, absentId);
    return Object.prototype.hasOwnProperty.call(manualOverrides || {}, key)
      ? manualOverrides[key]?.value ?? ''
      : null;
  };

  const loadManualOverrides = async (dateKey) => {
    let loaded = null;
    try {
      if (dbRef.current && isCloudEnabled) {
        const snap = await getDoc(doc(dbRef.current, 'manual_overrides', dateKey));
        if (snap.exists()) loaded = snap.data()?.cells || {};
      }
    } catch (e) {
      console.warn('逐格人工修改雲端讀取失敗', e);
    }
    if (!loaded) {
      try {
        const local = localStorage.getItem(STORAGE_KEY_MANUAL_OVERRIDES_PREFIX + dateKey) || localStorage.getItem(STORAGE_KEY_MANUAL_OVERRIDES_LEGACY_PREFIX + dateKey);
        loaded = local ? (JSON.parse(local) || {}) : {};
      } catch (e) { loaded = {}; }
    }
    manualOverridesRef.current = loaded || {};
    setManualOverrides(loaded || {});
    return loaded || {};
  };

  const saveManualOverrides = async (cells, showMessage = false) => {
    const safeCells = cells || {};
    localStorage.setItem(STORAGE_KEY_MANUAL_OVERRIDES_PREFIX + formDate, JSON.stringify(safeCells));
    manualOverridesRef.current = safeCells;
    setManualOverrides(safeCells);
    if (!dbRef.current || !isCloudEnabled) {
      if (showMessage) showAlert('提示', '目前未連接 Firebase，逐格修改已先保存在本機。');
      return;
    }
    try {
      const now = new Date();
      await setDoc(doc(dbRef.current, 'manual_overrides', formDate), {
        date: formDate,
        cells: safeCells,
        updatedAt: now.toISOString(),
        version: 92
      }, { merge: true });
      if (showMessage) showAlert('成功', `${formDate} 的逐格人工修改已同步到雲端。`);
    } catch (e) {
      console.error('逐格人工修改雲端儲存失敗', e);
      if (showMessage) showAlert('錯誤', '逐格人工修改雲端儲存失敗，內容仍保留在本機。');
    }
  };

  const recordManualCellEdit = (cellEl) => {
    if (!cellEl) return;
    const key = cellEl.getAttribute('data-manual-key');
    if (!key) return;
    const value = cellEl.innerHTML;
    const original = cellEl.getAttribute('data-system-html') || '';
    const next = { ...(manualOverridesRef.current || {}) };
    if (value === original) delete next[key];
    else next[key] = { value, original, updatedAt: new Date().toISOString(), source: 'manual' };
    // V9.0d：輸入期間只更新 ref + 本機暫存，絕不 setState、絕不自動寫 Firebase。
    // 這樣 contentEditable 的游標與輸入內容不會因 React / Firebase 更新而被重設。
    manualOverridesRef.current = next;
    manualDirtyRef.current = true;
    localStorage.setItem(STORAGE_KEY_MANUAL_OVERRIDES_PREFIX + formDate, JSON.stringify(next));
  };

  const applyManualOverridesToHtml = (html, overrides = manualOverrides) => {
    if (!html || !overrides || Object.keys(overrides).length === 0) return html;
    try {
      const parser = new DOMParser();
      const docHtml = parser.parseFromString(html, 'text/html');
      Object.entries(overrides).forEach(([key, item]) => {
        const target = docHtml.querySelector(`[data-manual-key="${CSS.escape(key)}"]`);
        if (target && item && typeof item.value === 'string') target.innerHTML = item.value;
      });
      return docHtml.documentElement.outerHTML;
    } catch (e) {
      console.warn('套用逐格人工修改失敗', e);
      return html;
    }
  };

  // V9.0：獨立自由編輯區使用獨立 Firebase 文件，以日期分開儲存。
  // 不寫入 main_backup_v3，因此不會影響正式代課、日誌及統計。
  useEffect(() => {
    let cancelled = false;
    const loadManualCloud = async () => {
      setManualCloudStatus('loading');
      try {
        if (dbRef.current && isCloudEnabled) {
          const snap = await getDoc(doc(dbRef.current, 'manual_editor', formDate));
          if (!cancelled && snap.exists()) {
            const overrides = await loadManualOverrides(formDate);
            const baseHtml = generateHtmlForReport();
            const mergedHtml = applyManualOverridesToHtml(baseHtml, overrides);
            setManualHtml(mergedHtml);
            setManualLastSaved(snap.data()?.updatedAt ? new Date(snap.data().updatedAt) : null);
            setManualCloudStatus('saved');
            return;
          }
        }
      } catch (e) {
        console.warn('自由編輯區雲端讀取失敗', e);
      }

      // 沒有雲端內容時保留本機日期備份，避免切換日期後內容消失。
      const local = localStorage.getItem(STORAGE_KEY_MANUAL_PREFIX + formDate);
      const overrides = await loadManualOverrides(formDate);
      if (!cancelled) {
        const baseHtml = generateHtmlForReport();
        const mergedHtml = applyManualOverridesToHtml(baseHtml, overrides);
        setManualHtml(mergedHtml || local || '');
        setManualCloudStatus((mergedHtml || local) ? 'local' : 'idle');
        setManualLastSaved(null);
      }
    };
    if (!isLoading) loadManualCloud();
    return () => { cancelled = true; };
  }, [formDate, isCloudEnabled, isLoading]);

  // V9.0d：正式資料（例如突然新增缺席老師）變動後，重新建立手動頁，
  // 但一定先套回已保存的逐格人工修改，因此不會因重新生成而清空人工內容。
  useEffect(() => {
    if (isLoading) return;
    if (!manualEditorRef.current && !manualHtml) return;

    // V9.0d：正式資料變動時才重新建立手動頁；如果使用者目前正在打字，
    // 絕對不能重寫 innerHTML，否則會把剛輸入的文字及游標位置覆蓋掉。
    const editor = manualEditorRef.current;
    const isEditing = !!(editor && document.activeElement && editor.contains(document.activeElement));
    if (isEditing) return;
    // 有尚未按「儲存到雲端」的手動修改時，正式資料變動也不能覆蓋目前手動頁。
    if (manualDirtyRef.current) return;

    const baseHtml = generateHtmlForReport();
    const mergedHtml = applyManualOverridesToHtml(baseHtml, manualOverridesRef.current || manualOverrides);
    if (!mergedHtml) return;

    setManualHtml(mergedHtml);
    localStorage.setItem(STORAGE_KEY_MANUAL_PREFIX + formDate, mergedHtml);
    if (editor) editor.innerHTML = mergedHtml;
  }, [logs, duties, absentColOrder, formDate]);

  const getManualEditorHtml = () => {
    const container = manualEditorRef.current;
    return container ? container.innerHTML : manualHtml;
  };

  const saveManualHtmlToCloud = async (showMessage = false) => {
    // V9.0d：按鈕才是唯一的雲端儲存入口。
    const html = getManualEditorHtml();
    const cells = { ...(manualOverridesRef.current || {}) };

    // 先保存本機，確保即使 Firebase 失敗也不會遺失剛才的編輯。
    localStorage.setItem(STORAGE_KEY_MANUAL_PREFIX + formDate, html);
    localStorage.setItem(STORAGE_KEY_MANUAL_OVERRIDES_PREFIX + formDate, JSON.stringify(cells));

    if (!dbRef.current || !isCloudEnabled) {
      setManualHtml(html);
      setManualCloudStatus('local');
      manualDirtyRef.current = false;
      if (showMessage) showAlert('提示', '目前未連接 Firebase，內容已先保存在本機。');
      return;
    }

    setManualCloudStatus('saving');
    try {
      const now = new Date();
      await setDoc(doc(dbRef.current, 'manual_editor', formDate), {
        date: formDate,
        html,
        updatedAt: now.toISOString(),
        version: '9.0d'
      }, { merge: true });

      await setDoc(doc(dbRef.current, 'manual_overrides', formDate), {
        date: formDate,
        cells,
        updatedAt: now.toISOString(),
        version: 94
      }, { merge: true });

      setManualHtml(html);
      setManualOverrides(cells);
      manualOverridesRef.current = cells;
      manualDirtyRef.current = false;
      setManualLastSaved(now);
      setManualCloudStatus('saved');
      if (showMessage) showAlert('成功', `自由編輯區 ${formDate} 已儲存到雲端。`);
    } catch (e) {
      console.error('自由編輯區雲端儲存失敗', e);
      setManualCloudStatus('error');
      if (showMessage) showAlert('錯誤', '自由編輯區雲端儲存失敗，內容仍保留在本機；請稍後再按「儲存到雲端」。');
    }
  };

  const handleManualEditorInput = (e) => {
    let cell = null;
    if (e?.target?.closest) cell = e.target.closest('[data-manual-key]');
    if (!cell && e?.nativeEvent?.target?.closest) cell = e.nativeEvent.target.closest('[data-manual-key]');
    if (!cell) {
      const sel = window.getSelection?.();
      const node = sel?.anchorNode;
      const el = node?.nodeType === 1 ? node : node?.parentElement;
      cell = el?.closest?.('[data-manual-key]') || null;
    }
    if (cell) recordManualCellEdit(cell);

    // V9.0d：輸入時只做本機暫存，不寫 React state、不寫 Firebase。
    // 手動頁的完整 HTML 也同步存本機，避免切頁/重載時遺失尚未按雲端儲存的內容。
    const html = getManualEditorHtml();
    localStorage.setItem(STORAGE_KEY_MANUAL_PREFIX + formDate, html);
    manualDirtyRef.current = true;
  };

  const handleManualEditorBlur = (e) => {
    const target = e?.target;
    const cell = target?.closest?.('[data-manual-key]') || (target?.getAttribute?.('data-manual-key') ? target : null);
    if (cell) recordManualCellEdit(cell);

    // V9.0d：失去焦點也不把 DOM 寫回 React state；只有按「儲存到雲端」才正式提交。
    const html = getManualEditorHtml();
    if (html) localStorage.setItem(STORAGE_KEY_MANUAL_PREFIX + formDate, html);
    if (manualDirtyRef.current) setManualCloudStatus('pending');
  };

  const renderReportView = () => {
    return (
        <div className="bg-white p-6 rounded-2xl shadow-xl border border-purple-100 animate-in fade-in zoom-in duration-300 h-full flex flex-col" >
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-purple-800 flex items-center"><Clock className="mr-2"/> 每日代課日誌 (預覽)</h2>
                <div className="flex items-center gap-3">
                  <button onClick={() => downloadImage('report-page-capture-inner', `代課日誌_${formDate}.png`)} className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg shadow text-sm hover:bg-emerald-700 flex items-center font-normal"><ImageIcon size={14} className="mr-1"/> 下載圖片</button>
                  <button onClick={downloadHtmlReport} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg shadow text-sm hover:bg-blue-700 flex items-center font-normal"><Download size={14} className="mr-1"/> 下載 HTML</button>
                </div>
            </div>
            <div id="report-page-capture-inner" className="flex-1 border rounded-lg p-4 overflow-auto bg-white">
                <div dangerouslySetInnerHTML={{ __html: generateHtmlForReport() }} />
            </div>
        </div>
    );
  };
  

  // 手動頁面的 HTML 下載函式
  const downloadManualHtmlReport = () => {
    const container = document.getElementById('manual-page-capture-inner');
    const innerContent = container ? container.innerHTML : '';
    
    const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>代課安排 (手動修改版)</title><style>.s1{font-size:16pt;font-family:sans-serif;}.s2{font-size:12pt;font-family:sans-serif;}.s3{font-size:12pt;font-family:sans-serif;}.s5{font-size:14pt;font-family:sans-serif;} table{border-collapse:collapse;} td{padding:4pt; text-align:center;}</style></head><body>${innerContent}</body></html>`;
    
    const blob = new Blob([fullHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `代課日誌_手動修改_${formDate}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 載入/重置最新日誌資料
  const handleResetManualHtml = async () => {
    const overrides = await loadManualOverrides(formDate);
    const html = applyManualOverridesToHtml(generateHtmlForReport(), overrides);
    setManualHtml(html);
    localStorage.setItem(STORAGE_KEY_MANUAL_PREFIX + formDate, html);
    if (manualEditorRef.current) manualEditorRef.current.innerHTML = html;
    await saveManualHtmlToCloud(false);
    showAlert('提示', '已重新載入最新日誌資料；所有已保存的人工逐格修改已重新套用。');
  };

  // 渲染「手動」頁面
  const renderManualView = () => {
    return (
        <div className="bg-white p-6 rounded-2xl shadow-xl border border-purple-100 animate-in fade-in zoom-in duration-300 h-full flex flex-col">
            <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-purple-800 flex items-center"><FileText className="mr-2"/> 手動代課日誌</h2>
                  <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded border border-blue-200">獨立自由編輯區 · 雲端額外儲存 · 逐格人工鎖定 V9.0d</span>
                  <span className="text-xs text-gray-500">{manualCloudStatus === 'saving' ? '☁️ 儲存中...' : manualCloudStatus === 'pending' ? '⚠️ 尚有未同步修改' : manualCloudStatus === 'saved' ? `☁️ 已同步${manualLastSaved ? ` ${manualLastSaved.toLocaleTimeString()}` : ''}` : manualCloudStatus === 'error' ? '❌ 雲端儲存失敗（已保留本機）' : manualCloudStatus === 'local' ? '💾 本機暫存' : ''}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={handleResetManualHtml} className="bg-gray-100 text-gray-700 hover:bg-gray-200 px-3 py-1.5 rounded-lg shadow-sm text-sm flex items-center border border-gray-300 font-normal"><RefreshCw size={14} className="mr-1"/> 載入/重置日誌</button>
                  <button onClick={() => saveManualHtmlToCloud(true)} className="bg-purple-600 text-white hover:bg-purple-700 px-3 py-1.5 rounded-lg shadow-sm text-sm flex items-center font-normal"><Cloud size={14} className="mr-1"/> 儲存到雲端</button>
                  <button onClick={() => downloadImage('manual-page-capture-inner', `代課日誌_手動修改_${formDate}.png`)} className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg shadow text-sm hover:bg-emerald-700 flex items-center font-normal"><ImageIcon size={14} className="mr-1"/> 下載圖片</button>
                  <button onClick={downloadManualHtmlReport} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg shadow text-sm hover:bg-blue-700 flex items-center font-normal"><Download size={14} className="mr-1"/> 下載 HTML</button>
                </div>
            </div>
            <p className="text-xs text-gray-500 mb-2">💡 提示：你可以直接點擊下方表格內任何文字自由增刪修改。內容會依日期獨立儲存在 Firebase；表格每一格的人工修改會另外保存為逐格覆寫資料。日後新增請假、重新載入或智慧重排時，已確認的人工修改會優先保留；輸入後不會自動寫入雲端；請完成編輯後按「儲存到雲端」。</p>
            <div id="manual-page-capture-inner" ref={manualEditorRef} onInput={handleManualEditorInput} onBlur={handleManualEditorBlur} className="flex-1 border-2 border-dashed border-purple-200 rounded-lg p-4 overflow-auto bg-white focus:outline-none focus:border-purple-500" dangerouslySetInnerHTML={{ __html: manualHtml || generateHtmlForReport() }} />
        </div>
    );
  };


  if (isLoading) return (<div className="min-h-screen bg-fuchsia-50 flex flex-col items-center justify-center"><Loader2 className="w-12 h-12 text-purple-600 animate-spin mb-4" /><h2 className="text-xl font-bold text-purple-800">正在同步資料...</h2></div>);

  return (
    <div className="h-screen bg-fuchsia-50 font-sans text-gray-800 selection:bg-fuchsia-200 overflow-hidden flex flex-col">
      {renderSmartModal()}
       {renderModal()}
      {renderSwapModal()}
      {renderReplaceModal()}
      {renderAssignModal()} 
      <nav className="bg-gradient-to-r from-purple-700 via-fuchsia-600 to-pink-600 text-white shadow-lg z-40 shrink-0">
        <div className="max-w-[1850px] mx-auto px-4 py-2 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
               <div className="font-bold text-xl flex items-center tracking-wide mr-3"><Calendar className="mr-2"/> 智慧代課系統 9.0d</div>
               {isCloudEnabled ? 
                 <div className="flex items-center space-x-2 cursor-pointer" onClick={() => alert("目前連線狀態正常。")}><span className="text-[10px] bg-green-500/20 text-white px-2 py-0.5 rounded-full flex items-center border border-green-200/30"><Cloud size={10} className="mr-1"/> 雲端同步</span>{saveStatus === 'saving' && <span className="text-[10px] text-white/70 flex items-center"><Loader2 size={10} className="mr-1 animate-spin"/>儲存中...</span>}{saveStatus === 'error' && <span className="text-[10px] text-red-200 flex items-center bg-red-500/20 px-1 rounded"><AlertCircle size={10} className="mr-1"/>儲存失敗</span>}</div>
                 : <span className="text-[10px] bg-white/10 text-white/70 px-2 py-0.5 rounded-full flex items-center border border-white/10" onClick={() => alert("目前為本機模式。")}><CloudOff size={10} className="mr-1"/> 本機模式</span>
               }
            </div>
            <div className="flex space-x-1">
              {[{id:'arrange',label:'安排',icon:Search}, {id:'smart',label:'智慧代課',icon:Sparkles}, {id:'advanced',label:'進階',icon:ClipboardEdit}, {id:'report',label:'日誌',icon:Clock}, {id:'manual',label:'手動',icon:FileText}, {id:'stats',label:'統計',icon:BarChart3}, {id:'teachers',label:'設定',icon:Users}].map(t=>(
                <button key={t.id} onClick={()=> setCurrentView(t.id)} className={`px-3 py-1.5 rounded-lg flex items-center text-sm transition-all duration-200 ${currentView===t.id?'bg-white/20 shadow-inner font-bold':'hover:bg-white/10 text-purple-100'}`}><t.icon size={14} className="mr-1.5"/>{t.label}</button>
              ))}
            </div>
          </div>
          
          <div className="flex items-center bg-white/10 p-2 rounded-lg gap-2 backdrop-blur-sm border border-white/20 overflow-x-auto">
            <div className="flex items-center gap-2 shrink-0">
              <label className="text-xs font-bold text-fuchsia-100">日期</label>
              <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} className="bg-white text-gray-800 border-none p-1 rounded outline-none text-sm w-36" />
            </div>
            <div className="w-px h-6 bg-white/20 shrink-0"></div>
            <form onSubmit={(e) => { e.preventDefault(); handleAddAbsent(); }} className="flex items-center gap-2 shrink-0">
              <label className="text-xs font-bold text-fuchsia-100">新增缺席老師</label>
              <select value={newAbsentId} onChange={e=> setNewAbsentId(e.target.value)} className="bg-white text-gray-800 border-none p-1 rounded text-sm w-32 outline-none">
                <option value="">請選擇...</option>
                {getSortedTeachers(teachers).map(t => <option key={t.id} value={t.id}>{t.title ? `[${t.title}] ` : ''}{t.name}</option>)}
              </select>
              <label className="text-xs font-bold text-fuchsia-100">原因</label>
              <select value={newAbsentReason} onChange={e=> setNewAbsentReason(e.target.value)} className="bg-white text-gray-800 border-none p-1 rounded text-sm w-24 outline-none">
                {ABSENT_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <button type="submit" className="bg-white text-purple-700 px-3 py-1 rounded shadow-sm hover:bg-purple-50 text-sm flex items-center font-bold ml-2 shrink-0"><Plus size={14} className="mr-1"/> 加入</button>
            </form>
            {currentView === 'arrange' && (
               <button onClick={() => downloadImage('arrange-table-capture', `代課安排_${formDate}.png`)} className="ml-auto bg-fuchsia-800/50 text-white border border-fuchsia-300/30 px-3 py-1 rounded shadow-sm hover:bg-fuchsia-800 text-sm flex items-center transition-colors shrink-0"><ImageIcon size={14} className="mr-1"/> 下載圖片</button>
            )}
          </div>
        </div>
      </nav>
      <main className="max-w-[1850px] mx-auto w-full p-4 flex-1 overflow-hidden">
        {currentView==='arrange' && renderArrangeView()}
         {currentView==='smart' && <div className="bg-white p-6 rounded-2xl shadow-xl h-full overflow-auto"><h2 className="text-xl font-bold text-purple-800 mb-4 flex items-center"><Sparkles className="mr-2"/>智慧代課 V9.0</h2><p className="text-sm text-gray-600 mb-4">今日缺席老師達 3 人時系統會主動提示；亦可隨時手動開啟智慧規劃。</p><button onClick={openSmartScheduler} className="px-4 py-2 bg-purple-600 text-white rounded-lg">開始智慧規劃</button></div>}
        {currentView==='teachers' && renderTeachersView()}
        {currentView==='stats' && renderStatsView()}
        {currentView === 'advanced' && renderAdvancedView()}
        {currentView==='report' && renderReportView()}
        {currentView==='manual' && renderManualView()}
      </main>
    </div>
  );
}