import React, { useState, useEffect, useRef } from 'react';
import { Users, Calendar, BarChart3, Clock, Plus, Trash2, UserCheck, Search, X, AlertCircle, CheckCircle, Upload, Download, FileText, Star, ArrowRight, Heart, Save, RefreshCw, BookOpen, Cloud, CloudOff, Loader2, FileWarning } from 'lucide-react';
import { doc, getDoc, setDoc } from "firebase/firestore";

// --- 常數設定 ---
const TOTAL_PERIODS = 9;
const PERIODS = Array.from({ length: TOTAL_PERIODS }, (_, i) => i + 1);
const CORE_SUBJECTS = ['中文', '英文', '數學', 'CHI', 'ENG', 'MATH', 'CHINESE', 'ENGLISH', 'MATHEMATICS'];
const ABSENT_REASONS = ['病假', '事假', '進修', '覆診', '遲返', '早退', '交流', '帶隊'];

const STORAGE_KEY_TEACHERS = 'substitution_system_teachers_data_v3';
const STORAGE_KEY_LOGS = 'substitution_system_logs_data_v3';

// 預設日期邏輯：六、日順延至下星期一
const getInitialDate = () => {
  const d = new Date();
  const day = d.getDay();
  if (day === 6) d.setDate(d.getDate() + 2);
  else if (day === 0) d.setDate(d.getDate() + 1);
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d - tzOffset).toISOString().split('T')[0];
};

export default function SubstitutionApp() {
  // --- 狀態管理 ---
  const [teachers, setTeachers] = useState([]);
  const [logs, setLogs] = useState([]); 
  const [isCloudEnabled, setIsCloudEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [lastSaved, setLastSaved] = useState(null);
  const [saveStatus, setSaveStatus] = useState('idle');
  const dbRef = useRef(null);

  // 介面狀態
  const [currentView, setCurrentView] = useState('arrange'); 
  const [formDate, setFormDate] = useState(getInitialDate());
  
  // V3.5-3.6 安排代課狀態
  const [newAbsentId, setNewAbsentId] = useState('');
  const [newAbsentReason, setNewAbsentReason] = useState('病假');
  const [activeCell, setActiveCell] = useState(null); 
  
  // 統計月份
  const [statsMonth, setStatsMonth] = useState(new Date().toISOString().slice(0, 7));

  const [newTitle, setNewTitle] = useState(''); 
  const [newName, setNewName] = useState(''); 

  const teacherImportRef = useRef(null);
  const timetableImportRef = useRef(null);
  const backupImportRef = useRef(null);
  const sortImportRef = useRef(null);

  const [modal, setModal] = useState({ isOpen: false, type: 'info', title: '', message: '', onConfirm: null });

  // --- 初始化 ---
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
          const docRef = doc(dbRef.current, "school_data", "main_backup_v3");
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            setTeachers(data.teachers || []);
            setLogs(data.logs || []);
            setLastSaved(data.lastUpdated ? new Date(data.lastUpdated) : new Date());
            loadedFromCloud = true;
            setIsCloudEnabled(true); 
          } else setIsCloudEnabled(true); 
        } catch (error) { setIsCloudEnabled(false); }
      }

      if (!loadedFromCloud) {
        let localTeachers = localStorage.getItem(STORAGE_KEY_TEACHERS);
        let localLogs = localStorage.getItem(STORAGE_KEY_LOGS);
        if (localTeachers) setTeachers(JSON.parse(localTeachers));
        else setTeachers([{ id: 1, title: "", name: "陳大文", freePeriods: [], masterSchedule: {}, scheduleDetails: {}, sortOrder: 9999 }]);
        if (localLogs) setLogs(JSON.parse(localLogs));
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
            teachers, logs, lastUpdated: new Date().toISOString()
          });
          setLastSaved(new Date());
        } catch (e) {}
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [teachers, logs, isCloudEnabled, isLoading]);

  // --- Helpers ---
  // V3.6 修復: 確保 name 存在，避免 localeCompare 報錯
  const getSortedTeachers = (list) => [...list].sort((a, b) => {
    const orderA = a.sortOrder !== undefined ? a.sortOrder : 9999;
    const orderB = b.sortOrder !== undefined ? b.sortOrder : 9999;
    if (orderA !== orderB) return orderA - orderB;
    return (a.name || '').localeCompare(b.name || '', "zh-HK");
  });

  const showAlert = (title, message) => setModal({ isOpen: true, type: 'info', title, message });
  const showConfirm = (title, message, onConfirm) => setModal({ isOpen: true, type: 'confirm', title, message, onConfirm });
  const closeModal = () => setModal({ ...modal, isOpen: false });

  // --- V3.5-3.6 安排缺席與代課邏輯 ---
  useEffect(() => { setActiveCell(null); }, [formDate]);

  const handleAddAbsent = () => {
    if (!newAbsentId) return showAlert("提示", "請選擇缺席老師");
    const t = teachers.find(x => x.id == newAbsentId);
    const dayOfWeek = new Date(formDate).getDay();
    const busy = t?.masterSchedule?.[dayOfWeek] || [];
    const existing = logs.filter(l => l.date === formDate && l.absentId == newAbsentId).map(l => l.period);
    
    const newLogs = [];
    busy.forEach(p => {
      if (!existing.includes(p)) {
        newLogs.push({
          id: Date.now() + Math.random(),
          date: formDate,
          period: p,
          className: t.scheduleDetails?.[`${dayOfWeek}-${p}`]?.className || '',
          absentName: t.name,
          absentId: t.id,
          reason: newAbsentReason,
          subName: null,
          subId: null,
          note: '',
          timestamp: new Date().toLocaleString()
        });
      }
    });
    
    if (newLogs.length > 0) setLogs(prev => [...newLogs, ...prev]);
    else showAlert("提示", "該老師今日無排定課堂，或已全數加入缺席名單。");
    setNewAbsentId('');
  };

  const getAvailableTeachers = () => {
    if (!activeCell) return [];
    const p = activeCell.period;
    const dayOfWeek = new Date(formDate).getDay();
    const targetKey = `${dayOfWeek}-${p}`; 
    const normClass = activeCell.className?.trim().toUpperCase();
    const dailyLogs = logs.filter(l => l.date === formDate);

    return teachers
      .map(t => {
        const subbedPeriods = dailyLogs.filter(log => log.subId == t.id).map(log => log.period);
        const actualFreePeriods = (t.freePeriods || []).filter(fp => !subbedPeriods.includes(fp));
        const dailySubCount = subbedPeriods.length; // 計算今日已代課節數
        return { ...t, actualFreePeriods, subbedPeriods, dailySubCount };
      })
      .filter(t => {
        if (t.id == activeCell.absentId) return false; 
        if (t.subbedPeriods.includes(p)) return false; // 同一節已被指派
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
        // 1. 公平原則：每日代課節數少的優先
        if (a.dailySubCount !== b.dailySubCount) return a.dailySubCount - b.dailySubCount;
        // 2. 抽離與主科優先
        if (a.isPriorityTarget !== b.isPriorityTarget) return a.isPriorityTarget ? -1 : 1;
        if (a.isExtractable !== b.isExtractable) return a.isExtractable ? -1 : 1;
        if (a.isCore !== b.isCore) return a.isCore ? -1 : 1;
        // 3. 空堂數多優先
        if (a.actualFreePeriods.length !== b.actualFreePeriods.length) return b.actualFreePeriods.length - a.actualFreePeriods.length;
        // 4. 固定排序
        const orderA = a.sortOrder !== undefined ? a.sortOrder : 9999;
        const orderB = b.sortOrder !== undefined ? b.sortOrder : 9999;
        if (orderA !== orderB) return orderA - orderB;
        return (a.name || '').localeCompare(b.name || '', "zh-HK");
      });
  };

  const handleAssignSub = (subTeacherId, isExtracting) => {
    const subT = teachers.find(t => t.id == subTeacherId);
    let note = '';
    if (isExtracting) {
        const p = activeCell.period;
        const dayOfWeek = new Date(formDate).getDay();
        const detail = subT?.scheduleDetails?.[`${dayOfWeek}-${p}`];
        note = detail?.className ? `(${detail.className}不抽離)` : `(支援課堂不抽離)`;
    }
    
    setLogs(prev => prev.map(l => l.id === activeCell.logId ? { ...l, subId: subT.id, subName: subT.name, note } : l));
    setActiveCell(null);
  };

  const handleRemoveSub = () => {
    setLogs(prev => prev.map(l => l.id === activeCell.logId ? { ...l, subId: null, subName: null, note: '' } : l));
    setActiveCell(prev => ({...prev, subId: null, subName: null, note: ''}));
  };

  const handleDeleteLog = () => {
    setLogs(prev => prev.filter(l => l.id !== activeCell.logId));
    setActiveCell(null);
  };

  // --- 教師設定 CRUD ---
  const addTeacher = (e) => {
    e.preventDefault();
    if(newName.trim()) {
      setTeachers([...teachers, { id: Date.now(), title: newTitle.trim(), name: newName.trim(), freePeriods: [], masterSchedule: {}, scheduleDetails: {}, sortOrder: 9999 }]);
      setNewTitle(''); setNewName('');
    }
  };
  const deleteTeacher = (id) => showConfirm("刪除確認", "確定要刪除這位老師嗎？", () => setTeachers(teachers.filter(t => t.id !== id)).then(closeModal));
  
  // V3.6 修復: 確保 freePeriods 存在，避免防呆出錯
  const toggleFreePeriod = (teacherId, period) => {
    setTeachers(prev => prev.map(t => {
      if (t.id === teacherId) {
        const fp = t.freePeriods || [];
        return { ...t, freePeriods: fp.includes(period) ? fp.filter(p => p !== period) : [...fp, period].sort((a, b) => a - b) };
      }
      return t;
    }));
  };

  // --- 匯入匯出 ---
  const handleSortImport = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const rows = ev.target.result.split('\n').map(r => r.trim()).filter(r => r);
        const sortData = rows.map(row => {
           const cols = row.split(',');
           return { title: cols.length >= 2 ? cols[0].trim() : '', name: cols.length >= 2 ? cols[1].trim() : cols[0].trim() };
        }).filter(item => item.name);

        setTeachers(prev => {
          let newTeachers = [...prev];
          newTeachers.forEach(t => {
             const found = sortData.find(s => s.name === t.name);
             if (found) { t.sortOrder = sortData.indexOf(found); t.title = found.title || t.title; } 
             else t.sortOrder = 9999;
          });
          newTeachers.sort((a, b) => {
             const orderA = a.sortOrder !== undefined ? a.sortOrder : 9999;
             const orderB = b.sortOrder !== undefined ? b.sortOrder : 9999;
             if (orderA !== orderB) return orderA - orderB;
             return (a.name || '').localeCompare(b.name || '', "zh-HK");
          });
          newTeachers.forEach((t, i) => t.sortOrder = i);
          return newTeachers;
        });
        showAlert("成功", "老師排序及職銜已成功匯入！");
      } catch (err) { showAlert("錯誤", "排序匯入失敗。"); }
      e.target.value = '';
    };
    reader.readAsText(file);
  };

  const moveTeacher = (index, direction) => {
    setTeachers(prev => {
      let newTeachers = getSortedTeachers(prev);
      if (direction === 'up' && index > 0) {
        const temp = newTeachers[index - 1]; newTeachers[index - 1] = newTeachers[index]; newTeachers[index] = temp;
      } else if (direction === 'down' && index < newTeachers.length - 1) {
        const temp = newTeachers[index + 1]; newTeachers[index + 1] = newTeachers[index]; newTeachers[index] = temp;
      }
      newTeachers.forEach((t, i) => t.sortOrder = i);
      return newTeachers;
    });
  };

  const handleCSVImport = (e, type) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const rows = ev.target.result.split('\n').map(r => r.trim()).filter(r => r);
        let newTeachers = [...teachers];
        if (type === 'timetable') {
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
          }
          newTeachers = newTeachers.map(t => (scheduleMap[t.name] ? { ...t, masterSchedule: scheduleMap[t.name], scheduleDetails: detailsMap[t.name] || {} } : t));
          Object.keys(scheduleMap).forEach(name => {
             if(!newTeachers.find(t => t.name === name)) newTeachers.push({ id: Date.now()+Math.random(), title: "", name, freePeriods:[], masterSchedule: scheduleMap[name], scheduleDetails: detailsMap[name] || {}, sortOrder: 9999 });
          });
        }
        setTeachers(newTeachers); showAlert("匯入成功", "課表已成功更新。");
      } catch (err) { showAlert("錯誤", "格式有誤"); }
      e.target.value = '';
    };
    reader.readAsText(file);
  };

  const exportStatsToCSV = () => {
    const monthLogs = logs.filter(l => l.date.startsWith(statsMonth));
    let csv = `\ufeff職銜,姓名,${statsMonth} 缺課,${statsMonth} 代課,淨值\n`;
    getSortedTeachers(teachers).forEach(t => {
      const monthAbs = monthLogs.filter(l => l.absentId === t.id).length;
      const monthSubs = monthLogs.filter(l => l.subId === t.id).length;
      csv += `${t.title||''},${t.name},${monthAbs},${monthSubs},${monthSubs - monthAbs}\n`;
    });
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a'); link.href = url; link.setAttribute('download', `stats_${statsMonth}.csv`);
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

  // --- 畫面渲染 ---
  const renderModal = () => {
    if (!modal.isOpen) return null;
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200 border border-purple-100">
          <div className="p-4 border-b border-purple-100 flex items-center justify-between bg-purple-50">
            <h3 className="font-bold text-lg flex items-center text-purple-900">{modal.title}</h3>
            <button onClick={closeModal} className="text-purple-400 hover:text-purple-600"><X size={20} /></button>
          </div>
          <div className="p-5 text-gray-700 whitespace-pre-wrap">{modal.message}</div>
          <div className="p-4 border-t border-purple-100 bg-purple-50 flex justify-end gap-3">
            {modal.type === 'confirm' ? (
              <><button onClick={closeModal} className="px-4 py-2 text-gray-600 bg-white border rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={modal.onConfirm} className="px-4 py-2 text-white bg-purple-600 rounded-lg hover:bg-purple-700">確定</button></>
            ) : (<button onClick={closeModal} className="px-4 py-2 text-white bg-purple-600 rounded-lg w-full">知道了</button>)}
          </div>
        </div>
      </div>
    );
  };

  const renderArrangeView = () => {
    const dailyLogs = logs.filter(l => l.date === formDate);
    const uniqueAbsentIds = [...new Set(dailyLogs.map(l => l.absentId))];
    const absentCols = uniqueAbsentIds.map(id => {
      const log = dailyLogs.find(l => l.absentId === id);
      return { id, name: log.absentName, reason: log.reason };
    });
    const sortedTeachers = getSortedTeachers(teachers);

    return (
      <div className="flex flex-col md:flex-row gap-4 h-[75vh]">
        {/* 左側：推薦名單與操作 (佔 30%) */}
        <div className="w-full md:w-1/3 bg-white p-4 rounded-xl border border-purple-100 shadow-sm flex flex-col h-full overflow-hidden animate-in fade-in slide-in-from-left-4">
          <h3 className="font-bold text-lg text-purple-900 mb-3 border-b border-purple-100 pb-2 flex items-center">
            <Star className="mr-2 text-fuchsia-500" size={18}/> 安排操作
          </h3>
          {!activeCell ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 text-sm p-4 text-center border-2 border-dashed border-gray-100 rounded-lg">
               <Search size={40} className="mb-2 text-gray-300"/>
               請在右方表格點選<br/>「需要代課」的格子來安排
            </div>
          ) : (
            <div className="flex flex-col h-full overflow-hidden">
              <div className="bg-purple-50 p-3 rounded-lg mb-4 text-sm shadow-sm border border-purple-100">
                <p><strong>缺席:</strong> {activeCell.absentName} ({activeCell.reason})</p>
                <p><strong>節次:</strong> 第 {activeCell.period} 節</p>
                <div className="flex items-center mt-2">
                  <strong className="mr-2">班別:</strong> 
                  <input 
                    type="text" 
                    value={activeCell.className}
                    onChange={(e) => {
                      const val = e.target.value;
                      setActiveCell(prev => ({...prev, className: val}));
                      setLogs(prev => prev.map(l => l.id === activeCell.logId ? {...l, className: val} : l));
                    }}
                    className="border p-1 rounded w-20 text-xs outline-none focus:border-purple-400 bg-white"
                  />
                </div>
                {activeCell.subId && (
                  <div className="mt-3 p-2 bg-green-100 text-green-800 rounded flex justify-between items-center border border-green-200">
                    <span>已指派: <strong>{activeCell.subName}</strong></span>
                    <button onClick={handleRemoveSub} className="text-xs bg-white text-red-500 px-2 py-1 rounded shadow-sm hover:bg-red-50 border border-red-100">移除代課</button>
                  </div>
                )}
                <div className="mt-3 pt-3 border-t border-purple-200 text-right">
                  <button onClick={handleDeleteLog} className="text-xs text-red-500 hover:underline flex items-center justify-end w-full"><Trash2 size={12} className="mr-1"/> 刪除此節缺課紀錄</button>
                </div>
              </div>
              
              <div className="text-xs text-purple-700 mb-2 font-bold flex justify-between">
                 <span>推薦代課名單</span>
                 <span className="text-gray-500 font-normal">每日限 1 節原則</span>
              </div>
              <div className="flex-1 overflow-y-auto pr-1 space-y-2">
                 {getAvailableTeachers().map(t => (
                   <div key={t.id} className="flex justify-between items-center p-2 bg-white border border-gray-200 rounded-lg shadow-sm hover:border-purple-400 transition-colors">
                      <div>
                        <div className="font-bold text-sm text-gray-800">{t.title ? `[${t.title}] ` : ''}{t.name}</div>
                        <div className="text-xs text-gray-500 mt-0.5">今日已代: <span className="font-bold text-purple-600">{t.dailySubCount}</span> 節 | 空堂: {t.actualFreePeriods.length}</div>
                        {t.isPriorityTarget && <div className="text-[10px] text-purple-600 font-bold mt-1 bg-purple-50 inline-block px-1 rounded">本班支援</div>}
                        {t.isExtractable && !t.isPriorityTarget && <div className="text-[10px] text-orange-600 mt-1 bg-orange-50 inline-block px-1 rounded">抽離 ({t.supportClass})</div>}
                        {t.isCore && !t.isExtractable && <div className="text-[10px] text-green-600 mt-1 bg-green-50 inline-block px-1 rounded">主科 ({t.coreSub})</div>}
                      </div>
                      <button onClick={() => handleAssignSub(t.id, t.isExtractable)} className="px-3 py-1.5 bg-gradient-to-r from-purple-500 to-fuchsia-500 text-white rounded text-xs shadow hover:shadow-md active:scale-95 transition-all">指派</button>
                   </div>
                 ))}
                 {getAvailableTeachers().length === 0 && <div className="text-center text-gray-400 text-sm py-8 border border-dashed rounded-lg">該節次無可用老師</div>}
              </div>
            </div>
          )}
        </div>

        {/* 右側：並列表格 (佔 70%) */}
        <div className="flex-1 bg-white p-4 rounded-xl border border-purple-100 shadow-sm flex flex-col h-full animate-in fade-in slide-in-from-right-4">
           <div className="flex flex-wrap gap-3 items-end mb-4 border-b border-gray-100 pb-4">
              <div>
                <label className="block text-xs font-bold text-purple-700 mb-1">日期</label>
                <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} className="border border-purple-200 p-1.5 rounded outline-none focus:border-purple-500 text-sm" />
              </div>
              <div className="flex items-end gap-2 bg-gray-50 p-2 rounded-lg border border-gray-200">
                <div>
                  <label className="block text-[10px] text-gray-500 mb-0.5">新增缺席老師</label>
                  <select value={newAbsentId} onChange={e=>setNewAbsentId(e.target.value)} className="border border-gray-300 p-1 rounded text-sm w-32 outline-none focus:border-purple-400">
                    <option value="">請選擇...</option>
                    {sortedTeachers.map(t => <option key={t.id} value={t.id}>{t.title ? `[${t.title}] ` : ''}{t.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 mb-0.5">原因</label>
                  <select value={newAbsentReason} onChange={e=>setNewAbsentReason(e.target.value)} className="border border-gray-300 p-1 rounded text-sm w-20 outline-none focus:border-purple-400">
                    {ABSENT_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <button onClick={handleAddAbsent} className="bg-purple-600 text-white px-3 py-1 rounded shadow hover:bg-purple-700 text-sm h-[30px] flex items-center"><Plus size={14} className="mr-1"/> 加入</button>
              </div>
           </div>

           <div className="flex-1 overflow-auto rounded-lg border border-gray-200">
             <table className="w-full text-sm text-center border-collapse min-w-max">
                <thead className="bg-purple-50 sticky top-0 z-20 shadow-sm">
                   <tr>
                     <th className="p-2 border-b border-r border-gray-200 min-w-[60px] bg-purple-100 sticky left-0 z-30">節次</th>
                     {absentCols.map(c => (
                       <th key={c.id} className="p-2 border-b border-gray-200 min-w-[140px] bg-purple-50">
                         <div className="font-bold text-purple-900 text-base">{c.name}</div>
                         <div className="text-[10px] text-red-500 bg-red-50 rounded px-1 inline-block mt-0.5 border border-red-100">{c.reason}</div>
                       </th>
                     ))}
                     {absentCols.length === 0 && <th className="p-2 border-b text-gray-400 font-normal">請先於上方新增缺席老師</th>}
                   </tr>
                </thead>
                <tbody>
                   {PERIODS.map(p => (
                     <tr key={p} className="hover:bg-purple-50/30">
                       <td className="p-2 border-b border-r border-gray-200 font-bold bg-white text-purple-800 sticky left-0 z-10">{p}</td>
                       {absentCols.map(c => {
                          const log = dailyLogs.find(l => l.absentId === c.id && l.period === p);
                          const isActive = activeCell?.logId === log?.id;
                          
                          if (!log) return <td key={c.id} className="p-2 border-b border-gray-200 bg-gray-50 text-gray-300">-</td>;
                          
                          return (
                            <td 
                              key={c.id} 
                              onClick={() => setActiveCell({...log, logId: log.id})}
                              className={`p-2 border-b cursor-pointer transition-all ${
                                isActive ? 'bg-purple-100 ring-2 ring-inset ring-purple-500' :
                                !log.subId ? 'bg-red-50 hover:bg-red-100 border-x border-red-100' : 
                                'bg-green-50 hover:bg-green-100 border-x border-green-100'
                              }`}
                            >
                              {!log.subId ? (
                                <div className="text-red-500 font-bold text-sm drop-shadow-sm">需要代課</div>
                              ) : (
                                <div className="text-green-700 font-bold text-base">{log.subName}</div>
                              )}
                              <div className="text-xs text-gray-600 mt-1">{log.className || '(未輸入班別)'}</div>
                            </td>
                          );
                       })}
                       {absentCols.length === 0 && <td className="p-2 border-b border-gray-200"></td>}
                     </tr>
                   ))}
                </tbody>
             </table>
           </div>
        </div>
      </div>
    );
  };

  const renderTeachersView = () => (
    <div className="bg-white p-6 rounded-2xl shadow-xl border border-purple-100 space-y-4 animate-in fade-in zoom-in duration-300">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <h2 className="text-xl font-bold text-purple-800 flex items-center"><UserCheck className="mr-2"/> 教師設定</h2>
        <div className="flex gap-2">
          <button onClick={() => sortImportRef.current.click()} className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm shadow hover:bg-green-700 flex items-center"><Upload size={14} className="mr-1"/> 匯入排序</button>
          <input type="file" ref={sortImportRef} onChange={handleSortImport} className="hidden" />
          <button onClick={downloadTimetableTemplate} className="px-3 py-1.5 bg-purple-50 text-purple-700 rounded-lg text-sm border border-purple-200 hover:bg-purple-100"><Download size={14} className="inline mr-1"/>範本</button>
          <button onClick={() => timetableImportRef.current.click()} className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm shadow hover:bg-purple-700"><FileText size={14} className="inline mr-1"/>匯入課表</button>
          <button onClick={handleManualCloudUpload} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm shadow hover:bg-blue-700 flex items-center"><Upload size={14} className="mr-1"/> 手動上傳雲端</button>
          <input type="file" ref={timetableImportRef} onChange={e => handleCSVImport(e, 'timetable')} className="hidden" />
        </div>
      </div>
      <form onSubmit={addTeacher} className="flex gap-2">
        <input value={newTitle} onChange={e=>setNewTitle(e.target.value)} placeholder="職銜 (可留空)" className="border border-purple-200 p-2 rounded-lg w-28 focus:outline-none focus:ring-2 focus:ring-purple-400"/>
        <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="新老師姓名" className="border border-purple-200 p-2 rounded-lg flex-1 focus:outline-none focus:ring-2 focus:ring-purple-400"/>
        <button className="bg-fuchsia-600 text-white px-4 rounded-lg hover:bg-fuchsia-700 shadow"><Plus/></button>
      </form>
      <div className="overflow-x-auto rounded-xl border border-purple-100">
        <table className="w-full text-sm">
          <thead className="bg-purple-50 text-purple-900"><tr><th className="p-3 text-center w-16">排序</th><th className="p-3 text-left w-20">職銜</th><th className="p-3 text-left">姓名</th><th className="p-3 text-left">當日空堂</th><th className="p-3 text-center">刪除</th></tr></thead>
          <tbody className="divide-y divide-purple-50">{getSortedTeachers(teachers).map((t, index) => (
          <tr key={t.id} className="hover:bg-purple-50 bg-white">
          <td className="p-3">
             <div className="flex flex-col gap-1 items-center justify-center">
                <button type="button" onClick={() => moveTeacher(index, 'up')} disabled={index===0} className="text-gray-400 hover:text-purple-600 disabled:opacity-30 leading-none">▲</button>
                <button type="button" onClick={() => moveTeacher(index, 'down')} disabled={index===teachers.length-1} className="text-gray-400 hover:text-purple-600 disabled:opacity-30 leading-none">▼</button>
             </div>
          </td>
          <td className="p-3 text-gray-500 text-xs">{t.title || '-'}</td>
          <td className="p-3 font-medium">{t.name}</td>
          <td className="p-3 flex flex-wrap gap-1">{PERIODS.map(p => <button key={p} onClick={()=>toggleFreePeriod(t.id, p)} className={`w-7 h-7 rounded-full text-xs transition-all ${(t.freePeriods || []).includes(p)?'bg-green-100 text-green-700 border border-green-300 font-bold':'bg-gray-50 text-gray-300 border border-gray-100'}`}>{p}</button>)}</td>
          <td className="p-3 text-center"><button onClick={()=>deleteTeacher(t.id)} className="text-gray-300 hover:text-red-500"><Trash2 size={16}/></button></td></tr>
        ))}</tbody></table>
      </div>
    </div>
  );

  const renderStatsView = () => {
    // V3.6：動態計算當月統計
    const monthLogs = logs.filter(l => l.date.startsWith(statsMonth));
    const statsData = getSortedTeachers(teachers).map(t => {
      const monthAbs = monthLogs.filter(l => l.absentId === t.id).length;
      const monthSubs = monthLogs.filter(l => l.subId === t.id).length;
      return { ...t, monthAbs, monthSubs };
    });

    return (
      <div className="space-y-6 animate-in fade-in zoom-in duration-300">
        <div className="bg-white p-6 rounded-2xl shadow-xl border border-purple-100">
          <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
            <h2 className="text-xl font-bold text-purple-800 flex items-center"><BarChart3 className="mr-2"/> 每月缺代課統計</h2>
            <div className="flex items-center gap-3">
              <div className="flex items-center bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200">
                 <label className="text-sm text-gray-600 mr-2 font-bold">選擇月份:</label>
                 <input type="month" value={statsMonth} onChange={e => setStatsMonth(e.target.value)} className="border-none bg-transparent outline-none text-purple-700 font-bold" />
              </div>
              <button onClick={exportStatsToCSV} className="px-3 py-1.5 bg-fuchsia-600 text-white rounded-lg text-sm shadow hover:bg-fuchsia-700 flex items-center"><Download size={14} className="mr-1"/>匯出 CSV</button>
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border border-purple-100">
            <table className="w-full text-sm bg-white">
              <thead className="bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white"><tr><th className="p-3 text-left w-20">職銜</th><th className="p-3 text-left">姓名</th><th className="p-3 text-center">{statsMonth} 缺課</th><th className="p-3 text-center">{statsMonth} 代課</th><th className="p-3 text-center">淨值</th></tr></thead>
              <tbody className="divide-y divide-purple-50">{statsData.map(t => (
                <tr key={t.id} className="hover:bg-purple-50">
                <td className="p-3 text-gray-500 text-xs">{t.title || '-'}</td>
                <td className="p-3 font-medium">{t.name}</td>
                <td className="p-3 text-center text-red-500 font-bold">{t.monthAbs}</td>
                <td className="p-3 text-center text-purple-600 font-bold">{t.monthSubs}</td>
                <td className={`p-3 text-center font-bold ${t.monthSubs - t.monthAbs > 0 ? 'text-green-600' : t.monthSubs - t.monthAbs < 0 ? 'text-orange-500' : 'text-gray-400'}`}>{t.monthSubs - t.monthAbs > 0 ? '+' : ''}{t.monthSubs - t.monthAbs}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
        <div className="bg-gradient-to-r from-gray-50 to-purple-50 p-6 rounded-2xl shadow-inner border border-purple-100">
          <h3 className="font-bold text-gray-700 mb-2 flex items-center"><Save className="mr-2" size={18}/> 備份與還原</h3>
          <div className="flex gap-3 mt-3">
            <button onClick={downloadBackup} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm shadow hover:bg-blue-700 transition-colors flex items-center"><Download size={14} className="mr-2"/>下載備份</button>
            <button onClick={()=>backupImportRef.current.click()} className="bg-white text-gray-700 border border-gray-300 px-4 py-2 rounded-lg text-sm shadow-sm hover:bg-gray-50 transition-colors flex items-center"><RefreshCw size={14} className="mr-2"/>還原備份</button>
            <input type="file" ref={backupImportRef} onChange={restoreBackup} className="hidden" />
          </div>
          {lastSaved && <p className="text-xs text-green-600 text-right mt-2 flex justify-end items-center"><CheckCircle size={10} className="mr-1"/>上次雲端同步: {lastSaved.toLocaleTimeString()}</p>}
        </div>
      </div>
    );
  };

  const renderReportView = () => {
    // V3.6：每日紀錄名單
    const dailyLogs = logs.filter(l => l.date === formDate).sort((a,b) => a.period - b.period);
    const uniqueAbsents = [...new Set(dailyLogs.map(l => l.absentName))];

    return (
      <div className="bg-white p-6 rounded-2xl shadow-xl border border-purple-100 animate-in fade-in zoom-in duration-300">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-purple-800 flex items-center"><Clock className="mr-2"/> 每日代課名單</h2>
          <div className="flex items-center">
            <label className="text-sm font-bold text-purple-700 mr-2">日期:</label>
            <input type="date" value={formDate} onChange={e=>setFormDate(e.target.value)} className="border border-purple-200 p-1.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400 text-sm"/>
          </div>
        </div>

        <div className="mb-6 bg-red-50 p-4 rounded-xl border border-red-100">
          <h3 className="font-bold text-red-800 border-l-4 border-red-500 pl-2 mb-3">今日缺席名單 ({uniqueAbsents.length}人)</h3>
          <div className="flex flex-wrap gap-2">
            {uniqueAbsents.map(name => {
               const reason = dailyLogs.find(l => l.absentName === name)?.reason;
               return <span key={name} className="bg-white text-red-700 px-3 py-1.5 rounded-lg shadow-sm font-medium border border-red-100">{name} <span className="text-xs text-gray-500 ml-1">({reason})</span></span>;
            })}
            {uniqueAbsents.length === 0 && <span className="text-gray-400 text-sm">本日無缺席紀錄</span>}
          </div>
        </div>

        <div>
          <h3 className="font-bold text-purple-800 border-l-4 border-purple-500 pl-2 mb-3">代課安排明細</h3>
          <div className="overflow-hidden rounded-xl border border-purple-100 shadow-sm">
            <table className="min-w-full bg-white text-sm">
              <thead className="bg-gradient-to-r from-purple-50 to-pink-50 text-purple-900">
                <tr>
                  <th className="p-3 text-center">節次</th>
                  <th className="p-3 text-center">班別</th>
                  <th className="p-3 text-center text-red-600">缺席老師</th>
                  <th className="p-3 text-center text-green-700">代課老師</th>
                  <th className="p-3 text-left">備註</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-purple-50">
                {dailyLogs.map(l => (
                  <tr key={l.id} className="hover:bg-purple-50 transition-colors text-center">
                    <td className="p-3 font-bold text-purple-700">{l.period}</td>
                    <td className="p-3">{l.className || '-'}</td>
                    <td className="p-3 text-red-500 font-medium">{l.absentName}</td>
                    <td className="p-3 font-bold text-green-600">{l.subName || '未安排'}</td>
                    <td className="p-3 text-xs text-orange-500 text-left">{l.note}</td>
                  </tr>
                ))}
                {dailyLogs.length === 0 && <tr><td colSpan="5" className="p-8 text-gray-400 text-center border-dashed border-2">本日無需要代課的節次</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-fuchsia-50 flex flex-col items-center justify-center">
        <Loader2 className="w-12 h-12 text-purple-600 animate-spin mb-4" />
        <h2 className="text-xl font-bold text-purple-800">正在同步資料 (V3.6)...</h2>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-fuchsia-50 font-sans text-gray-800 pb-10 selection:bg-fuchsia-200">
      {renderModal()}
      <nav className="bg-gradient-to-r from-purple-700 via-fuchsia-600 to-pink-600 text-white shadow-lg sticky top-0 z-40 backdrop-blur-md bg-opacity-90">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center">
             <div className="font-bold text-xl flex items-center tracking-wide mr-3"><Calendar className="mr-2"/> 智慧代課系統 V3.6</div>
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
      <main className="max-w-[1200px] mx-auto p-4 py-6">
        {currentView==='arrange' && renderArrangeView()}
        {currentView==='teachers' && renderTeachersView()}
        {currentView==='stats' && renderStatsView()}
        {currentView==='report' && renderReportView()}
      </main>
    </div>
  );
}
