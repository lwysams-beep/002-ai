import React, { useState, useEffect, useRef } from 'react';
import { Users, Calendar, BarChart3, Clock, Plus, Trash2, UserCheck, Search, X, AlertCircle, CheckCircle, Upload, Download, FileText, Star, ArrowRight, Heart, Save, RefreshCw, BookOpen, Cloud, CloudOff, Loader2, GripHorizontal, FileWarning } from 'lucide-react';
// 注意：即使沒有設定 firebaseConfig.js，保留這行 import 通常不會報錯
import { doc, getDoc, setDoc } from "firebase/firestore";

// --- 常數設定 ---
const TOTAL_PERIODS = 9;
const PERIODS = Array.from({ length: TOTAL_PERIODS }, (_, i) => i + 1);
const CORE_SUBJECTS = ['中文', '英文', '數學', 'CHI', 'ENG', 'MATH', 'CHINESE', 'ENGLISH', 'MATHEMATICS'];
const STORAGE_KEY_TEACHERS = 'substitution_system_teachers_data_v3';
const STORAGE_KEY_LOGS = 'substitution_system_logs_data_v3';
const STORAGE_KEY_TIMESTAMP = 'substitution_system_last_updated_v3';

export default function SubstitutionApp() {
  // --- 狀態管理 ---
  const [teachers, setTeachers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [isCloudEnabled, setIsCloudEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [lastSaved, setLastSaved] = useState(null);
  const [saveStatus, setSaveStatus] = useState('idle');

  const [draggedLogId, setDraggedLogId] = useState(null);
  const [dragOverLogId, setDragOverLogId] = useState(null); 
  const dbRef = useRef(null);

  // 介面狀態
  const [currentView, setCurrentView] = useState('arrange'); 
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [absentTeacherId, setAbsentTeacherId] = useState('');
  const [className, setClassName] = useState('');
  const [newName, setNewName] = useState(''); 

  const teacherImportRef = useRef(null);
  const timetableImportRef = useRef(null);
  const backupImportRef = useRef(null);

  const [modal, setModal] = useState({ isOpen: false, type: 'info', title: '', message: '', onConfirm: null });

  // --- 初始化 ---
  useEffect(() => {
    const initData = async () => {
      setIsLoading(true);
      let loadedFromCloud = false;

      try {
        const fb = await import('./firebaseConfig');
        if (fb && fb.db) {
          dbRef.current = fb.db;
        }
      } catch (e) {
        console.log("提示: 本機模式 (無 Firebase 設定)");
      }

      if (dbRef.current) {
        try {
          const docRef = doc(dbRef.current, "school_data", "main_backup_v3");
          const docSnap = await getDoc(docRef);
          
          if (docSnap.exists()) {
            const data = docSnap.data();
            setTeachers(data.teachers || []);
            setLogs(data.logs || []);
            const updatedTime = data.lastUpdated ? new Date(data.lastUpdated) : new Date();
            setLastSaved(updatedTime);
            loadedFromCloud = true;
            setIsCloudEnabled(true); 
          } else {
            setIsCloudEnabled(true); 
          }
        } catch (error) {
          console.error("雲端讀取失敗:", error);
          setIsCloudEnabled(false);
        }
      }

      if (!loadedFromCloud) {
        let localTeachers = localStorage.getItem(STORAGE_KEY_TEACHERS);
        let localLogs = localStorage.getItem(STORAGE_KEY_LOGS);
        
        if (!localTeachers) {
             localTeachers = localStorage.getItem('substitution_system_teachers_data_v2');
             localLogs = localStorage.getItem('substitution_system_logs_data_v2');
        }

        if (localTeachers) {
          try {
            setTeachers(JSON.parse(localTeachers));
          } catch (e) { console.error("LS Error", e); }
        } else {
          setTeachers([
            { id: 1, name: "陳大文", freePeriods: [], absences: 0, substitutions: 0, masterSchedule: {}, scheduleDetails: {} },
            { id: 2, name: "李小美", freePeriods: [], absences: 0, substitutions: 0, masterSchedule: {}, scheduleDetails: {} }
          ]);
        }
        
        if (localLogs) {
          try {
            setLogs(JSON.parse(localLogs));
          } catch (e) { console.error("LS Log Error", e); }
        }
      }
      setIsLoading(false);
    };

    initData();
  }, []);

  // --- 自動儲存 ---
  useEffect(() => {
    if (isLoading) return;

    localStorage.setItem(STORAGE_KEY_TEACHERS, JSON.stringify(teachers));
    localStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(logs));

    const timer = setTimeout(async () => {
      if (isCloudEnabled && dbRef.current) {
        try {
          await setDoc(doc(dbRef.current, "school_data", "main_backup_v3"), {
            teachers: teachers,
            logs: logs,
            lastUpdated: new Date().toISOString()
          });
          setLastSaved(new Date());
        } catch (e) {
          console.error("Cloud Save Error:", e);
        }
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [teachers, logs, isCloudEnabled, isLoading]);

  // --- 手動上傳 ---
  const handleManualCloudUpload = async () => {
    if (!dbRef.current) {
      alert("❌ 錯誤：尚未偵測到 Firebase 資料庫連線。");
      return;
    }
    const now = new Date();
    setSaveStatus('saving');
    try {
      await setDoc(doc(dbRef.current, "school_data", "main_backup_v3"), {
        teachers: teachers,
        logs: logs,
        lastUpdated: now.toISOString()
      });
      setLastSaved(now);
      setSaveStatus('saved');
      setIsCloudEnabled(true);
      alert("✅ V3.1 資料上傳成功！");
    } catch (e) {
      setSaveStatus('error');
      alert(`❌ 上傳失敗: ${e.message}`);
    }
  };

  // --- 日期變更 ---
  useEffect(() => {
    if (!formDate) return;
    const dayOfWeek = new Date(formDate).getDay(); 
    if (dayOfWeek === 0 || dayOfWeek === 6) return;

    setTeachers(prev => prev.map(t => {
      if (t.masterSchedule && t.masterSchedule[dayOfWeek]) {
        const busyPeriods = t.masterSchedule[dayOfWeek];
        const newFreePeriods = PERIODS.filter(p => !busyPeriods.includes(p));
        return { ...t, freePeriods: newFreePeriods };
      }
      return t;
    }));
  }, [formDate]);

  // --- UI Reset ---
  useEffect(() => { setSelectedPeriod(''); setClassName(''); }, [formDate, absentTeacherId]);

  const handlePeriodChange = (e) => {
    const newPeriod = e.target.value;
    setSelectedPeriod(newPeriod);
    if (newPeriod && absentTeacherId && formDate) {
      const p = parseInt(newPeriod);
      const dayOfWeek = new Date(formDate).getDay();
      const teacher = teachers.find(t => t.id == absentTeacherId);
      const detail = teacher?.scheduleDetails?.[`${dayOfWeek}-${p}`];
      if (detail?.className) setClassName(detail.className); else setClassName('');
    }
  };

  // --- Helpers ---
  const getSortedTeachers = (list) => [...list].sort((a, b) => a.name.localeCompare(b.name, "zh-HK"));
  const showAlert = (title, message) => setModal({ isOpen: true, type: 'info', title, message });
  const showConfirm = (title, message, onConfirm) => setModal({ isOpen: true, type: 'confirm', title, message, onConfirm });
  const closeModal = () => setModal({ ...modal, isOpen: false });

  // --- CRUD ---
  const addTeacher = (e) => {
    e.preventDefault();
    if(newName.trim()) {
      setTeachers([...teachers, { id: Date.now(), name: newName, freePeriods: [], absences: 0, substitutions: 0, masterSchedule: {}, scheduleDetails: {} }]);
      setNewName('');
    }
  };

  const deleteTeacher = (id) => {
    showConfirm("刪除確認", "確定要刪除這位老師嗎？", () => setTeachers(teachers.filter(t => t.id !== id)).then(closeModal));
  };

  const toggleFreePeriod = (teacherId, period) => {
    setTeachers(prev => prev.map(t => t.id === teacherId ? { ...t, freePeriods: t.freePeriods.includes(period) ? t.freePeriods.filter(p => p !== period) : [...t.freePeriods, period].sort((a, b) => a - b) } : t));
  };

  const handleSubstitutionClick = (subTeacherId, isExtracting) => {
    if (!absentTeacherId || !selectedPeriod || !className) return showAlert("資料不完整", "請填寫完整資訊 (包含班別)");
    const subT = teachers.find(t => t.id == subTeacherId);
    const absT = teachers.find(t => t.id == absentTeacherId);
    if (!subT || !absT) return showAlert("錯誤", "找不到老師資料");

    // 1. 計算自動備註 (Auto Note)
    let note = '';
    if (isExtracting) {
        const p = parseInt(selectedPeriod);
        const dayOfWeek = new Date(formDate).getDay();
        // 查找該代課老師原本的支援課堂
        const detail = subT?.scheduleDetails?.[`${dayOfWeek}-${p}`];
        if (detail?.className) {
            note = `(${detail.className}不抽離)`;
        } else {
            note = `(支援課堂不抽離)`;
        }
    }

    const msg = (
      <div className="text-left text-sm space-y-1">
        <p><strong>日期:</strong> {formDate} (第 {selectedPeriod} 節)</p>
        <p><strong>班級:</strong> {className}</p>
        <p className="text-red-500"><strong>缺席:</strong> {absT.name}</p>
        <p className="text-purple-600"><strong>代課:</strong> {subT.name}</p>
        {note && <p className="text-orange-600 font-bold text-xs mt-2">ℹ️ 備註：{note}</p>}
        {isExtracting && !note && <p className="text-orange-500 font-bold text-xs mt-2">⚠️ 將從原支援班級抽離</p>}
      </div>
    );

    showConfirm("確認安排", msg, () => {
      // 更新統計
      setTeachers(prev => prev.map(t => {
        if (t.id == absentTeacherId) return { ...t, absences: (t.absences || 0) + 1 };
        if (t.id == subTeacherId) return { ...t, substitutions: (t.substitutions || 0) + 1 };
        return t;
      }));
      
      const newLogs = [{ 
          id: Date.now(), 
          date: formDate, 
          period: parseInt(selectedPeriod), 
          className, 
          absentName: absT.name, 
          absentId: absT.id, 
          subName: subT.name, 
          subId: subT.id, 
          note: note, // 寫入備註
          timestamp: new Date().toLocaleString() 
      }, ...logs];
      setLogs(newLogs);
      
      closeModal();
      
      // Smart Next Logic
      const dayOfWeek = new Date(formDate).getDay();
      const dailySchedule = absT.masterSchedule?.[dayOfWeek] || [];
      const coveredPeriods = newLogs
        .filter(l => l.date === formDate && l.absentId == absentTeacherId)
        .map(l => l.period);
      const remainingPeriods = dailySchedule
        .filter(p => !coveredPeriods.includes(p))
        .sort((a,b) => a-b);
      const nextPeriod = remainingPeriods[0];

      if (nextPeriod) {
        setSelectedPeriod(nextPeriod);
        const detail = absT.scheduleDetails?.[`${dayOfWeek}-${nextPeriod}`];
        setClassName(detail?.className || '');
        setTimeout(() => showAlert("已安排", `已自動跳至 ${absT.name} 的下一節缺課 (第 ${nextPeriod} 節)`), 100);
      } else {
        setClassName(''); setAbsentTeacherId(''); setSelectedPeriod('');
        setTimeout(() => showAlert("成功", "該老師今日課堂已全部安排完成！"), 100);
      }
    });
  };

  const deleteLog = (logId) => {
    const log = logs.find(l => l.id === logId);
    if (!log) return;
    
    showConfirm("確認刪除", "確定刪除此紀錄？\n\n系統將會自動：\n1. 扣減代課老師的「代課數」\n2. 扣減缺席老師的「缺課數」 (還原統計)", () => {
      setTeachers(prev => prev.map(t => {
        let changes = {};
        if ((log.absentId && t.id == log.absentId) || (!log.absentId && t.name === log.absentName)) {
            changes.absences = Math.max(0, (t.absences || 0) - 1);
        }
        if ((log.subId && t.id == log.subId) || (!log.subId && t.name === log.subName)) {
            changes.substitutions = Math.max(0, (t.substitutions || 0) - 1);
        }
        return Object.keys(changes).length > 0 ? { ...t, ...changes } : t;
      }));
      
      setLogs(prev => prev.filter(l => l.id !== logId));
      closeModal();
    });
  };

  // --- Drag and Drop (Fix: Click once to drag) ---
  const handleDragStart = (e, logId) => {
    // 延遲更新 State，確保瀏覽器有時間建立 Drag Snapshot
    setTimeout(() => {
        setDraggedLogId(logId);
    }, 0);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", logId);
  };

  const handleDragEnd = () => {
    setDraggedLogId(null);
    setDragOverLogId(null);
  };

  const handleDragOver = (e, logId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverLogId !== logId) {
        setDragOverLogId(logId);
    }
  };

  const handleDrop = (e, targetLogId) => {
    e.preventDefault();
    setDragOverLogId(null);
    if (!draggedLogId || draggedLogId === targetLogId) return;

    const sourceLog = logs.find(l => l.id === draggedLogId);
    const targetLog = logs.find(l => l.id === targetLogId);

    if (!sourceLog || !targetLog) return;

    const newLogs = logs.map(l => {
      // 僅交換代課老師 (subName, subId) 與 備註 (note)
      // 缺席老師 (absentName)、班級 (className)、節次 (period) 保持不變 (坑不變)
      if (l.id === draggedLogId) {
          return { 
              ...l, 
              subName: targetLog.subName, 
              subId: targetLog.subId,
              note: targetLog.note // 交換備註
          };
      }
      if (l.id === targetLogId) {
          return { 
              ...l, 
              subName: sourceLog.subName, 
              subId: sourceLog.subId,
              note: sourceLog.note // 交換備註
          };
      }
      return l;
    });

    setLogs(newLogs);
    setDraggedLogId(null);
  };

  // --- 核心演算法 (Fix: 防止分身) ---
  const getAvailableTeachers = () => {
    if (!selectedPeriod || !absentTeacherId) return [];
    const p = parseInt(selectedPeriod);
    const dayOfWeek = new Date(formDate).getDay();
    const targetKey = `${dayOfWeek}-${p}`; 
    const normClass = className?.trim().toUpperCase();
    const dailyLogs = logs.filter(l => l.date === formDate);

    return teachers
      .map(t => {
        // 計算今日已代課的節次
        const subbedPeriods = dailyLogs.filter(log => log.subId == t.id).map(log => log.period);
        const actualFreePeriods = (t.freePeriods || []).filter(fp => !subbedPeriods.includes(fp));
        return { ...t, actualFreePeriods, subbedPeriods };
      })
      .filter(t => {
        if (t.id == absentTeacherId) return false; 
        
        // --- 修正分身問題 ---
        if (t.subbedPeriods.includes(p)) return false;

        const isFree = t.actualFreePeriods.includes(p);
        const isSupport = t.scheduleDetails?.[targetKey]?.isSupport === true;
        return isFree || isSupport;
      })
      .map(t => {
        const detail = t.scheduleDetails?.[targetKey];
        const isSupport = detail?.isSupport === true;
        const supportClass = detail?.className || '';
        const isPriorityTarget = (normClass && supportClass === normClass && isSupport);
        let isCore = false; let coreSub = "";
        if (normClass && t.scheduleDetails) {
           const cls = Object.values(t.scheduleDetails).find(c => 
             c.className?.toUpperCase() === normClass && 
             CORE_SUBJECTS.some(sub => c.subject?.toUpperCase().includes(sub))
           );
           if(cls) { isCore = true; coreSub = cls.subject; }
        }
        return { ...t, isExtractable: isSupport, supportClass, isPriorityTarget, isCore, coreSub };
      })
      .sort((a, b) => {
        if (a.isPriorityTarget !== b.isPriorityTarget) return a.isPriorityTarget ? -1 : 1;
        if (a.isExtractable !== b.isExtractable) return a.isExtractable ? -1 : 1;
        if (a.isCore !== b.isCore) return a.isCore ? -1 : 1;
        if (a.actualFreePeriods.length !== b.actualFreePeriods.length) return b.actualFreePeriods.length - a.actualFreePeriods.length;
        if ((a.substitutions || 0) !== (b.substitutions || 0)) return (a.substitutions || 0) - (b.substitutions || 0);
        if ((a.absences || 0) !== (b.absences || 0)) return (b.absences || 0) - (a.absences || 0);
        return a.name.localeCompare(b.name, "zh-HK");
      });
  };

  // --- CSV / Backup ---
  const handleCSVImport = (e, type) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const rows = ev.target.result.split('\n').map(r => r.trim()).filter(r => r);
        let newTeachers = [...teachers];
        let count = 0;
        
        if (type === 'stats') {
          for (let i=1; i<rows.length; i++) {
             const cols = rows[i].split(','); if(cols.length < 3) continue;
             const name = cols[0].trim();
             const idx = newTeachers.findIndex(t => t.name === name);
             if(idx >= 0) newTeachers[idx] = {...newTeachers[idx], absences: parseInt(cols[1])||0, substitutions: parseInt(cols[2])||0};
             else newTeachers.push({id: Date.now()+i, name, absences: parseInt(cols[1])||0, substitutions: parseInt(cols[2])||0, freePeriods:[], masterSchedule:{}, scheduleDetails:{}});
             count++;
          }
        } else if (type === 'timetable') {
          const scheduleMap = {}; const detailsMap = {};
          for (let i=1; i<rows.length; i++) {
             const cols = rows[i].split(','); if(cols.length < 3) continue;
             const name = cols[0].trim(); const day = parseInt(cols[1]); const period = parseInt(cols[2]);
             if(!name || isNaN(day)) continue;
             if(!scheduleMap[name]) scheduleMap[name] = {};
             if(!scheduleMap[name][day]) scheduleMap[name][day] = [];
             if(!scheduleMap[name][day].includes(period)) scheduleMap[name][day].push(period);
             if(!detailsMap[name]) detailsMap[name] = {};
             detailsMap[name][`${day}-${period}`] = { className: cols[3]?.trim().toUpperCase(), subject: cols[4]?.trim(), isSupport: ['是','y','yes'].includes(cols[5]?.trim().toLowerCase()) };
             count++;
          }
          newTeachers = newTeachers.map(t => (scheduleMap[t.name] ? { ...t, masterSchedule: scheduleMap[t.name], scheduleDetails: detailsMap[t.name] || {} } : t));
          Object.keys(scheduleMap).forEach(name => {
             if(!newTeachers.find(t => t.name === name)) newTeachers.push({ id: Date.now()+Math.random(), name, freePeriods:[], absences:0, substitutions:0, masterSchedule: scheduleMap[name], scheduleDetails: detailsMap[name] || {} });
          });
        }
        setTeachers(newTeachers); showAlert("匯入成功", `已處理 ${count} 筆資料。請手動上傳雲端保存。`);
      } catch (err) { showAlert("錯誤", "格式有誤"); }
      e.target.value = '';
    };
    reader.readAsText(file);
  };

  const exportStatsToCSV = () => {
    let csv = "\ufeff姓名,總缺課,總代課\n";
    getSortedTeachers(teachers).forEach(t => csv += `${t.name},${t.absences},${t.substitutions}\n`);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a'); link.href = url; link.setAttribute('download', `stats_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  const downloadTimetableTemplate = () => {
    const csvContent = "\ufeff姓名,星期(1-5),節次(1-9),班級(重要),科目,是否入班(是/否)\n陳大文,1,1,3A,數學,否\n陳大文,1,2,3A,數學,否\n李小美,1,1,3A,數學支援,是\n李小美,1,3,1C,英文,否";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.setAttribute('download', 'timetable_template_v2.csv');
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  const downloadBackup = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ teachers, logs, backupDate: new Date().toISOString() }, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.setAttribute('download', `backup_${new Date().toISOString().slice(0,10)}.json`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  const restoreBackup = (e) => {
    const file = e.target.files[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if(data.teachers && data.logs && confirm("確定還原？")) {
          setTeachers(data.teachers); setLogs(data.logs); showAlert("成功", "資料已還原。");
        }
      } catch(err) { showAlert("錯誤", "檔案無效"); }
      e.target.value = '';
    };
    reader.readAsText(file);
  };

  // --- Render Functions ---
  
  const renderModal = () => {
    if (!modal.isOpen) return null;
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200 border border-purple-100">
          <div className="p-4 border-b border-purple-100 flex items-center justify-between bg-purple-50">
            <h3 className="font-bold text-lg flex items-center text-purple-900">
              {modal.type === 'confirm' ? <AlertCircle className="mr-2 text-purple-600" /> : <CheckCircle className="mr-2 text-fuchsia-600" />}
              {modal.title}
            </h3>
            <button onClick={closeModal} className="text-purple-400 hover:text-purple-600"><X size={20} /></button>
          </div>
          <div className="p-5 text-gray-700 whitespace-pre-wrap">{typeof modal.message === 'string' ? <p>{modal.message}</p> : modal.message}</div>
          <div className="p-4 border-t border-purple-100 bg-purple-50 flex justify-end gap-3">
            {modal.type === 'confirm' ? (
              <>
                <button type="button" onClick={closeModal} className="px-4 py-2 text-gray-600 bg-white border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors">取消</button>
                <button type="button" onClick={modal.onConfirm} className="px-4 py-2 text-white bg-gradient-to-r from-purple-600 to-fuchsia-600 rounded-lg hover:from-purple-700 hover:to-fuchsia-700 shadow-md transition-all">確定</button>
              </>
            ) : (
              <button type="button" onClick={closeModal} className="px-4 py-2 text-white bg-gradient-to-r from-purple-600 to-fuchsia-600 rounded-lg w-full shadow-md">知道了</button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderArrangeView = () => {
    const list = getAvailableTeachers();
    const day = new Date(formDate).getDay();
    let absentPeriods = [], allCovered = false;
    const sortedTeachers = getSortedTeachers(teachers);

    if (absentTeacherId) {
      const t = teachers.find(x => x.id == absentTeacherId);
      if (t?.masterSchedule?.[day]) {
        const covered = logs.filter(l => l.date === formDate && l.absentId == absentTeacherId).map(l => l.period);
        absentPeriods = t.masterSchedule[day].filter(p => !covered.includes(p)).sort((a,b)=>a-b);
        if (t.masterSchedule[day].length > 0 && absentPeriods.length === 0) allCovered = true;
      }
    }

    return (
      <div className="space-y-6">
        <div className="bg-white p-6 rounded-2xl shadow-xl border border-purple-100 animate-in fade-in zoom-in duration-300">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-purple-800 flex items-center"><Search className="mr-2" /> 安排代課</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-purple-700">1. 日期</label>
              <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} className="w-full p-2 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-400 outline-none transition-all" />
            </div>
            <div>
              <label className="text-sm font-medium text-purple-700">2. 缺席老師</label>
              <select value={absentTeacherId} onChange={e => setAbsentTeacherId(e.target.value)} className="w-full p-2 border border-purple-200 rounded-lg bg-white focus:ring-2 focus:ring-purple-400 outline-none transition-all">
                <option value="">-- 請選擇 --</option>
                {sortedTeachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-purple-700">3. 缺課節次</label>
              <select value={selectedPeriod} onChange={handlePeriodChange} disabled={!absentTeacherId} className="w-full p-2 border border-purple-200 rounded-lg bg-white disabled:bg-gray-100 focus:ring-2 focus:ring-purple-400 outline-none transition-all">
                <option value="">-- 請選擇 --</option>
                {absentTeacherId && (allCovered ? <option disabled>已全數安排</option> : absentPeriods.map(p => {
                   const t = teachers.find(x => x.id == absentTeacherId);
                   const info = t?.scheduleDetails?.[`${day}-${p}`]?.className || '';
                   return <option key={p} value={p}>第 {p} 節 {info ? `(${info})` : ''}</option>
                }))}
                {!absentTeacherId && PERIODS.map(p => <option key={p} value={p}>第 {p} 節</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-purple-700">4. 班別 (自動/手動)</label>
              <input type="text" value={className} onChange={e => setClassName(e.target.value)} className="w-full p-2 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-400 outline-none transition-all" placeholder="例如: 4C" />
            </div>
          </div>

          {selectedPeriod && absentTeacherId && (
            <div className="mt-6 animate-in slide-in-from-bottom-4 duration-500">
              <h3 className="text-lg font-semibold text-purple-900 mb-2 flex items-center"><Star className="mr-2 text-fuchsia-500" size={18}/> 建議名單</h3>
              <div className="bg-purple-50 p-2 rounded-lg text-xs text-purple-700 mb-3 border border-purple-100">
                優先: <span className="text-orange-600 font-bold">抽離</span> &gt; <span className="text-green-600 font-bold">主科</span> &gt; 空堂 &gt; 代課 &gt; 缺課
              </div>
              <div className="overflow-hidden rounded-xl border border-purple-100 shadow-sm">
                <table className="min-w-full bg-white text-sm">
                  <thead className="bg-gradient-to-r from-purple-50 to-pink-50 text-purple-900">
                    <tr><th className="p-3 text-left">姓名</th><th className="p-3 text-center">剩餘空堂</th><th className="p-3 text-center">代課</th><th className="p-3 text-center">缺課</th><th className="p-3 text-center">操作</th></tr>
                  </thead>
                  <tbody className="divide-y divide-purple-50">
                    {list.map(t => (
                      <tr key={t.id} className={`hover:bg-purple-50 transition-colors ${t.isExtractable ? 'bg-orange-50 hover:bg-orange-100' : ''} ${t.isCore && !t.isExtractable ? 'bg-green-50 hover:bg-green-100' : ''}`}>
                        <td className="p-3 font-medium">
                          {t.name}
                          {t.isPriorityTarget && <div className="text-xs text-purple-600 font-bold flex items-center mt-1"><Star size={10} className="mr-1 fill-purple-600"/> 本班支援</div>}
                          {t.isExtractable && !t.isPriorityTarget && <div className="text-xs text-orange-600 flex items-center mt-1"><ArrowRight size={10} className="mr-1"/> 抽離 ({t.supportClass})</div>}
                          {t.isCore && !t.isExtractable && <div className="text-xs text-green-600 flex items-center mt-1"><BookOpen size={10} className="mr-1"/> 主科 ({t.coreSub})</div>}
                        </td>
                        <td className="p-3 text-center text-blue-600 font-bold">{t.actualFreePeriods.length}</td>
                        <td className="p-3 text-center text-gray-600">{t.substitutions}</td>
                        <td className="p-3 text-center text-red-400">{t.absences}</td>
                        <td className="p-3 text-center">
                          <button onClick={() => handleSubstitutionClick(t.id, t.isExtractable)} className={`px-3 py-1.5 rounded-lg text-white shadow-md text-xs transition-transform active:scale-95 ${t.isExtractable ? 'bg-gradient-to-r from-orange-400 to-orange-500 hover:from-orange-500 hover:to-orange-600' : 'bg-gradient-to-r from-purple-500 to-fuchsia-500 hover:from-purple-600 hover:to-fuchsia-600'}`}>
                            {t.isExtractable ? '抽離' : '指派'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderTeachersView = () => (
    <div className="bg-white p-6 rounded-2xl shadow-xl border border-purple-100 space-y-4 animate-in fade-in zoom-in duration-300">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <h2 className="text-xl font-bold text-purple-800 flex items-center"><UserCheck className="mr-2"/> 教師設定</h2>
        <div className="flex gap-2">
          <button onClick={downloadTimetableTemplate} className="px-3 py-1.5 bg-purple-50 text-purple-700 rounded-lg text-sm border border-purple-200 hover:bg-purple-100"><Download size={14} className="inline mr-1"/>範本</button>
          <button onClick={() => timetableImportRef.current.click()} className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm shadow hover:bg-purple-700"><FileText size={14} className="inline mr-1"/>匯入課表</button>
          <button onClick={handleManualCloudUpload} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm shadow hover:bg-blue-700 flex items-center"><Upload size={14} className="mr-1"/> 手動上傳雲端</button>
          <input type="file" ref={timetableImportRef} onChange={e => handleCSVImport(e, 'timetable')} className="hidden" />
        </div>
      </div>
      <form onSubmit={addTeacher} className="flex gap-2">
        <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="新老師姓名" className="border border-purple-200 p-2 rounded-lg flex-1 focus:outline-none focus:ring-2 focus:ring-purple-400"/>
        <button className="bg-fuchsia-600 text-white px-4 rounded-lg hover:bg-fuchsia-700 shadow"><Plus/></button>
      </form>
      <div className="overflow-x-auto rounded-xl border border-purple-100">
        <table className="w-full text-sm">
          <thead className="bg-purple-50 text-purple-900"><tr><th className="p-3 text-left">姓名</th><th className="p-3 text-left">當日空堂</th><th className="p-3">刪除</th></tr></thead>
          <tbody className="divide-y divide-purple-50">{getSortedTeachers(teachers).map(t => (
          <tr key={t.id} className="hover:bg-purple-50 bg-white"><td className="p-3 font-medium">{t.name}</td>
          <td className="p-3 flex flex-wrap gap-1">{PERIODS.map(p => <button key={p} onClick={()=>toggleFreePeriod(t.id, p)} className={`w-7 h-7 rounded-full text-xs transition-all ${t.freePeriods.includes(p)?'bg-green-100 text-green-700 border border-green-300 font-bold':'bg-gray-50 text-gray-300 border border-gray-100'}`}>{p}</button>)}</td>
          <td className="p-3 text-center"><button onClick={()=>deleteTeacher(t.id)} className="text-gray-300 hover:text-red-500"><Trash2 size={16}/></button></td></tr>
        ))}</tbody></table>
      </div>
    </div>
  );

  const renderStatsView = () => (
    <div className="space-y-6 animate-in fade-in zoom-in duration-300">
      <div className="bg-white p-6 rounded-2xl shadow-xl border border-purple-100">
        <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
          <h2 className="text-xl font-bold text-purple-800 flex items-center"><BarChart3 className="mr-2"/> 統計表</h2>
          <div className="flex gap-2">
            <button onClick={exportStatsToCSV} className="px-3 py-1.5 bg-fuchsia-600 text-white rounded-lg text-sm shadow hover:bg-fuchsia-700"><Download size={14} className="inline mr-1"/>匯出CSV</button>
            <button onClick={() => teacherImportRef.current.click()} className="px-3 py-1.5 bg-purple-50 text-purple-700 rounded-lg text-sm border border-purple-200 hover:bg-purple-100"><Upload size={14} className="inline mr-1"/>匯入</button>
            <input type="file" ref={teacherImportRef} onChange={e => handleCSVImport(e, 'stats')} className="hidden" />
          </div>
        </div>
        <div className="overflow-hidden rounded-xl border border-purple-100">
          <table className="w-full text-sm bg-white">
            <thead className="bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white"><tr><th className="p-3 text-left">姓名</th><th className="p-3 text-center">缺課</th><th className="p-3 text-center">代課</th><th className="p-3 text-center">淨值</th></tr></thead>
            <tbody className="divide-y divide-purple-50">{getSortedTeachers(teachers).map(t => (
              <tr key={t.id} className="hover:bg-purple-50"><td className="p-3 font-medium">{t.name}</td><td className="p-3 text-center text-red-500 font-bold">{t.absences}</td><td className="p-3 text-center text-purple-600 font-bold">{t.substitutions}</td><td className="p-3 text-center font-medium text-gray-600">{t.substitutions - t.absences}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </div>
      <div className="bg-gradient-to-r from-gray-50 to-purple-50 p-6 rounded-2xl shadow-inner border border-purple-100">
        <h3 className="font-bold text-gray-700 mb-2 flex items-center"><Save className="mr-2" size={18}/> 備份與還原</h3>
        <div className="flex gap-3 mt-3">
          <button onClick={downloadBackup} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm shadow hover:bg-blue-700 transition-colors"><Download size={16} className="inline mr-2"/>下載備份</button>
          <button onClick={()=>backupImportRef.current.click()} className="bg-white text-gray-700 border border-gray-300 px-4 py-2 rounded-lg text-sm shadow-sm hover:bg-gray-50 transition-colors"><RefreshCw size={16} className="inline mr-2"/>還原備份</button>
          <input type="file" ref={backupImportRef} onChange={restoreBackup} className="hidden" />
        </div>
        {lastSaved && <p className="text-xs text-green-600 text-right mt-2 flex justify-end items-center"><CheckCircle size={10} className="mr-1"/>上次雲端同步: {lastSaved.toLocaleTimeString()}</p>}
      </div>
    </div>
  );

  const renderReportView = () => {
    const dailyLogs = logs.filter(l => l.date === formDate);
    
    // 1. 獲取當日所有「缺席老師」
    const uniqueAbsentIds = [...new Set(dailyLogs.map(l => l.absentId))];
    const absentCols = uniqueAbsentIds.map(id => {
      const log = dailyLogs.find(l => l.absentId === id);
      return { id, name: log.absentName };
    }).sort((a, b) => a.name.localeCompare(b.name, "zh-HK"));

    const getCellData = (period, absentId) => {
      return dailyLogs.find(l => l.period === period && l.absentId === absentId);
    };

    return (
      <div className="bg-white p-6 rounded-2xl shadow-xl border border-purple-100 animate-in fade-in zoom-in duration-300">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-purple-800 flex items-center"><Clock className="mr-2"/> 棋盤式日誌 (V3.1)</h2>
          <div className="flex items-center gap-2">
            <div className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded border border-gray-200 flex items-center">
              <GripHorizontal size={12} className="mr-1"/> 可拖曳互換代課
            </div>
            <input type="date" value={formDate} onChange={e=>setFormDate(e.target.value)} className="border border-purple-200 p-1 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400 text-sm"/>
          </div>
        </div>

        {dailyLogs.length === 0 ? (
          <div className="text-center py-12 bg-purple-50 rounded-xl border border-purple-100 border-dashed">
            <Heart className="mx-auto text-purple-200 mb-2" size={40}/>
            <p className="text-purple-400 text-sm">尚無紀錄</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-purple-100 shadow-sm">
            <table className="min-w-full bg-white text-sm border-collapse">
              <thead>
                <tr className="bg-purple-600 text-white">
                  <th className="p-3 border-r border-purple-500 w-20 sticky left-0 z-10 bg-purple-600">節次</th>
                  {absentCols.map(col => (
                    <th key={col.id} className="p-3 min-w-[140px] text-center border-r border-purple-500 last:border-0">
                      <div className="font-bold">{col.name}</div>
                      <div className="text-[10px] opacity-75 font-normal">缺席</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERIODS.map(period => (
                  <tr key={period} className="border-b border-purple-50 hover:bg-purple-50/50">
                    <td className="p-3 font-bold text-center text-purple-800 bg-purple-50 sticky left-0 z-10 border-r border-purple-100">
                      第 {period} 節
                    </td>
                    {absentCols.map(col => {
                      const log = getCellData(period, col.id);
                      const isDragged = draggedLogId === log?.id && log;
                      const isOver = dragOverLogId === log?.id && log && log.id !== draggedLogId;

                      return (
                        <td 
                          key={`${period}-${col.id}`} 
                          className={`p-2 border-r border-purple-100 text-center relative transition-colors
                            ${isOver ? 'bg-blue-100 border-2 border-blue-400' : ''}
                          `}
                          onDragOver={(e) => log && handleDragOver(e, log.id)}
                          onDrop={(e) => log && handleDrop(e, log.id)}
                          onDragLeave={handleDragEnd}
                        >
                          {log ? (
                            <div 
                              className={`
                                rounded-lg p-2 shadow-sm cursor-grab active:cursor-grabbing border
                                group select-none transition-all duration-200 relative
                                ${isDragged 
                                  ? 'bg-yellow-100 border-yellow-400 opacity-50 scale-95' 
                                  : 'bg-white border-purple-200 hover:shadow-md hover:border-purple-400 hover:-translate-y-0.5'
                                }
                              `}
                              draggable
                              onDragStart={(e) => handleDragStart(e, log.id)}
                              onDragEnd={handleDragEnd}
                            >
                              <div className="font-bold text-fuchsia-600 text-base mb-1">{log.subName}</div>
                              <div className="text-xs text-gray-500 bg-gray-100 px-1 rounded inline-block mb-1">{log.className}</div>
                              {log.note && (
                                <div className="text-[10px] text-red-500 font-bold bg-red-50 px-1 rounded border border-red-100 flex items-center justify-center">
                                  <FileWarning size={10} className="mr-1"/> {log.note}
                                </div>
                              )}
                              
                              <button 
                                onClick={(e) => { e.stopPropagation(); deleteLog(log.id); }}
                                className="absolute -top-2 -right-2 bg-red-100 text-red-500 rounded-full p-1 opacity-0 group-hover:opacity-100 hover:bg-red-200 transition-opacity shadow-sm z-20"
                                title="刪除"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          ) : (
                            <div className="text-gray-300 text-xs">-</div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-fuchsia-50 flex flex-col items-center justify-center">
        <Loader2 className="w-12 h-12 text-purple-600 animate-spin mb-4" />
        <h2 className="text-xl font-bold text-purple-800">正在同步資料 (V3.1)...</h2>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-fuchsia-50 font-sans text-gray-800 pb-10 selection:bg-fuchsia-200">
      {renderModal()}
      <nav className="bg-gradient-to-r from-purple-700 via-fuchsia-600 to-pink-600 text-white shadow-lg sticky top-0 z-40 backdrop-blur-md bg-opacity-90">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center">
             <div className="font-bold text-xl flex items-center tracking-wide mr-3"><Calendar className="mr-2"/> 智慧代課系統 V3.1</div>
             {isCloudEnabled ? 
               <div className="flex items-center space-x-2 cursor-pointer" onClick={() => alert("目前連線狀態正常。")}>
                 <span className="text-[10px] bg-green-500/20 text-white px-2 py-0.5 rounded-full flex items-center border border-green-200/30">
                   <Cloud size={10} className="mr-1"/> 雲端同步
                 </span>
                 {saveStatus === 'saving' && <span className="text-[10px] text-white/70 flex items-center"><Loader2 size={10} className="mr-1 animate-spin"/>儲存中...</span>}
                 {saveStatus === 'error' && <span className="text-[10px] text-red-200 flex items-center bg-red-500/20 px-1 rounded"><AlertCircle size={10} className="mr-1"/>儲存失敗</span>}
               </div>
               : 
               <span className="text-[10px] bg-white/10 text-white/70 px-2 py-0.5 rounded-full flex items-center border border-white/10" onClick={() => alert("目前為本機模式。請檢查 Firebase Console 設定。")}>
                 <CloudOff size={10} className="mr-1"/> 本機模式
               </span>
             }
          </div>
          <div className="flex space-x-1">
            {[{id:'arrange',label:'安排',icon:Search},{id:'teachers',label:'設定',icon:Users},{id:'report',label:'日誌',icon:Clock},{id:'stats',label:'統計',icon:BarChart3}].map(t=>(
              <button key={t.id} onClick={()=>setCurrentView(t.id)} className={`px-3 py-1.5 rounded-lg flex items-center text-sm transition-all duration-200 ${currentView===t.id?'bg-white/20 shadow-inner font-bold':'hover:bg-white/10 text-purple-100'}`}><t.icon size={14} className="mr-1.5"/>{t.label}</button>
            ))}
          </div>
        </div>
      </nav>
      <main className="max-w-4xl mx-auto p-4 py-6">
        {currentView==='arrange' && renderArrangeView()}
        {currentView==='teachers' && renderTeachersView()}
        {currentView==='stats' && renderStatsView()}
        {currentView==='report' && renderReportView()}
      </main>
    </div>
  );
}