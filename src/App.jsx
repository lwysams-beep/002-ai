import React, { useState, useEffect, useRef } from 'react';
import { Users, Calendar, BarChart3, Clock, Plus, Trash2, UserCheck, Search, X, AlertCircle, CheckCircle, Upload, Download, FileText, Star, Cloud, CloudOff, Loader2, Save, RefreshCw, Image as ImageIcon } from 'lucide-react';
import { doc, getDoc, setDoc } from "firebase/firestore";

// --- 常數設定 ---
const TOTAL_PERIODS = 9;
const PERIODS = Array.from({ length: TOTAL_PERIODS }, (_, i) => i + 1);
const CORE_SUBJECTS = ['中文', '英文', '數學', 'CHI', 'ENG', 'MATH', 'CHINESE', 'ENGLISH', 'MATHEMATICS'];
const ABSENT_REASONS = ['病假', '事假', '進修', '覆診', '遲返', '早退', '交流', '帶隊'];

const STORAGE_KEY_TEACHERS = 'substitution_system_teachers_data_v3';
const STORAGE_KEY_LOGS = 'substitution_system_logs_data_v3';

const getInitialDate = () => {
  const d = new Date();
  const day = d.getDay();
  if (day === 6) d.setDate(d.getDate() + 2);
  else if (day === 0) d.setDate(d.getDate() + 1);
  return new Date(d - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
};

export default function SubstitutionApp() {
  const [teachers, setTeachers] = useState([]);
  const [logs, setLogs] = useState([]); 
  const [isCloudEnabled, setIsCloudEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [lastSaved, setLastSaved] = useState(null);
  const [saveStatus, setSaveStatus] = useState('idle');
  const dbRef = useRef(null);

  const [currentView, setCurrentView] = useState('arrange'); 
  const [formDate, setFormDate] = useState(getInitialDate());
  
  const [newAbsentId, setNewAbsentId] = useState('');
  const [newAbsentReason, setNewAbsentReason] = useState('病假');
  const [activeCell, setActiveCell] = useState(null); 
  
  const [statsMonth, setStatsMonth] = useState(new Date().toISOString().slice(0, 7));
  const [newTitle, setNewTitle] = useState(''); 
  const [newName, setNewName] = useState(''); 

  const teacherImportRef = useRef(null);
  const timetableImportRef = useRef(null);
  const backupImportRef = useRef(null);
  const sortImportRef = useRef(null);

  const [modal, setModal] = useState({ isOpen: false, type: 'info', title: '', message: '', onConfirm: null });
  const [swapModal, setSwapModal] = useState({ isOpen: false, logId: null, subTeacher: null, options: [], selectedOption: null });

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
            setTeachers(Array.isArray(data.teachers) ? data.teachers : []);
            setLogs(Array.isArray(data.logs) ? data.logs : []);
            setLastSaved(data.lastUpdated ? new Date(data.lastUpdated) : new Date());
            loadedFromCloud = true;
            setIsCloudEnabled(true); 
          } else setIsCloudEnabled(true); 
        } catch (error) { setIsCloudEnabled(false); }
      }

      if (!loadedFromCloud) {
        let localTeachers = localStorage.getItem(STORAGE_KEY_TEACHERS);
        let localLogs = localStorage.getItem(STORAGE_KEY_LOGS);
        if (localTeachers) {
          try { setTeachers(JSON.parse(localTeachers) || []); } catch(e) { setTeachers([]); }
        } else {
          setTeachers([{ id: 1, title: "", name: "陳大文", freePeriods: [], masterSchedule: {}, scheduleDetails: {}, sortOrder: 9999 }]);
        }
        if (localLogs) {
          try { setLogs(JSON.parse(localLogs) || []); } catch(e) { setLogs([]); }
        }
      }
      setIsLoading(false);
    };
    initData();
  }, []);

  useEffect(() => {
    if (isLoading) return;
    const safeTeachers = Array.isArray(teachers) ? teachers : [];
    const safeLogs = Array.isArray(logs) ? logs : [];
    localStorage.setItem(STORAGE_KEY_TEACHERS, JSON.stringify(safeTeachers));
    localStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(safeLogs));

    const timer = setTimeout(async () => {
      if (isCloudEnabled && dbRef.current) {
        try {
          await setDoc(doc(dbRef.current, "school_data", "main_backup_v3"), {
            teachers: safeTeachers, logs: safeLogs, lastUpdated: new Date().toISOString()
          });
          setLastSaved(new Date());
        } catch (e) {}
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [teachers, logs, isCloudEnabled, isLoading]);

  const showAlert = (title, message) => setModal({ isOpen: true, type: 'info', title, message });
  const showConfirm = (title, message, onConfirm) => setModal({ isOpen: true, type: 'confirm', title, message, onConfirm });
  const closeModal = () => setModal({ ...modal, isOpen: false });

  const getSortedTeachers = (list) => {
    if (!Array.isArray(list)) return [];
    return [...list].sort((a, b) => {
      const orderA = a.sortOrder !== undefined ? a.sortOrder : 9999;
      const orderB = b.sortOrder !== undefined ? b.sortOrder : 9999;
      if (orderA !== orderB) return orderA - orderB;
      return (a.name || '').localeCompare(b.name || '', "zh-HK");
    });
  };

  const downloadImage = (elementId, filename) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    script.onload = () => {
      window.html2canvas(document.getElementById(elementId), { scale: 2 }).then(canvas => {
        const link = document.createElement('a');
        link.download = filename;
        link.href = canvas.toDataURL('image/png');
        link.click();
      });
    };
    document.body.appendChild(script);
  };

  useEffect(() => { setActiveCell(null); }, [formDate]);

  const handleAddAbsent = () => {
    if (!newAbsentId) return showAlert("提示", "請選擇缺席老師");
    const safeTeachers = Array.isArray(teachers) ? teachers : [];
    const safeLogs = Array.isArray(logs) ? logs : [];
    const t = safeTeachers.find(x => x.id == newAbsentId);
    if (!t) return;
    
    const dayOfWeek = new Date(formDate).getDay();
    const busy = t.masterSchedule?.[dayOfWeek] || [];
    const existing = safeLogs.filter(l => l?.date === formDate && l?.absentId == newAbsentId).map(l => l.period);
    
    const newLogs = [];
    busy.forEach(p => {
      if (!existing.includes(p)) {
        const detail = t.scheduleDetails?.[`${dayOfWeek}-${p}`];
        const cName = detail?.className || '';
        const isSClass = detail?.isSupport === true || cName.toUpperCase().includes('S');
        
        newLogs.push({
          id: Date.now() + Math.random(),
          date: formDate, period: p, className: cName,
          absentName: t.name || '未知', absentId: t.id, reason: newAbsentReason,
          subName: isSClass ? 'S班取消' : null, subId: isSClass ? 'CANCELLED' : null,
          note: '', isSwap: false, timestamp: new Date().toLocaleString()
        });
      }
    });
    
    if (newLogs.length > 0) setLogs(prev => [...(Array.isArray(prev)?prev:[]), ...newLogs]);
    else showAlert("提示", "該老師今日無排定課堂，或已全數加入缺席名單。");
    setNewAbsentId('');
  };

  const handleDeleteAbsentTeacher = (absentId) => {
    const safeTeachers = Array.isArray(teachers) ? teachers : [];
    const t = safeTeachers.find(x => x.id === absentId);
    const name = t ? t.name : '該老師';
    showConfirm("刪除確認", `確定要刪除 ${name} 今日的所有缺席及代課紀錄嗎？`, () => {
      setLogs(prev => {
         const safeLogs = Array.isArray(prev) ? prev : [];
         return safeLogs.filter(l => !(l.date === formDate && l.absentId === absentId));
      });
      if (activeCell?.absentId === absentId) setActiveCell(null);
      closeModal();
    });
  };

  const getCategorizedTeachers = () => {
    if (!activeCell) return { recommended: [], subbedOne: [], notArranged: [] };
    const p = activeCell.period;
    const dayOfWeek = new Date(formDate).getDay();
    const targetKey = `${dayOfWeek}-${p}`; 
    const normClass = (activeCell.className || '').trim().toUpperCase();
    const dailyLogs = (Array.isArray(logs)?logs:[]).filter(l => l?.date === formDate);
    const absentTeacherIds = [...new Set(dailyLogs.map(l => l.absentId))].filter(Boolean); 

    const allMapped = (Array.isArray(teachers)?teachers:[]).map(t => {
      const subbedLogs = dailyLogs.filter(log => log?.subId == t.id);
      const extraSubCount = subbedLogs.filter(l => !l.isSwap).length; 
      const baseFree = Array.isArray(t.freePeriods) ? t.freePeriods : [];
      const actualFreeCount = baseFree.length - extraSubCount;

      const title = (t.title || '').toUpperCase();
      const isExtSub = title.includes('外聘') || title.includes('代課');
      const isIntern = title.includes('實習');
      const isPT = title.includes('PT');
      const isTA = title.includes('TA');
      const isSpecialRole = isExtSub || isIntern || isPT || isTA;

      let rolePriority = 5;
      if (isExtSub) rolePriority = 1;
      else if (isIntern) rolePriority = 2;
      else if (isPT) rolePriority = 3;
      else if (isTA) rolePriority = 4;

      const detail = t.scheduleDetails?.[targetKey];
      const isSupport = detail?.isSupport === true;
      const supportClass = detail?.className || '';
      
      const isFreeAtP = baseFree.includes(p) && !subbedLogs.some(l => l.period === p && !l.isSwap);
      const canSubAtP = isFreeAtP || isSupport; 
      const currentStatus = isFreeAtP ? '空堂' : '入班';

      return {
          ...t, freePeriods: baseFree, extraSubCount, actualFreeCount, isSpecialRole, rolePriority, 
          isPT, isTA, isSupport, supportClass, currentStatus, canSubAtP,
          isAbsent: absentTeacherIds.includes(t.id)
      };
    });

    const recommended = [];
    const subbedOne = [];
    const notArranged = [];

    allMapped.forEach(t => {
      if (t.id == activeCell.absentId) return; 
      if (t.isAbsent || (!t.isSpecialRole && t.freePeriods.length <= 2)) {
          notArranged.push(t);
      } else if (t.canSubAtP) {
          if (t.extraSubCount >= 1) subbedOne.push(t);
          else recommended.push(t);
      }
    });

    const sorter = (a, b) => {
      if (a.rolePriority !== b.rolePriority) return a.rolePriority - b.rolePriority;
      if (a.extraSubCount !== b.extraSubCount) return a.extraSubCount - b.extraSubCount;
      if (a.actualFreeCount !== b.actualFreeCount) return b.actualFreeCount - a.actualFreeCount;
      return (a.name || '').localeCompare(b.name || '', "zh-HK");
    };
    return { recommended: recommended.sort(sorter), subbedOne: subbedOne.sort(sorter), notArranged: notArranged.sort(sorter) };
  };

  const commitAssign = (logId, subId, subName, note, isSwap) => {
    setLogs(prev => (Array.isArray(prev)?prev:[]).map(l => l.id === logId ? { ...l, subId, subName, note, isSwap } : l));
    setActiveCell(null);
  };

  const handleAssignSub = (t) => {
    if (!t) return;
    const dayOfWeek = new Date(formDate).getDay();

    if (t.isPT || t.isTA) {
        if (t.currentStatus === '入班') {
            const note = `(${t.supportClass || '未知'}不入班)`;
            commitAssign(activeCell.logId, t.id, t.name, note, true);
        } else {
            const busyPeriods = t.masterSchedule?.[dayOfWeek] || [];
            const options = busyPeriods.map(bp => {
                const detail = t.scheduleDetails?.[`${dayOfWeek}-${bp}`];
                if (detail?.isSupport) return { period: bp, className: detail.className };
                return null;
            }).filter(Boolean);
            
            options.unshift({ period: -1, className: '不轉堂 (當作額外代課)' });
            setSwapModal({ isOpen: true, logId: activeCell.logId, subTeacher: t, options, selectedOption: options[0] });
        }
    } else {
        const note = t.isSupport ? (t.supportClass ? `(${t.supportClass}不抽離)` : `(支援不抽離)`) : '';
        commitAssign(activeCell.logId, t.id, t.name, note, false);
    }
  };

  const handleSwapConfirm = () => {
    const opt = swapModal.selectedOption;
    const t = swapModal.subTeacher;
    if (opt.period === -1) {
        if (t.actualFreeCount - 1 < 2) {
            showConfirm("警告", `此老師代課後，當日空堂將不足2節 (剩餘 ${t.actualFreeCount - 1} 節)。確定要強行安排嗎？`, () => {
                commitAssign(swapModal.logId, t.id, t.name, '(額外代課)', false);
                setSwapModal({ isOpen: false }); closeModal();
            });
        } else {
            commitAssign(swapModal.logId, t.id, t.name, '(額外代課)', false);
            setSwapModal({ isOpen: false });
        }
    } else {
        commitAssign(swapModal.logId, t.id, t.name, `(第${opt.period}節轉上，${opt.className}不入班)`, true);
        setSwapModal({ isOpen: false });
    }
  };

  const handleRemoveSub = () => {
    setLogs(prev => (Array.isArray(prev)?prev:[]).map(l => l.id === activeCell.logId ? { ...l, subId: null, subName: null, note: '', isSwap: false } : l));
    setActiveCell(prev => ({...prev, subId: null, subName: null, note: '', isSwap: false}));
  };

  const handleDeleteLog = () => {
    setLogs(prev => (Array.isArray(prev)?prev:[]).filter(l => l.id !== activeCell.logId));
    setActiveCell(null);
  };
  const addTeacher = (e) => {
    e.preventDefault();
    if(newName.trim()) {
      setTeachers(prev => [...(Array.isArray(prev)?prev:[]), { id: Date.now(), title: newTitle.trim(), name: newName.trim(), freePeriods: [], masterSchedule: {}, scheduleDetails: {}, sortOrder: 9999 }]);
      setNewTitle(''); setNewName('');
    }
  };

  const deleteTeacher = (id) => showConfirm("刪除確認", "確定要刪除這位老師嗎？", () => {
    setTeachers(prev => (Array.isArray(prev)?prev:[]).filter(t => t.id !== id));
    closeModal();
  });
  
  const toggleFreePeriod = (teacherId, period) => {
    setTeachers(prev => (Array.isArray(prev)?prev:[]).map(t => {
      if (t.id === teacherId) {
        const fp = Array.isArray(t.freePeriods) ? t.freePeriods : [];
        return { ...t, freePeriods: fp.includes(period) ? fp.filter(p => p !== period) : [...fp, period].sort((a, b) => a - b) };
      }
      return t;
    }));
  };

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
          let newTeachers = [...(Array.isArray(prev)?prev:[])];
          newTeachers.forEach(t => {
             const found = sortData.find(s => s.name === t.name);
             if (found) { t.sortOrder = sortData.indexOf(found); t.title = found.title || t.title; } 
             else { t.sortOrder = 9999; }
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

  const handleCSVImport = async (e, type) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const rows = ev.target.result.split('\n').map(r => r.trim()).filter(r => r);
        let newTeachers = [...(Array.isArray(teachers)?teachers:[])];
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
             detailsMap[name][`${day}-${period}`] = { className: (cols[3]||'').trim().toUpperCase(), subject: (cols[4]||'').trim(), isSupport: ['是','y','yes'].includes((cols[5]||'').trim().toLowerCase()) };
          }
          
          const currentDayOfWeek = new Date(formDate).getDay();
          newTeachers = newTeachers.map(t => {
              const mSchedule = scheduleMap[t.name] || {};
              const busy = mSchedule[currentDayOfWeek] || [];
              const free = (currentDayOfWeek >= 1 && currentDayOfWeek <= 5) ? PERIODS.filter(p => !busy.includes(p)) : [];
              return { ...t, masterSchedule: mSchedule, scheduleDetails: detailsMap[t.name] || {}, freePeriods: free };
          });
          
          Object.keys(scheduleMap).forEach(name => {
             if(!newTeachers.find(t => t.name === name)) {
                 const mSchedule = scheduleMap[name];
                 const busy = mSchedule[currentDayOfWeek] || [];
                 const free = (currentDayOfWeek >= 1 && currentDayOfWeek <= 5) ? PERIODS.filter(p => !busy.includes(p)) : [];
                 newTeachers.push({ id: Date.now()+Math.random(), title: "", name, freePeriods: free, masterSchedule: mSchedule, scheduleDetails: detailsMap[name] || {}, sortOrder: 9999 });
             }
          });
        }
        setTeachers(newTeachers);
        if (isCloudEnabled && dbRef.current) {
            await setDoc(doc(dbRef.current, "school_data", "main_backup_v3"), { teachers: newTeachers, logs: Array.isArray(logs)?logs:[], lastUpdated: new Date().toISOString() });
            setLastSaved(new Date());
        }
        showAlert("匯入成功", "舊課表已清除，空堂已自動計算並上載至雲端。");
      } catch (err) { showAlert("錯誤", "格式有誤或上載失敗"); }
      e.target.value = '';
    };
    reader.readAsText(file);
  };

  const exportStatsToCSV = () => {
    const monthLogs = (Array.isArray(logs)?logs:[]).filter(l => (l?.date || '').startsWith(statsMonth));
    let csv = `\ufeff職銜,姓名,${statsMonth} 缺課,${statsMonth} 代課,淨值\n`;
    getSortedTeachers(teachers).forEach(t => {
      const monthAbs = monthLogs.filter(l => l?.absentId === t.id).length;
      const monthSubs = monthLogs.filter(l => l?.subId === t.id && l?.subId !== 'CANCELLED' && !l?.isSwap).length; 
      csv += `${t?.title||''},${t?.name||''},${monthAbs},${monthSubs},${monthSubs - monthAbs}\n`;
    });
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a'); link.href = url; link.setAttribute('download', `stats_${statsMonth}.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  const downloadTimetableTemplate = () => {
    const csvContent = "\ufeff姓名,星期(1-5),節次(1-9),班級(重要),科目,是否入班(是/否)\n陳大文,1,1,3A,數學,否\n李小美,1,3,1C,英文,否";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.setAttribute('download', 'timetable_template_v3.csv');
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  const downloadBackup = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ teachers, logs, backupDate: new Date().toISOString() }, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.setAttribute('download', `backup.json`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  const restoreBackup = (e) => {
    const file = e.target.files[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if(data.teachers && window.confirm("確定還原？")) {
          setTeachers(Array.isArray(data.teachers)?data.teachers:[]); setLogs(Array.isArray(data.logs)?data.logs:[]); showAlert("成功", "已還原。");
        }
      } catch(err) { showAlert("錯誤", "檔案無效"); }
      e.target.value = '';
    };
    reader.readAsText(file);
  };

  const renderModal = () => {
    if (!modal.isOpen) return null;
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in border border-purple-100">
          <div className="p-4 border-b border-purple-100 flex justify-between bg-purple-50"><h3 className="font-bold text-lg text-purple-900">{modal.title}</h3><button onClick={closeModal} className="text-purple-400 hover:text-purple-600"><X size={20} /></button></div>
          <div className="p-5 text-gray-700 whitespace-pre-wrap">{modal.message}</div>
          <div className="p-4 border-t border-purple-100 bg-purple-50 flex justify-end gap-3">
            {modal.type === 'confirm' ? (<><button onClick={closeModal} className="px-4 py-2 text-gray-600 bg-white border rounded hover:bg-gray-50">取消</button><button onClick={modal.onConfirm} className="px-4 py-2 text-white bg-purple-600 rounded hover:bg-purple-700">確定</button></>) : (<button onClick={closeModal} className="px-4 py-2 text-white bg-purple-600 rounded w-full">知道了</button>)}
          </div>
        </div>
      </div>
    );
  };

  const renderSwapModal = () => {
    if (!swapModal.isOpen) return null;
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in border border-blue-100">
          <div className="p-4 border-b border-blue-100 bg-blue-50"><h3 className="font-bold text-lg text-blue-900">選擇轉空堂的節次</h3><p className="text-sm text-gray-600 mt-1">請選擇 <strong>{swapModal.subTeacher?.name}</strong> 老師哪一節入班轉為空堂：</p></div>
          <div className="p-5">
            <select className="w-full border border-gray-300 p-2 rounded focus:border-blue-500 outline-none" value={swapModal.selectedOption?.period} onChange={(e) => { setSwapModal({ ...swapModal, selectedOption: swapModal.options.find(o => o.period == e.target.value) }); }}>
              {swapModal.options.map(o => (<option key={o.period} value={o.period}>{o.period === -1 ? o.className : `第 ${o.period} 節 - ${o.className} 班`}</option>))}
            </select>
          </div>
          <div className="p-4 border-t border-blue-100 bg-blue-50 flex justify-end gap-3">
            <button onClick={() => setSwapModal({ isOpen: false })} className="px-4 py-2 text-gray-600 bg-white border rounded hover:bg-gray-50">取消</button><button onClick={handleSwapConfirm} className="px-4 py-2 text-white bg-blue-600 rounded hover:bg-blue-700">確定</button>
          </div>
        </div>
      </div>
    );
  };

  const renderTeacherList = (title, list, emptyMsg) => (
    <div className="mb-4">
      <div className="text-xs text-purple-700 mb-2 font-bold flex justify-between"><span>{title}</span></div>
      <div className="space-y-2">
         {list.map(t => (
           <div key={t.id} className="flex justify-between items-center p-2 bg-white border border-gray-200 rounded-lg shadow-sm hover:border-purple-400 transition-colors">
              <div>
                <div className="font-bold text-sm text-gray-800">{t.title ? `[${t.title}] ` : ''}{t.name}</div>
                <div className="text-xs text-gray-500 mt-0.5">額外已代: <span className="font-bold text-purple-600">{t.extraSubCount}</span> 節 | 剩餘空堂: {t.actualFreeCount}</div>
                {t.rolePriority === 1 && <div className="text-[10px] text-indigo-600 font-bold mt-1 bg-indigo-50 inline-block px-1 rounded border border-indigo-200 mr-1">外聘代課</div>}
                {t.rolePriority === 2 && <div className="text-[10px] text-teal-600 font-bold mt-1 bg-teal-50 inline-block px-1 rounded border border-teal-200 mr-1">實習</div>}
                {t.isSpecialRole && t.rolePriority > 2 && ( <div className={`text-[10px] font-bold mt-1 inline-block px-1 rounded border mr-1 ${t.currentStatus === '空堂' ? 'text-green-600 bg-green-50 border-green-200' : 'text-orange-600 bg-orange-50 border-orange-200'}`}>{t.isPT ? 'PT' : 'TA'} ({t.currentStatus})</div> )}
                {t.isSupport && t.rolePriority >= 5 && <div className="text-[10px] text-orange-600 mt-1 bg-orange-50 inline-block px-1 rounded mr-1">抽離 ({t.supportClass})</div>}
              </div>
              {title !== "不安排名單" && <button type="button" onClick={() => handleAssignSub(t)} className="px-3 py-1.5 bg-gradient-to-r from-purple-500 to-fuchsia-500 text-white rounded text-xs shadow">指派</button>}
              {title === "不安排名單" && <div className="text-xs text-red-400 font-bold">{t.isAbsent ? '缺席' : '空堂≤2'}</div>}
           </div>
         ))}
         {list.length === 0 && <div className="text-center text-gray-400 text-sm py-2 border border-dashed rounded-lg">{emptyMsg}</div>}
      </div>
    </div>
  );

  const renderArrangeView = () => {
    const safeLogs = Array.isArray(logs) ? logs : [];
    const dailyLogs = safeLogs.filter(l => l?.date === formDate);
    const uniqueAbsentIds = [...new Set(dailyLogs.map(l => l?.absentId))].filter(Boolean);
    const absentCols = uniqueAbsentIds.map(id => {
      const log = dailyLogs.find(l => l?.absentId === id);
      return { id, name: log?.absentName || '未知', reason: log?.reason || '其他' };
    });
    
    const { recommended, subbedOne, notArranged } = getCategorizedTeachers();

    return (
      <div className="flex flex-col md:flex-row gap-4 h-[75vh]">
        <div className="w-full md:w-1/3 bg-white p-4 rounded-xl border border-purple-100 shadow-sm flex flex-col h-full overflow-hidden animate-in fade-in">
          <h3 className="font-bold text-lg text-purple-900 mb-3 border-b border-purple-100 pb-2 flex items-center"><Star className="mr-2 text-fuchsia-500" size={18}/> 安排操作</h3>
          {!activeCell ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 text-sm p-4 text-center border-2 border-dashed border-gray-100 rounded-lg"><Search size={40} className="mb-2 text-gray-300"/>請在右方表格點選<br/>「需要代課」的格子來安排</div>
          ) : (
            <div className="flex flex-col h-full overflow-hidden">
              <div className="bg-purple-50 p-3 rounded-lg mb-4 text-sm shadow-sm border border-purple-100 shrink-0">
                <p><strong>缺席:</strong> {activeCell.absentName} ({activeCell.reason})</p><p><strong>節次:</strong> 第 {activeCell.period} 節</p>
                <div className="flex items-center mt-2"><strong className="mr-2">班別:</strong><input type="text" value={activeCell.className || ''} onChange={(e) => { const val = e.target.value; setActiveCell(prev => ({...prev, className: val})); setLogs(prev => (Array.isArray(prev)?prev:[]).map(l => l.id === activeCell.logId ? {...l, className: val} : l)); }} className="border p-1 rounded w-20 text-xs outline-none focus:border-purple-400 bg-white" /></div>
                {activeCell.subId && activeCell.subId !== 'CANCELLED' && ( <div className="mt-3 p-2 bg-green-100 text-green-800 rounded flex justify-between items-center border border-green-200"><div>已指派: <strong>{activeCell.subName}</strong><br/><span className="text-[10px] text-green-600 font-bold">{activeCell.note}</span></div><button onClick={handleRemoveSub} className="text-xs bg-white text-red-500 px-2 py-1 rounded shadow-sm hover:bg-red-50 border border-red-100 shrink-0">移除代課</button></div> )}
                {activeCell.subId === 'CANCELLED' && ( <div className="mt-3 p-2 bg-gray-200 text-gray-600 rounded flex justify-between items-center border border-gray-300"><span>狀態: <strong>自動取消</strong></span><button onClick={handleRemoveSub} className="text-xs bg-white text-purple-600 px-2 py-1 rounded shadow-sm hover:bg-purple-50 border border-purple-200">還原代課</button></div> )}
                <div className="mt-3 pt-3 border-t border-purple-200 text-right"><button onClick={handleDeleteLog} className="text-xs text-red-500 hover:underline flex items-center justify-end w-full"><Trash2 size={12} className="mr-1"/> 刪除此節缺課紀錄</button></div>
              </div>
              <div className="flex-1 overflow-y-auto pr-1">
                 {activeCell.subId !== 'CANCELLED' ? ( <>{renderTeacherList("推薦代課名單", recommended, "無優先推薦老師")}{renderTeacherList("額外1節名單 (已代1節)", subbedOne, "無老師在此名單")}{renderTeacherList("不安排名單", notArranged, "無老師在此名單")}</> ) : ( <div className="text-center text-gray-400 text-sm py-8 border border-dashed rounded-lg mt-4">課堂已取消</div> )}
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 bg-white p-4 rounded-xl border border-purple-100 shadow-sm flex flex-col h-full animate-in fade-in">
           <div className="flex flex-wrap justify-between items-end mb-4 border-b border-gray-100 pb-4">
              <div className="flex flex-col gap-3">
                  <div className="flex gap-3 items-end">
                      <div><label className="block text-xs font-bold text-purple-700 mb-1">日期</label><input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} className="border border-purple-200 p-1.5 rounded outline-none focus:border-purple-500 text-sm" /></div>
                      <div className="flex items-end gap-2 bg-gray-50 p-2 rounded-lg border border-gray-200">
                        <div><label className="block text-[10px] text-gray-500 mb-0.5">新增缺席老師</label><select value={newAbsentId} onChange={e=>setNewAbsentId(e.target.value)} className="border border-gray-300 p-1 rounded text-sm w-32 outline-none focus:border-purple-400"><option value="">請選擇...</option>{getSortedTeachers(teachers).map(t => <option key={t.id} value={t.id}>{t.title ? `[${t.title}] ` : ''}{t.name}</option>)}</select></div>
                        <div><label className="block text-[10px] text-gray-500 mb-0.5">原因</label><select value={newAbsentReason} onChange={e=>setNewAbsentReason(e.target.value)} className="border border-gray-300 p-1 rounded text-sm w-20 outline-none focus:border-purple-400">{ABSENT_REASONS.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
                        <button onClick={handleAddAbsent} className="bg-purple-600 text-white px-3 py-1 rounded shadow hover:bg-purple-700 text-sm h-[30px] flex items-center"><Plus size={14} className="mr-1"/> 加入</button>
                      </div>
                  </div>
                  
                  {uniqueAbsentIds.length > 0 && (
                    <div className="flex flex-wrap gap-2 items-center bg-red-50 p-2 rounded-lg border border-red-100 text-sm">
                        <span className="font-bold text-red-800 text-xs">缺席名單:</span>
                        {uniqueAbsentIds.map(id => {
                           const cName = absentCols.find(c => c.id === id)?.name || '未知';
                           return (
                             <span key={id} className="bg-white text-red-700 px-2 py-1 rounded shadow-sm border border-red-100 flex items-center gap-1 text-xs font-medium">
                               {cName}
                               <Trash2 size={12} className="cursor-pointer hover:text-red-900" onClick={() => handleDeleteAbsentTeacher(id)}/>
                             </span>
                           );
                        })}
                    </div>
                  )}
              </div>
              <button onClick={() => downloadImage('arrange-table-capture', `代課安排_${formDate}.png`)} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg shadow text-sm hover:bg-blue-700 flex items-center h-[34px] self-end"><ImageIcon size={14} className="mr-1"/> 下載圖片</button>
           </div>
           <div className="flex-1 overflow-auto rounded-lg border border-gray-200" id="arrange-table-capture">
             <table className="w-full text-sm text-center border-collapse min-w-max bg-white">
                <thead className="bg-purple-50 sticky top-0 z-20 shadow-sm">
                   <tr>
                     <th className="p-2 border-b border-r border-gray-200 min-w-[60px] bg-purple-100 sticky left-0 z-30">節次</th>
                     {absentCols.map(c => ( <th key={c.id} className="p-2 border-b border-gray-200 min-w-[140px] bg-purple-50"><div className="font-bold text-purple-900 text-base">{c.name}</div><div className="text-[10px] text-red-500 bg-red-50 rounded px-1 inline-block mt-0.5 border border-red-100">{c.reason}</div></th> ))}
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
                          const isCancelled = log.subId === 'CANCELLED';
                          return (
                            <td key={c.id} onClick={() => setActiveCell({...log, logId: log.id})} className={`p-2 border-b cursor-pointer transition-all ${isActive ? 'bg-purple-100 ring-2 ring-inset ring-purple-500' : isCancelled ? 'bg-gray-100 border-x border-gray-200' : !log.subId ? 'bg-red-50 hover:bg-red-100 border-x border-red-100' : 'bg-green-50 hover:bg-green-100 border-x border-green-100'}`}>
                              {isCancelled ? ( <div className="text-gray-500 font-bold text-sm">S班取消</div> ) : !log.subId ? ( <div className="text-red-500 font-bold text-sm drop-shadow-sm">需要代課</div> ) : ( <div><div className="text-green-700 font-bold text-base">{log.subName}</div>{log.note && <div className="text-[10px] text-orange-600 font-bold mt-0.5 leading-tight">{log.note}</div>}</div> )}
                              <div className="text-[11px] text-gray-500 mt-1">{log.className || '(未輸入班別)'}</div>
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

  const renderTeachersView = () => {
    return (
      <div className="bg-white p-6 rounded-2xl shadow-xl border border-purple-100 space-y-4 animate-in fade-in zoom-in duration-300">
        <div className="flex flex-wrap justify-between items-center gap-2">
          <h2 className="text-xl font-bold text-purple-800 flex items-center"><UserCheck className="mr-2"/> 教師設定</h2>
          <div className="flex gap-2">
            <button onClick={() => sortImportRef.current.click()} className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm shadow hover:bg-green-700 flex items-center"><Upload size={14} className="mr-1"/> 匯入排序</button><input type="file" ref={sortImportRef} onChange={handleSortImport} className="hidden" />
            <button onClick={downloadTimetableTemplate} className="px-3 py-1.5 bg-purple-50 text-purple-700 rounded-lg text-sm border border-purple-200 hover:bg-purple-100"><Download size={14} className="inline mr-1"/>範本</button>
            <button onClick={() => timetableImportRef.current.click()} className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm shadow hover:bg-purple-700"><FileText size={14} className="inline mr-1"/>匯入課表</button><input type="file" ref={timetableImportRef} onChange={e => handleCSVImport(e, 'timetable')} className="hidden" />
            <button onClick={handleManualCloudUpload} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm shadow hover:bg-blue-700 flex items-center"><Upload size={14} className="mr-1"/> 手動上傳雲端</button>
          </div>
        </div>
        <form onSubmit={addTeacher} className="flex gap-2">
          <input value={newTitle} onChange={e=>setNewTitle(e.target.value)} placeholder="職銜(可留空)" className="border border-purple-200 p-2 rounded-lg w-28 focus:outline-none focus:ring-2 focus:ring-purple-400"/>
          <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="新老師姓名" className="border border-purple-200 p-2 rounded-lg flex-1 focus:outline-none focus:ring-2 focus:ring-purple-400"/>
          <button type="submit" className="bg-fuchsia-600 text-white px-4 rounded-lg hover:bg-fuchsia-700 shadow"><Plus/></button>
        </form>
        <div className="overflow-x-auto rounded-xl border border-purple-100">
          <table className="w-full text-sm">
            <thead className="bg-purple-50 text-purple-900"><tr><th className="p-3 text-center w-16">排序</th><th className="p-3 text-left w-20">職銜</th><th className="p-3 text-left">姓名</th><th className="p-3 text-left">當日空堂</th><th className="p-3 text-center">刪除</th></tr></thead>
            <tbody className="divide-y divide-purple-50">
              {(getSortedTeachers(teachers) || []).map((t, index) => (
                <tr key={t?.id || index} className="hover:bg-purple-50 bg-white">
                  <td className="p-3 text-center">
                    <div className="flex flex-col gap-1 items-center justify-center">
                      <button onClick={() => moveTeacher(index, 'up')} disabled={index===0} className="text-gray-400 hover:text-purple-600 disabled:opacity-30 leading-none">▲</button><button onClick={() => moveTeacher(index, 'down')} disabled={index===(teachers.length-1)} className="text-gray-400 hover:text-purple-600 disabled:opacity-30 leading-none">▼</button>
                    </div>
                  </td>
                  <td className="p-3 text-gray-500 font-medium text-xs">{t?.title || '-'}</td><td className="p-3 font-medium">{t?.name || '未知'}</td>
                  <td className="p-3 flex flex-wrap gap-1">{PERIODS.map(p => ( <button key={p} onClick={()=>toggleFreePeriod(t?.id, p)} className={`w-7 h-7 rounded-full text-xs transition-all ${(t?.freePeriods || []).includes(p) ? 'bg-green-100 text-green-700 border border-green-300 font-bold' : 'bg-gray-50 text-gray-300 border border-gray-100'}`}>{p}</button> ))}</td>
                  <td className="p-3 text-center"><button onClick={()=>deleteTeacher(t?.id)} className="text-gray-300 hover:text-red-500"><Trash2 size={16}/></button></td>
                </tr>
              ))}
              {(!teachers || teachers.length === 0) && <tr><td colSpan="5" className="p-6 text-center text-gray-400">目前沒有教師資料</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderStatsView = () => {
    const monthLogs = (Array.isArray(logs)?logs:[]).filter(l => (l?.date || '').startsWith(statsMonth));
    const statsData = getSortedTeachers(teachers).map(t => {
      const monthAbs = monthLogs.filter(l => l?.absentId === t?.id).length;
      const monthSubs = monthLogs.filter(l => l?.subId === t?.id && l?.subId !== 'CANCELLED' && !l?.isSwap).length;
      return { ...t, monthAbs, monthSubs };
    });
    return (
      <div className="space-y-6 animate-in fade-in zoom-in duration-300">
        <div className="bg-white p-6 rounded-2xl shadow-xl border border-purple-100">
          <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
            <h2 className="text-xl font-bold text-purple-800 flex items-center"><BarChart3 className="mr-2"/> 每月缺代課統計</h2>
            <div className="flex items-center gap-3">
              <div className="flex items-center bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200">
                 <label className="text-sm text-gray-600 mr-2 font-bold">選擇月份:</label><input type="month" value={statsMonth} onChange={e => setStatsMonth(e.target.value)} className="border-none bg-transparent outline-none text-purple-700 font-bold" />
              </div>
              <button onClick={exportStatsToCSV} className="px-3 py-1.5 bg-fuchsia-600 text-white rounded-lg text-sm shadow hover:bg-fuchsia-700 flex items-center"><Download size={14} className="mr-1"/>匯出 CSV</button>
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border border-purple-100">
            <table className="w-full text-sm bg-white">
              <thead className="bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white"><tr><th className="p-3 text-left w-20">職銜</th><th className="p-3 text-left">姓名</th><th className="p-3 text-center">{statsMonth} 缺課</th><th className="p-3 text-center">{statsMonth} 代課</th><th className="p-3 text-center">淨值</th></tr></thead>
              <tbody className="divide-y divide-purple-50">{statsData.map(t => (
                <tr key={t?.id || Math.random()} className="hover:bg-purple-50">
                <td className="p-3 text-gray-500 text-xs">{t?.title || '-'}</td><td className="p-3 font-medium">{t?.name || '未知'}</td>
                <td className="p-3 text-center text-red-500 font-bold">{t?.monthAbs || 0}</td><td className="p-3 text-center text-purple-600 font-bold">{t?.monthSubs || 0}</td>
                <td className={`p-3 text-center font-bold ${(t?.monthSubs || 0) - (t?.monthAbs || 0) > 0 ? 'text-green-600' : (t?.monthSubs || 0) - (t?.monthAbs || 0) < 0 ? 'text-orange-500' : 'text-gray-400'}`}>{(t?.monthSubs || 0) - (t?.monthAbs || 0) > 0 ? '+' : ''}{(t?.monthSubs || 0) - (t?.monthAbs || 0)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
        <div className="bg-gradient-to-r from-gray-50 to-purple-50 p-6 rounded-2xl shadow-inner border border-purple-100">
          <h3 className="font-bold text-gray-700 mb-2 flex items-center"><Save className="mr-2" size={18}/> 備份與還原</h3>
          <div className="flex gap-3 mt-3">
            <button onClick={downloadBackup} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm shadow hover:bg-blue-700 transition-colors flex items-center"><Download size={14} className="mr-2"/>下載備份</button>
            <button onClick={()=>backupImportRef.current.click()} className="bg-white text-gray-700 border border-gray-300 px-4 py-2 rounded-lg text-sm shadow-sm hover:bg-gray-50 transition-colors flex items-center"><RefreshCw size={14} className="mr-2"/>還原備份</button><input type="file" ref={backupImportRef} onChange={restoreBackup} className="hidden" />
          </div>
          {lastSaved && <p className="text-xs text-green-600 text-right mt-2 flex justify-end items-center"><CheckCircle size={10} className="mr-1"/>上次雲端同步: {lastSaved.toLocaleTimeString()}</p>}
        </div>
      </div>
    );
  };

  const renderReportView = () => {
    const dailyLogs = (Array.isArray(logs)?logs:[]).filter(l => l?.date === formDate).sort((a,b) => (a?.period||0) - (b?.period||0));
    const uniqueAbsents = [...new Set(dailyLogs.map(l => l?.absentName))].filter(Boolean);

    return (
      <div className="bg-white p-6 rounded-2xl shadow-xl border border-purple-100 animate-in fade-in zoom-in duration-300">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-purple-800 flex items-center"><Clock className="mr-2"/> 每日代課名單</h2>
          <div className="flex items-center gap-3">
            <input type="date" value={formDate} onChange={e=>setFormDate(e.target.value)} className="border border-purple-200 p-1.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400 text-sm"/>
            <button onClick={() => downloadImage('report-table-capture', `代課明細_${formDate}.png`)} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg shadow text-sm hover:bg-blue-700 flex items-center font-normal"><ImageIcon size={14} className="mr-1"/> 下載圖片</button>
          </div>
        </div>
        <div id="report-table-capture" className="bg-white p-2">
            <div className="mb-6 bg-red-50 p-4 rounded-xl border border-red-100">
              <h3 className="font-bold text-red-800 border-l-4 border-red-500 pl-2 mb-3 flex justify-between">
                <span>今日缺席名單 ({uniqueAbsents.length}人)</span>
              </h3>
              <div className="flex flex-wrap gap-2">
                {uniqueAbsents.map(name => {
                   const reason = dailyLogs.find(l => l?.absentName === name)?.reason || '其他';
                   return <span key={name} className="bg-white text-red-700 px-3 py-1.5 rounded-lg shadow-sm font-medium border border-red-100">{name} <span className="text-xs text-gray-500 ml-1">({reason})</span></span>;
                })}
                {uniqueAbsents.length === 0 && <span className="text-gray-400 text-sm">本日無缺席紀錄</span>}
              </div>
            </div>
            <div>
              <h3 className="font-bold text-purple-800 border-l-4 border-purple-500 pl-2 mb-3">代課安排明細</h3>
              <div className="overflow-hidden rounded-xl border border-purple-100 shadow-sm">
                <table className="min-w-full bg-white text-sm">
                  <thead className="bg-gradient-to-r from-purple-50 to-pink-50 text-purple-900"><tr><th className="p-3 text-center">節次</th><th className="p-3 text-center">班別</th><th className="p-3 text-center text-red-600">缺席老師</th><th className="p-3 text-center text-green-700">代課老師</th><th className="p-3 text-left">備註</th></tr></thead>
                  <tbody className="divide-y divide-purple-50">
                    {dailyLogs.map(l => (
                      <tr key={l?.id || Math.random()} className="hover:bg-purple-50 transition-colors text-center">
                        <td className="p-3 font-bold text-purple-700">{l?.period || '-'}</td><td className="p-3">{l?.className || '-'}</td><td className="p-3 text-red-500 font-medium">{l?.absentName || '未知'}</td>
                        <td className="p-3 font-bold text-green-600">{l?.subId === 'CANCELLED' ? <span className="text-gray-500">S班取消</span> : (l?.subName || '未安排')}</td><td className="p-3 text-xs text-orange-600 font-bold text-left">{l?.note || ''}</td>
                      </tr>
                    ))}
                    {dailyLogs.length === 0 && <tr><td colSpan="5" className="p-8 text-gray-400 text-center border-dashed border-2">本日無需要代課的節次</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
        </div>
      </div>
    );
  };

  if (isLoading) return (<div className="min-h-screen bg-fuchsia-50 flex flex-col items-center justify-center"><Loader2 className="w-12 h-12 text-purple-600 animate-spin mb-4" /><h2 className="text-xl font-bold text-purple-800">正在同步資料 (V4.9)...</h2></div>);

  return (
    <div className="min-h-screen bg-fuchsia-50 font-sans text-gray-800 pb-10 selection:bg-fuchsia-200">
      {renderModal()}
      {renderSwapModal()}
      <nav className="bg-gradient-to-r from-purple-700 via-fuchsia-600 to-pink-600 text-white shadow-lg sticky top-0 z-40 backdrop-blur-md bg-opacity-90">
        <div className="max-w-[1200px] mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center">
             <div className="font-bold text-xl flex items-center tracking-wide mr-3"><Calendar className="mr-2"/> 智慧代課系統 V4.9</div>
             {isCloudEnabled ? 
               <div className="flex items-center space-x-2 cursor-pointer" onClick={() => alert("目前連線狀態正常。")}><span className="text-[10px] bg-green-500/20 text-white px-2 py-0.5 rounded-full flex items-center border border-green-200/30"><Cloud size={10} className="mr-1"/> 雲端同步</span>{saveStatus === 'saving' && <span className="text-[10px] text-white/70 flex items-center"><Loader2 size={10} className="mr-1 animate-spin"/>儲存中...</span>}{saveStatus === 'error' && <span className="text-[10px] text-red-200 flex items-center bg-red-500/20 px-1 rounded"><AlertCircle size={10} className="mr-1"/>儲存失敗</span>}</div>
               : <span className="text-[10px] bg-white/10 text-white/70 px-2 py-0.5 rounded-full flex items-center border border-white/10" onClick={() => alert("目前為本機模式。")}><CloudOff size={10} className="mr-1"/> 本機模式</span>
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
