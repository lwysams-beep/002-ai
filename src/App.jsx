import React, { useState, useEffect, useRef } from 'react';
import { Users, Calendar, BarChart3, Clock, Plus, Trash2, UserCheck, Search, X, AlertCircle, CheckCircle, Upload, Download, FileText, Star, ArrowRight, Heart, Save, RefreshCw, BookOpen, Cloud, CloudOff } from 'lucide-react';
import { doc, getDoc, setDoc } from "firebase/firestore";

// --- 常數設定 ---
const TOTAL_PERIODS = 9;
const PERIODS = Array.from({ length: TOTAL_PERIODS }, (_, i) => i + 1);
const CORE_SUBJECTS = ['中文', '英文', '數學', 'CHI', 'ENG', 'MATH', 'CHINESE', 'ENGLISH', 'MATHEMATICS'];
const STORAGE_KEY_TEACHERS = 'substitution_system_teachers_data';
const STORAGE_KEY_LOGS = 'substitution_system_logs_data';

export default function SubstitutionApp() {
  // --- 狀態管理 ---
  const [teachers, setTeachers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [isCloudEnabled, setIsCloudEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [lastSaved, setLastSaved] = useState(null);

  // 用 useRef 來儲存資料庫連線實例
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

  // --- 初始化與資料讀取 ---
  useEffect(() => {
    const initData = async () => {
      setIsLoading(true);
      let loadedFromCloud = false;

      // 1. 嘗試動態載入 Firebase 設定
      try {
        const fb = await import('./firebaseConfig');
        if (fb && fb.db) {
          dbRef.current = fb.db;
        }
      } catch (e) {
        console.log("提示: 尚未設定 firebaseConfig.js 或載入失敗，系統將以本機模式運行。");
      }

      // 2. 如果成功取得 db，嘗試從雲端讀取
      if (dbRef.current) {
        try {
          const docRef = doc(dbRef.current, "school_data", "main_backup");
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
            console.log("雲端無資料，將使用預設值初始化。");
            setIsCloudEnabled(true);
          }
        } catch (error) {
          console.error("雲端讀取失敗 (可能是權限或網絡問題):", error);
          setIsCloudEnabled(false);
        }
      }

      // 3. 如果雲端沒讀到資料，則讀取 LocalStorage
      if (!loadedFromCloud) {
        const localTeachers = localStorage.getItem(STORAGE_KEY_TEACHERS);
        const localLogs = localStorage.getItem(STORAGE_KEY_LOGS);

        if (localTeachers) {
          try {
            setTeachers(JSON.parse(localTeachers));
          } catch (e) { console.error("LocalStorage 解析錯誤", e); }
        } else {
          setTeachers([
            { id: 1, name: "陳大文", freePeriods: [], absences: 0, substitutions: 0, masterSchedule: {}, scheduleDetails: {} },
            { id: 2, name: "李小美", freePeriods: [], absences: 0, substitutions: 0, masterSchedule: {}, scheduleDetails: {} }
          ]);
        }
        
        if (localLogs) {
          try {
            setLogs(JSON.parse(localLogs));
          } catch (e) { console.error("LocalStorage Log 解析錯誤", e); }
        }
      }
      setIsLoading(false);
    };

    initData();
  }, []);

  // --- 自動儲存機制 ---
  useEffect(() => {
    if (isLoading) return;

    localStorage.setItem(STORAGE_KEY_TEACHERS, JSON.stringify(teachers));
    localStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(logs));

    const timer = setTimeout(async () => {
      if (isCloudEnabled && dbRef.current) {
        try {
          await setDoc(doc(dbRef.current, "school_data", "main_backup"), {
            teachers: teachers,
            logs: logs,
            lastUpdated: new Date().toISOString()
          });
          setLastSaved(new Date());
        } catch (e) {
          console.error("雲端儲存失敗:", e);
        }
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [teachers, logs, isCloudEnabled, isLoading]);

  // --- 重算當日空堂 ---
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

  // --- UI 連動 ---
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

  // --- 輔助函式 ---
  const getSortedTeachers = (list) => [...list].sort((a, b) => a.name.localeCompare(b.name, "zh-HK"));
  const showAlert = (title, message) => setModal({ isOpen: true, type: 'info', title, message });
  const showConfirm = (title, message, onConfirm) => setModal({ isOpen: true, type: 'confirm', title, message, onConfirm });
  const closeModal = () => setModal({ ...modal, isOpen: false });

  // --- 功能函式 ---
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
    if (!absentTeacherId || !selectedPeriod || !className) return showAlert("資料不完整", "請填寫完整資訊");
    const subT = teachers.find(t => t.id == subTeacherId);
    const absT = teachers.find(t => t.id == absentTeacherId);
    if (!subT || !absT) return showAlert("錯誤", "找不到老師資料");

    const msg = (
      <div className="text-left text-sm space-y-1">
        <p><strong>日期:</strong> {formDate} (第 {selectedPeriod} 節)</p>
        <p><strong>班級:</strong> {className}</p>
        <p className="text-red-500"><strong>缺席:</strong> {absT.name}</p>
        <p className="text-purple-600"><strong>代課:</strong> {subT.name}</p>
        {isExtracting && <p className="text-orange-500 font-bold text-xs mt-2">⚠️ 將從原支援班級抽離</p>}
      </div>
    );

    showConfirm("確認安排", msg, () => {
      setTeachers(prev => prev.map(t => {
        if (t.id == absentTeacherId) return { ...t, absences: (t.absences || 0) + 1 };
        if (t.id == subTeacherId) return { ...t, substitutions: (t.substitutions || 0) + 1 };
        return t;
      }));
      setLogs(prev => [{ id: Date.now(), date: formDate, period: parseInt(selectedPeriod), className, absentName: absT.name, absentId: absT.id, subName: subT.name, subId: subT.id, timestamp: new Date().toLocaleString() }, ...prev]);
      closeModal();
      setClassName(''); setAbsentTeacherId(''); setSelectedPeriod('');
      setTimeout(() => showAlert("成功", "已安排代課"), 100);
    });
  };

  const deleteLog = (logId) => {
    const log = logs.find(l => l.id === logId);
    if (!log) return;
    showConfirm("確認刪除", "確定刪除此紀錄？相關統計將自動回滾。", () => {
      setTeachers(prev => prev.map(t => {
        let changes = {};
        if ((log.absentId && t.id == log.absentId) || (!log.absentId && t.name === log.absentName)) changes.absences = Math.max(0, (t.absences || 0) - 1);
        if ((log.subId && t.id == log.subId) || (!log.subId && t.name === log.subName)) changes.substitutions = Math.max(0, (t.substitutions || 0) - 1);
        return Object.keys(changes).length ? { ...t, ...changes } : t;
      }));
      setLogs(prev => prev.filter(l => l.id !== logId));
      closeModal();
    });
  };

  // --- 核心演算法 ---
  const getAvailableTeachers = () => {
    if (!selectedPeriod || !absentTeacherId) return [];
    
    const p = parseInt(selectedPeriod);
    const dayOfWeek = new Date(formDate).getDay();
    const targetKey = `${dayOfWeek}-${p}`; 
    const normClass = className?.trim().toUpperCase();
    const dailyLogs = logs.filter(l => l.date === formDate);

    return teachers
      .map(t => {
        const subbedPeriods = dailyLogs.filter(log => log.subId == t.id).map(log => log.period);
        const actualFreePeriods = (t.freePeriods || []).filter(fp => !subbedPeriods.includes(fp));
        return { ...t, actualFreePeriods, subbedPeriods };
      })
      .filter(t => {
        if (t.id == absentTeacherId) return false;
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

  // --- 匯入/匯出 ---
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
        setTeachers(newTeachers); showAlert("匯入成功", `已處理 ${count} 筆資料。`);
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
        if(data.teachers && data.logs && confirm("確定還原？這將覆蓋現有資料。")) {
          setTeachers(data.teachers); setLogs(data.logs); showAlert("成功", "資料已還原。");
        }
      } catch(err) { showAlert("錯誤", "檔案無效"); }
      e.target.value = '';
    };
    reader.readAsText(file);
  };

  // --- 視圖元件 ---
  const Modal = () => {
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

  const ArrangeView = () => {
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
          {/* --- 這裡就是關鍵的修改：標題列 --- */}
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-purple-800 flex items-center"><Search className="mr-2" /> 安排代課</h2>
            {/* 這裡已被移除，改移到 Navbar */}
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

  const TeachersView = () => (
    <div className="bg-white p-6 rounded-2xl shadow-xl border border-purple-100 space-y-4 animate-in fade-in zoom-in duration-300">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <h2 className="text-xl font-bold text-purple-800 flex items-center"><UserCheck className="mr-2"/> 教師設定</h2>
        <div className="flex gap-2">
          <button onClick={downloadTimetableTemplate} className="px-3 py-1.5 bg-purple-50 text-purple-700 rounded-lg text-sm border border-purple-200 hover:bg-purple-100"><Download size={14} className="inline mr-1"/>範本</button>
          <button onClick={() => timetableImportRef.current.click()} className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm shadow hover:bg-purple-700"><FileText size={14} className="inline mr-1"/>匯入課表</button>
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

  const StatsView = () => (
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
        <p className="text-xs text-gray-500 mb-4">系統會自動備份於本機。若需轉移裝置，請下載備份檔 (JSON)。</p>
        <div className="flex gap-3">
          <button onClick={downloadBackup} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm shadow hover:bg-blue-700 transition-colors"><Download size={16} className="inline mr-2"/>下載備份</button>
          <button onClick={()=>backupImportRef.current.click()} className="bg-white text-gray-700 border border-gray-300 px-4 py-2 rounded-lg text-sm shadow-sm hover:bg-gray-50 transition-colors"><RefreshCw size={16} className="inline mr-2"/>還原備份</button>
          <input type="file" ref={backupImportRef} onChange={restoreBackup} className="hidden" />
        </div>
        {lastSaved && <p className="text-xs text-green-600 text-right mt-2 flex justify-end items-center"><CheckCircle size={10} className="mr-1"/>上次雲端同步: {lastSaved.toLocaleTimeString()}</p>}
      </div>
    </div>
  );

  const ReportView = () => {
    const dailyLogs = logs.filter(l => l.date === formDate);
    return (
      <div className="bg-white p-6 rounded-2xl shadow-xl border border-purple-100 animate-in fade-in zoom-in duration-300">
        <div className="flex justify-between items-center mb-4"><h2 className="text-xl font-bold text-purple-800 flex items-center"><Clock className="mr-2"/> 日誌</h2><input type="date" value={formDate} onChange={e=>setFormDate(e.target.value)} className="border border-purple-200 p-1 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400"/></div>
        {dailyLogs.length===0 ? <div className="text-center py-12 bg-purple-50 rounded-xl border border-purple-100 border-dashed"><Heart className="mx-auto text-purple-200 mb-2" size={40}/><p className="text-purple-400 text-sm">尚無紀錄</p></div> : 
        <div className="space-y-3">
          <div className="p-4 bg-gradient-to-br from-yellow-50 to-orange-50 border border-yellow-100 rounded-xl shadow-sm">
            <h3 className="font-bold text-gray-800 border-b border-yellow-200 pb-2 mb-3 text-center">{formDate} 代課公告</h3>
            <div className="grid gap-3">{dailyLogs.sort((a,b)=>a.period-b.period).map(l => (
              <div key={l.id} className="flex justify-between items-center p-3 bg-white rounded-lg border border-yellow-100 shadow-sm hover:shadow-md transition-shadow group">
                <div className="flex gap-3 items-center"><span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded text-xs font-bold">第{l.period}節</span> <span className="font-bold text-gray-700">{l.className}</span></div>
                <div className="flex gap-3 text-sm items-center">
                  <span className="line-through text-gray-400 text-xs">{l.absentName}</span> <ArrowRight size={12} className="text-gray-300"/> <span className="text-fuchsia-600 font-bold bg-fuchsia-50 px-2 py-0.5 rounded">{l.subName}</span>
                  <button onClick={()=>deleteLog(l.id)} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={16}/></button>
                </div>
              </div>
            ))}</div>
          </div>
        </div>}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-fuchsia-50 font-sans text-gray-800 pb-10 selection:bg-fuchsia-200">
      <Modal />
      <nav className="bg-gradient-to-r from-purple-700 via-fuchsia-600 to-pink-600 text-white shadow-lg sticky top-0 z-40 backdrop-blur-md bg-opacity-90">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center">
             <div className="font-bold text-xl flex items-center tracking-wide mr-3"><Calendar className="mr-2"/> 智慧代課</div>
             {/* --- 這裡就是綠色標籤的新位置 --- */}
             {isCloudEnabled ? 
               <span className="text-[10px] bg-green-500/20 text-white px-2 py-0.5 rounded-full flex items-center border border-green-200/30"><Cloud size={10} className="mr-1"/> 雲端</span> : 
               <span className="text-[10px] bg-white/10 text-white/70 px-2 py-0.5 rounded-full flex items-center border border-white/10"><CloudOff size={10} className="mr-1"/> 本機</span>
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
        {currentView==='arrange' && <ArrangeView/>}
        {currentView==='teachers' && <TeachersView/>}
        {currentView==='stats' && <StatsView/>}
        {currentView==='report' && <ReportView/>}
      </main>
    </div>
  );
}