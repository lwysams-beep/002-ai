// Version 8.6
import React, { useState, useEffect, useRef } from 'react';
import { Users, Calendar, BarChart3, Clock, Plus, Trash2, UserCheck, Search, X, AlertCircle, CheckCircle, Upload, Download, FileText, Star, Cloud, CloudOff, Loader2, Save, RefreshCw, Image as ImageIcon, ArrowLeft, ArrowRight, ChevronsLeft, ChevronsRight, ClipboardEdit } from 'lucide-react';
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
  
  const [newAbsentId, setNewAbsentId] = useState('');
  const [newAbsentReason, setNewAbsentReason] = useState('病假');
  const [activeCell, setActiveCell] = useState(null); 
  
  const [statsMonth, setStatsMonth] = useState(new Date().toISOString().slice(0, 7));
  const [newTitle, setNewTitle] = useState(''); 
  const [newName, setNewName] = useState(''); 
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const [editableAbsentCounts, setEditableAbsentCounts] = useState({});
  const [confirmState, setConfirmState] = useState({});

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
  
  useEffect(() => {
      const dailyLogs = (Array.isArray(logs) ? logs : []).filter(l => l?.date === formDate);
      const uniqueAbsentIds = [...new Set(dailyLogs.map(l => String(l?.absentId)))].filter(id => !id.startsWith("FROM_"));
      setAbsentColOrder(prevOrder => {
          const currentOrderInLogs = prevOrder.filter(id => uniqueAbsentIds.includes(id));
          const newIds = uniqueAbsentIds.filter(id => !currentOrderInLogs.includes(id));
          return [...currentOrderInLogs, ...newIds];
      });
  }, [logs, formDate]);

  useEffect(() => {
    if (isLoading) return;
    const safeTeachers = Array.isArray(teachers) ? teachers : [];
    const safeLogs = Array.isArray(logs) ? logs : [];
    const safeDuties = duties || {};
    localStorage.setItem(STORAGE_KEY_TEACHERS, JSON.stringify(safeTeachers));
    localStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(safeLogs));
    localStorage.setItem(STORAGE_KEY_DUTIES, JSON.stringify(safeDuties));

    const timer = setTimeout(async () => {
      if (isCloudEnabled && dbRef.current) {
        try {
          await setDoc(doc(dbRef.current, "school_data", "main_backup_v3"), {
            teachers: safeTeachers, logs: safeLogs, duties: safeDuties, lastUpdated: new Date().toISOString()
          });
          setLastSaved(new Date());
        } catch (e) {}
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [teachers, logs, duties, isCloudEnabled, isLoading]);

  const showAlert = (title, message) => setModal({ isOpen: true, type: 'info', title, message });
  const showConfirm = (title, message, onConfirm) => setModal({ isOpen: true, type: 'confirm', title, message, onConfirm });
  const closeModal = () => setModal({ ...modal, isOpen: false });

  const handleManualCloudUpload = async () => {
    if (!isCloudEnabled || !dbRef.current) return showAlert("提示", "目前為本機模式，無法上傳雲端。");
    setSaveStatus('saving');
    try {
      await setDoc(doc(dbRef.current, "school_data", "main_backup_v3"), { teachers, logs, duties, lastUpdated: new Date().toISOString() });
      setLastSaved(new Date()); setSaveStatus('idle'); showAlert("成功", "資料已成功上傳！");
    } catch (e) { setSaveStatus('error'); showAlert("錯誤", "上傳失敗。"); }
  };

  const getSortedTeachers = (list) => {
    if (!Array.isArray(list)) return [];
    return [...list].filter(t => t !== null && t !== undefined).sort((a, b) => {
      const orderA = a?.sortOrder !== undefined ? a.sortOrder : 9999;
      const orderB = b?.sortOrder !== undefined ? b.sortOrder : 9999;
      if (orderA !== orderB) return orderA - orderB;
      return (a?.name || '').localeCompare(b?.name || '', "zh-HK");
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

  const getCategorizedTeachers = () => {
    if (!activeCell) return { recommendedGroups: {}, subbedOne: [], notArranged: [], busyNow: [], canSwapList: [] };
    const p = activeCell.period;
    const dayOfWeek = new Date(formDate).getDay();
    const targetKey = `${dayOfWeek}-${p}`;
    const normClass = (activeCell.className || '').trim().toUpperCase();
    const dailyLogs = (Array.isArray(logs) ? logs : []).filter(l => l?.date === formDate);
    const absentTeacherIds = [...new Set(dailyLogs.map(l => String(l?.absentId)))].filter(Boolean);
    const monthLogs = (Array.isArray(logs) ? logs : []).filter(l => (l?.date || '').startsWith(statsMonth));

    const allMapped = (Array.isArray(teachers) ? teachers : []).filter(t => t !== null).map(t => {
      const subbedLogs = dailyLogs.filter(log => String(log?.subId) === String(t.id));
      const subLogAtP = subbedLogs.find(l => String(l.period) === String(p));
      const isAlreadySubbingThisPeriod = !!subLogAtP;
      const extraSubCount = subbedLogs.filter(l => !l.isSwap).length;
      const baseFree = Array.isArray(t.freePeriods) ? t.freePeriods : [];
      const actualFreeCount = baseFree.length - extraSubCount;

      const title = (t.title || '').toUpperCase();
      const isExtSub = title.includes('外聘') || title.includes('代課') || (t.name === '吳詠詩');
      const isIntern = title.includes('實習');
      const isPT = title.includes('PT');
      const isTA = title.includes('TA');
      const isSpecialRole = isExtSub || isIntern || isPT || isTA;

      let isCore1 = false; let core1Sub = "";
      let isCore2 = false; let core2Sub = "";
      if (normClass && t.scheduleDetails) {
        for (const key in t.scheduleDetails) {
          const c = t.scheduleDetails[key];
          if ((c?.className || '').toUpperCase() === normClass) {
            if (c?.isSupport) continue;
            const subj = (c?.subject || '').toUpperCase();
            if (CORE1_SUBJECTS.some(s => subj.includes(s))) { isCore1 = true; core1Sub = c.subject; }
            else if (CORE2_SUBJECTS.some(s => subj.includes(s))) { isCore2 = true; core2Sub = c.subject; }
          }
        }
      }

      const monthAbs = monthLogs.filter(l => String(l?.absentId) === String(t.id) && l.isCountedAbsence).length;
      const monthSubs = monthLogs.filter(l => String(l?.subId) === String(t.id) && l?.subId !== 'CANCELLED' && !l?.isSwap).length;
      const isOwe = monthAbs > monthSubs;

      let rolePriority = 8;
      if (isExtSub) rolePriority = 1;
      else if (isIntern) rolePriority = 2;
      else if (isPT) rolePriority = 3;
      else if (isTA) rolePriority = 4;
      else if (isCore1) rolePriority = 5;
      else if (isCore2) rolePriority = 6;
      else if (isOwe) rolePriority = 7;

      const detail = t.scheduleDetails?.[targetKey];
      const isSupport = detail?.isSupport === true;
      const supportClass = detail?.className || '';
      const currentClass = detail?.className || '';
      const currentSubject = detail?.subject || '';
      
      const isFreeAtP = baseFree.includes(p) && !isAlreadySubbingThisPeriod;
      const canSubAtP = isFreeAtP || isSupport;
      const currentStatus = isFreeAtP ? '空堂' : '入班';

      let busyClass = '';
      if (isAlreadySubbingThisPeriod) {
        busyClass = subLogAtP.className ? `${subLogAtP.className}(代)` : '(代)';
      } else if (!isFreeAtP) {
        busyClass = detail?.className || '常規課';
      }

      return {
        ...t, freePeriods: baseFree, extraSubCount, actualFreeCount, isSpecialRole, rolePriority,
        isExtSub, isIntern, isPT, isTA, isCore1, core1Sub, isCore2, core2Sub, isOwe,
        isSupport, supportClass, currentStatus, canSubAtP, busyClass,
        currentClass, currentSubject,
        isAlreadySubbingThisPeriod, isAbsent: absentTeacherIds.includes(String(t.id))
      };
    });

    const recommendedGroups = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], 8: [] };
    const canSwapList = [];
    const subbedOne = [];
    const notArranged = [];
    
    allMapped.forEach(t => {
      if (String(t.id) === String(activeCell.absentId)) return;

      if (t.isAbsent) {
        notArranged.push(t);
      } else if (t.isAlreadySubbingThisPeriod) {
        notArranged.push({ ...t, busyClass: t.busyClass || '(已代本節)' });
      } else if (!t.isSpecialRole && t.freePeriods.length <= 2) {
        notArranged.push(t);
      } else if (t.canSubAtP || t.isSpecialRole) {
        if (t.extraSubCount >= 1) subbedOne.push(t);
        else recommendedGroups[t.rolePriority].push(t);
      } else {
        canSwapList.push(t);
      }
    });

    const sorter = (a, b) => {
      if (a.extraSubCount !== b.extraSubCount) return a.extraSubCount - b.extraSubCount;
      if (a.actualFreeCount !== b.actualFreeCount) return b.actualFreeCount - a.actualFreeCount;
      return (a.name || '').localeCompare(b.name || '', "zh-HK");
    };

    const busySorter = (a, b) => {
        const getSubjectPrio = (s) => {
            if (!s) return 5;
            if (s.includes('體驗')) return 1;
            if (s.includes('Me Time')) return 2;
            if (s.includes('藝創')) return 3;
            if (s.includes('3S')) return 4;
            return 5;
        };

        const prioA = getSubjectPrio(a.currentSubject);
        const prioB = getSubjectPrio(b.currentSubject);
        if (prioA !== prioB) return prioA - prioB;

        const getPrio = (c) => {
            let cls = (c || '').replace('(代)', '').replace('(已代本節)', '').trim();
            if (cls === '常規課') return 'ZZZ1';
            if (cls === '(代)') return 'ZZZ2';
            if (!cls) return 'ZZZ3';
            return cls;
        };

        const valA = getPrio(a.busyClass);
        const valB = getPrio(b.busyClass);
        const cmp = valA.localeCompare(valB, "en-US", { numeric: true });
        if (cmp !== 0) return cmp;
        return (a.name || '').localeCompare(b.name || '', "zh-HK");
    };
    
    Object.keys(recommendedGroups).forEach(k => recommendedGroups[k].sort(sorter));

    return {
      recommendedGroups,
      subbedOne: subbedOne.sort(sorter),
      notArranged: notArranged.sort(sorter),
      canSwapList: canSwapList.sort(busySorter)
    };
  };
  
  const handleAddAbsent = () => {
    if (!newAbsentId) return showAlert("提示", "請選擇缺席老師");
    const t = teachers.find(x => String(x.id) === String(newAbsentId));
    if (!t) return;
    
    const dayOfWeek = new Date(formDate).getDay();
    const busy = t.masterSchedule?.[dayOfWeek] || [];
    const existingLogsForTeacher = logs.filter(l => l?.date === formDate && String(l?.absentId) === String(newAbsentId));
    const existingPeriods = existingLogsForTeacher.map(l => l.period);
    
    const newLogs = [];
    const periodsToLog = busy.filter(p => !existingPeriods.includes(p));
    
    if (periodsToLog.length === 0 && !absentColOrder.includes(String(newAbsentId))) {
      showAlert("提示", "該老師今日無排定課堂。");
      setNewAbsentId('');
      return;
    }
    
    const isSickness = newAbsentReason === '病假';
    const currentCounted = existingLogsForTeacher.filter(l => l.isCountedAbsence).length;
    const countForStats = isSickness ? currentCounted + periodsToLog.length : currentCounted;

    periodsToLog.forEach((p) => {
      const detail = t.scheduleDetails?.[`${dayOfWeek}-${p}`];
      const cName = detail?.className || '';
      const isSClass = detail?.isSupport === true || cName.toUpperCase().includes('S');

      newLogs.push({
        id: Date.now() + Math.random() + p,
        date: formDate, period: p, className: cName,
        absentName: t.name, absentId: t.id, reason: newAbsentReason,
        subName: isSClass ? 'S班取消' : null, subId: isSClass ? 'CANCELLED' : null,
        note: '', isSwap: false, 
        isCountedAbsence: false, 
        timestamp: new Date().toLocaleString()
      });
    });
    
    if (newLogs.length > 0) {
      setLogs(prev => [...(Array.isArray(prev)?prev:[]), ...newLogs]);
    }
    setEditableAbsentCounts(prev => ({...prev, [newAbsentId]: countForStats }));
    setConfirmState(prev => ({...prev, [newAbsentId]: false}));
    if (!absentColOrder.includes(String(newAbsentId))) {
      setAbsentColOrder(prev => [...prev, String(newAbsentId)]);
    }
    setNewAbsentId('');
  };

  const handleDeleteAbsentTeacher = (absentId) => {
    const t = teachers.find(x => String(x.id) === String(absentId));
    const name = t ? t.name : '該老師';
    showConfirm("刪除確認", `確定要刪除 ${name} 今日的所有缺席及代課紀錄嗎？`, () => {
      setLogs(prev => (Array.isArray(prev) ? prev : []).filter(l => !(l.date === formDate && (String(l.absentId) === String(absentId) || String(l.absentId).endsWith(`_${absentId}`))) ));
      setAbsentColOrder(prev => prev.filter(id => id !== String(absentId)));
      setEditableAbsentCounts(prev => { const newCounts = {...prev}; delete newCounts[absentId]; return newCounts; });
      setConfirmState(prev => { const newState = {...prev}; delete newState[absentId]; return newState; });
      if (activeCell && String(activeCell.absentId) === String(absentId)) setActiveCell(null);
      closeModal();
    });
  };

  const commitAssign = (logId, subId, subName, note, isSwap) => {
    setLogs(prev => (Array.isArray(prev)?prev:[]).map(l => {
      if (l.id === logId) {
        return { ...l, subId, subName, note, isSwap };
      }
      return l;
    }));
    setActiveCell(null);
  };

  const handleAssignSub = (t) => {
    if (!t || !activeCell) return;
    const dayOfWeek = new Date(formDate).getDay();
    const isBusy = !t.canSubAtP;

    if (isBusy && !t.isSupport) {
        const allTeachers = Array.isArray(teachers) ? teachers : [];
        const currentLogs = Array.isArray(logs) ? logs : [];
        const dailyLogs = currentLogs.filter(l => l?.date === formDate);
        const absentTeacherIds = [...new Set(dailyLogs.map(l => String(l?.absentId)))].filter(Boolean);
        const subbedTeacherIdsThisPeriod = [...new Set(dailyLogs.filter(l => l.subId && l.subId !== 'CANCELLED' && l.period === activeCell.period).map(l => String(l.subId)))];

        const freeTeachers = getSortedTeachers(allTeachers).filter(teacher => {
            if (!teacher || !teacher.id) return false;
            const isFreeThisPeriod = (teacher.freePeriods || []).includes(activeCell.period);
            const isAbsent = absentTeacherIds.includes(String(teacher.id));
            const isSubbingThisPeriod = subbedTeacherIdsThisPeriod.includes(String(teacher.id));
            return String(teacher.id) !== String(t.id) && isFreeThisPeriod && !isAbsent && !isSubbingThisPeriod;
        });
        
        setReplaceModal({ isOpen: true, originalTeacher: t, freeTeachers: freeTeachers, selectedTeacherId: '' });
        return;
    }
    
    if (!t.isPT && !t.isTA) {
       setAssignModal({isOpen: true, teacher: t, assignType: 'extra'});
       return;
    }
    
    if (t.isPT || t.isTA) {
        if (t.currentStatus === '入班') {
            const note = `(${t.supportClass || t.busyClass || '未知'}不入班)`;
            commitAssign(activeCell.logId, t.id, t.name, note, true);
        } else {
            const busyPeriods = t.masterSchedule?.[dayOfWeek] || [];
            const options = busyPeriods.map(bp => {
                const detail = t.scheduleDetails?.[`${dayOfWeek}-${bp}`];
                if (detail?.isSupport || (detail?.className && detail.className !== '')) {
                     return { period: bp, className: detail.className };
                }
                return null;
            }).filter(Boolean);
            
            options.unshift({ period: -2, className: '不轉空堂 (當作轉上)' });
            options.unshift({ period: -1, className: '不轉空堂 (當作額外代課)' });
            
            setSwapModal({ isOpen: true, logId: activeCell.logId, subTeacher: t, options, selectedOption: options[0] });
        }
    } else {
        const note = t.isSupport ? (t.supportClass ? `(${t.supportClass}不抽離)` : `(支援不抽離)`) : '';
        commitAssign(activeCell.logId, t.id, t.name, note, false);
    }
  };
  
  const handleAssignConfirm = () => {
    const { teacher, assignType } = assignModal;
    if (!teacher || !activeCell) return;
    
    const isSwap = assignType === 'private';
    const note = isSwap ? '(私下調堂)' : (teacher.isSupport ? `(${teacher.supportClass || ''}不抽離)` : '');
    commitAssign(activeCell.logId, teacher.id, teacher.name, note, isSwap);
    setAssignModal({isOpen: false, teacher: null, assignType: 'extra'});
  };

  const handleSwapConfirm = () => {
    const opt = swapModal.selectedOption;
    const t = swapModal.subTeacher;
    if (!opt || !t) return;

    if (String(opt.period) === "-1") {
        if (t.actualFreeCount - 1 < 2) {
            setSwapModal({ isOpen: false });
            setTimeout(() => {
                showConfirm("警告", `此老師代課後，當日空堂將不足2節 (剩餘 ${t.actualFreeCount - 1} 節)。確定要強行安排嗎？`, () => {
                    commitAssign(swapModal.logId, t.id, t.name, '(額外代課)', false);
                    closeModal();
                });
            }, 300);
        } else {
            commitAssign(swapModal.logId, t.id, t.name, '(額外代課)', false);
            setSwapModal({ isOpen: false });
        }
    } else if (String(opt.period) === "-2") {
        commitAssign(swapModal.logId, t.id, t.name, `(轉上)`, true);
        setSwapModal({ isOpen: false });
    } else {
        commitAssign(swapModal.logId, t.id, t.name, `(第${opt.period}節轉上，${opt.className}不入班)`, true);
        setSwapModal({ isOpen: false });
    }
  };
  
  const handleReplaceConfirm = () => {
    const { originalTeacher, selectedTeacherId } = replaceModal;
    if (!originalTeacher || !activeCell) return;
    
    if (selectedTeacherId === 'NO_SUB') {
        const note = `(${originalTeacher.currentClass} ${originalTeacher.currentSubject} 取消)`;
        commitAssign(activeCell.logId, originalTeacher.id, originalTeacher.name, note, true);
    } 
    else if (selectedTeacherId) {
        const subForOriginal = replaceModal.freeTeachers.find(t => String(t.id) === selectedTeacherId);
        if (subForOriginal) {
            const note = `(${originalTeacher.currentClass} 轉上)`;
            commitAssign(activeCell.logId, originalTeacher.id, originalTeacher.name, note, true);

            const newLogForOriginalClass = {
                id: Date.now() + Math.random(),
                date: formDate,
                period: activeCell.period,
                className: originalTeacher.currentClass,
                absentName: `(${originalTeacher.name}轉上)`,
                absentId: `FROM_${originalTeacher.id}`,
                reason: '轉堂代課',
                subName: subForOriginal.name,
                subId: subForOriginal.id,
                note: '(接替轉上老師)',
                isSwap: true,
                isCountedAbsence: false,
                timestamp: new Date().toLocaleString()
            };
            setLogs(prev => [...(Array.isArray(prev) ? prev : []), newLogForOriginalClass]);
        }
    }
    setReplaceModal({ isOpen: false });
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
      setTeachers(prev => {
        const safePrev = Array.isArray(prev) ? prev : [];
        return [...safePrev, { id: Date.now(), title: newTitle.trim(), name: newName.trim(), freePeriods: [], masterSchedule: {}, scheduleDetails: {}, sortOrder: 9999 }];
      });
      setNewTitle(''); setNewName('');
    }
  };

  const deleteTeacher = (id) => {
    showConfirm("刪除確認", "確定要刪除這位老師嗎？", () => {
      setTeachers(prev => (Array.isArray(prev) ? prev : []).filter(t => t && String(t.id) !== String(id)));
      closeModal();
    });
  };
  
  const toggleFreePeriod = (teacherId, period) => {
    setTeachers(prev => {
      const safePrev = Array.isArray(prev) ? prev : [];
      const dayOfWeek = new Date(formDate).getDay();
      
      return safePrev.map(t => {
        if (t && String(t.id) === String(teacherId)) {
          const fp = Array.isArray(t.freePeriods) ? t.freePeriods : [];
          const isCurrentlyFree = fp.includes(period);
          
          let updatedFreePeriods = [...fp];
          if (isCurrentlyFree) {
              updatedFreePeriods = fp.filter(p => p !== period);
          } else {
              updatedFreePeriods.push(period);
              updatedFreePeriods.sort((a, b) => a - b);
          }

          const ms = t.masterSchedule || {};
          let busyArray = ms[dayOfWeek] || [];
          if (!isCurrentlyFree) {
              busyArray = busyArray.filter(p => p !== period);
          } else {
              if (!busyArray.includes(period)) busyArray.push(period);
              busyArray.sort((a,b)=>a-b);
          }
          ms[dayOfWeek] = busyArray;

          return { ...t, freePeriods: updatedFreePeriods, masterSchedule: ms };
        }
        return t;
      });
    });
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
          let newTeachers = [...(Array.isArray(prev)?prev:[])].filter(t => t !== null);
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
        [newTeachers[index - 1], newTeachers[index]] = [newTeachers[index], newTeachers[index - 1]];
      } else if (direction === 'down' && index < newTeachers.length - 1) {
        [newTeachers[index], newTeachers[index + 1]] = [newTeachers[index + 1], newTeachers[index]];
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
        let newTeachers = [...(Array.isArray(teachers)?teachers:[])].filter(t => t !== null);
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
        showAlert("匯入成功", "課表已成功匯入。");
      } catch (err) { showAlert("錯誤", "格式有誤或匯入失敗"); }
      e.target.value = '';
    };
    reader.readAsText(file);
  };

  const exportStatsToCSV = () => {
    const monthLogs = (Array.isArray(logs)?logs:[]).filter(l => (l?.date || '').startsWith(statsMonth));
    let csv = `\ufeff職銜,姓名,${statsMonth} 缺課,${statsMonth} 代課,淨值\n`;
    getSortedTeachers(teachers).forEach(t => {
      const monthAbs = monthLogs.filter(l => String(l?.absentId) === String(t.id) && l.isCountedAbsence).length;
      const monthSubs = monthLogs.filter(l => String(l?.subId) === String(t.id) && l?.subId !== 'CANCELLED' && !l?.isSwap).length; 
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
    const url = URL.createObjectURL(new Blob([JSON.stringify({ teachers, logs, duties, backupDate: new Date().toISOString() }, null, 2)], { type: 'application/json' }));
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
          setTeachers(Array.isArray(data.teachers)?data.teachers:[]); 
          setLogs(Array.isArray(data.logs)?data.logs:[]);
          setDuties(data.duties || {});
          showAlert("成功", "已還原。");
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
            <select className="w-full border border-gray-300 p-2 rounded focus:border-blue-500 outline-none" value={swapModal.selectedOption?.period} onChange={(e) => { setSwapModal({ ...swapModal, selectedOption: swapModal.options.find(o => String(o.period) === String(e.target.value)) }); }}>
              {swapModal.options.map(o => (<option key={o.period} value={o.period}>{String(o.period).startsWith("-") ? o.className : `第 ${o.period} 節 - ${o.className} 班`}</option>))}
            </select>
          </div>
          <div className="p-4 border-t border-blue-100 bg-blue-50 flex justify-end gap-3">
            <button onClick={() => setSwapModal({ isOpen: false })} className="px-4 py-2 text-gray-600 bg-white border rounded hover:bg-gray-50">取消</button><button onClick={handleSwapConfirm} className="px-4 py-2 text-white bg-blue-600 rounded hover:bg-blue-700">確定</button>
          </div>
        </div>
      </div>
    );
  };
  
  const renderReplaceModal = () => {
    if (!replaceModal.isOpen) return null;
    const { originalTeacher, freeTeachers } = replaceModal;

    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in border border-amber-100">
          <div className="p-4 border-b border-amber-100 bg-amber-50">
            <h3 className="font-bold text-lg text-amber-900">選擇轉代該課節老師</h3>
            <p className="text-sm text-gray-600 mt-1">
              <strong>{originalTeacher?.name}</strong> 老師正在上 <strong>{originalTeacher?.currentClass} ({originalTeacher?.currentSubject})</strong>。<br/>請為這節課選擇一位代課老師：
            </p>
          </div>
          <div className="p-5">
            <select 
              className="w-full border border-gray-300 p-2 rounded focus:border-amber-500 outline-none" 
              value={replaceModal.selectedTeacherId} 
              onChange={(e) => setReplaceModal({ ...replaceModal, selectedTeacherId: e.target.value })}
            >
              <option value="">請選擇...</option>
              <option value="NO_SUB">無需代課 (取消該課節)</option>
              <optgroup label="選擇空堂老師接替">
                {freeTeachers.map(t => (
                  <option key={t.id} value={t.id}>{t.title ? `[${t.title}] ` : ''}{t.name}</option>
                ))}
              </optgroup>
            </select>
            {freeTeachers.length === 0 && <p className="text-xs text-red-500 mt-2">此節沒有其他空堂老師可選。</p>}
          </div>
          <div className="p-4 border-t border-amber-100 bg-amber-50 flex justify-end gap-3">
            <button onClick={() => setReplaceModal({ isOpen: false })} className="px-4 py-2 text-gray-600 bg-white border rounded hover:bg-gray-50">取消</button>
            <button onClick={handleReplaceConfirm} className="px-4 py-2 text-white bg-amber-600 rounded hover:bg-amber-700">確定</button>
          </div>
        </div>
      </div>
    );
  };
  
    const renderAssignModal = () => {
        if (!assignModal.isOpen) return null;
        return (
            <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-xs overflow-hidden animate-in fade-in border border-emerald-100">
                    <div className="p-4 border-b border-emerald-100 bg-emerald-50">
                        <h3 className="font-bold text-lg text-emerald-900">確認指派</h3>
                        <p className="text-sm text-gray-600 mt-1">請選擇 <strong>{assignModal.teacher?.name}</strong> 老師的代課類型：</p>
                    </div>
                    <div className="p-5 space-y-3">
                        <label className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                            <input type="radio" name="assignType" value="extra" checked={assignModal.assignType === 'extra'} onChange={() => setAssignModal(p => ({...p, assignType: 'extra'}))} className="w-4 h-4 text-emerald-600 focus:ring-emerald-500"/>
                            <span className="ml-3 font-medium">額外代課 (計算)</span>
                        </label>
                         <label className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                            <input type="radio" name="assignType" value="private" checked={assignModal.assignType === 'private'} onChange={() => setAssignModal(p => ({...p, assignType: 'private'}))} className="w-4 h-4 text-emerald-600 focus:ring-emerald-500"/>
                            <span className="ml-3 font-medium">私下調堂 (不計算)</span>
                        </label>
                    </div>
                    <div className="p-4 border-t border-emerald-100 bg-emerald-50 flex justify-end gap-3">
                        <button onClick={() => setAssignModal({isOpen: false, teacher: null, assignType: 'extra'})} className="px-4 py-2 text-gray-600 bg-white border rounded hover:bg-gray-50">取消</button>
                        <button onClick={handleAssignConfirm} className="px-4 py-2 text-white bg-emerald-600 rounded hover:bg-emerald-700">確定</button>
                    </div>
                </div>
            </div>
        );
    };

  const getSubjectTagClass = (subject) => {
    if (!subject) return 'text-gray-600 bg-gray-100 border-gray-200';
    if (subject.includes('體驗')) return 'text-amber-700 bg-amber-100 border-amber-300';
    if (subject.includes('Me Time')) return 'text-blue-700 bg-blue-100 border-blue-300';
    if (subject.includes('藝創')) return 'text-green-700 bg-green-100 border-green-300';
    if (subject.includes('3S')) return 'text-fuchsia-700 bg-fuchsia-100 border-fuchsia-300';
    return 'text-gray-600 bg-gray-100 border-gray-200';
  };
  
  const renderTeacherGroup = (list) => {
    if (!list || list.length === 0) return null;
    return list.map(t => (
       <div key={t.id} className="flex justify-between items-center p-2 bg-white border border-gray-200 rounded-lg shadow-sm hover:border-purple-400 transition-colors">
          <div>
            <div className="font-bold text-sm text-gray-800 flex items-center">
              {t.title ? `[${t.title}] ` : ''}{t.name}
              {t.isExtSub && <span className="text-[10px] ml-2 text-indigo-600">({t.currentStatus === '空堂' ? '空堂' : `${t.currentClass} ${t.currentSubject}`})</span>}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">額外已代: <span className="font-bold text-purple-600">{t.extraSubCount}</span> 節 | 剩餘空堂: {t.actualFreeCount}</div>
            
            {t.isCore1 && <div className="text-[10px] text-pink-600 font-bold mt-1 bg-pink-50 inline-block px-1 rounded border border-pink-200 mr-1">任教本班 ({t.core1Sub})</div>}
            {t.isCore2 && <div className="text-[10px] text-sky-600 font-bold mt-1 bg-sky-50 inline-block px-1 rounded border border-sky-200 mr-1">任教本班 ({t.core2Sub})</div>}
            {t.isOwe && <div className="text-[10px] text-red-600 font-bold mt-1 bg-red-50 inline-block px-1 rounded border border-red-200 mr-1">缺課較多</div>}
            {t.isExtSub && <div className="text-[10px] text-indigo-600 font-bold mt-1 bg-indigo-50 inline-block px-1 rounded border border-indigo-200 mr-1">外聘代課</div>}
            {t.isIntern && <div className="text-[10px] text-teal-600 font-bold mt-1 bg-teal-50 inline-block px-1 rounded border border-teal-200 mr-1">實習</div>}
            {(t.isPT || t.isTA) && ( <div className={`text-[10px] font-bold mt-1 inline-block px-1 rounded border mr-1 ${t.currentStatus === '空堂' ? 'text-green-600 bg-green-50 border-green-200' : 'text-orange-600 bg-orange-50 border-orange-200'}`}>{t.isPT ? 'PT' : 'TA'} ({t.currentStatus})</div> )}
            
            {!t.canSubAtP && t.currentClass && (
              <div className="text-[10px] font-bold mt-1 inline-block px-1 rounded border mr-1 text-gray-600 bg-gray-100 border-gray-200">
                {t.currentClass}
              </div>
            )}
            {!t.canSubAtP && t.currentSubject && (
              <div className={`text-[10px] font-bold mt-1 inline-block px-1 rounded border mr-1 ${getSubjectTagClass(t.currentSubject)}`}>
                {t.currentSubject}
              </div>
            )}
            {t.isSupport && t.rolePriority >= 5 && <div className="text-[10px] text-orange-600 mt-1 bg-orange-50 inline-block px-1 rounded mr-1">抽離 ({t.supportClass})</div>}
          </div>
          <button type="button" onClick={() => handleAssignSub(t)} className="px-3 py-1.5 bg-gradient-to-r from-purple-500 to-fuchsia-500 text-white rounded text-xs shadow">指派</button>
       </div>
    ));
  };

  const renderNotArrangedGroup = (list, type) => {
    if (!list || list.length === 0) return <div className="text-center text-gray-400 text-sm py-2 border border-dashed rounded-lg">無老師在此名單</div>;
    return list.map(t => (
       <div key={t.id} className="flex justify-between items-center p-2 bg-white border border-gray-200 rounded-lg shadow-sm">
          <div>
            <div className="font-bold text-sm text-gray-800 opacity-60">{t.title ? `[${t.title}] ` : ''}{t.name}</div>
          </div>
          <div className={`text-xs font-bold ${type === 'busy' ? 'text-purple-500' : 'text-red-400'}`}>
             {t.isAlreadySubbingThisPeriod ? `已代課 (${t.busyClass})` : (t.isAbsent ? '缺席' : '空堂≤2')}
          </div>
       </div>
    ));
  };

  const renderArrangeView = () => {
    const dailyLogs = (Array.isArray(logs) ? logs : []).filter(l => l?.date === formDate);
    const uniqueAbsentIds = [...new Set(dailyLogs.map(l => String(l?.absentId)))].filter(id => !id.startsWith("FROM_"));
    const orderedAbsentIds = absentColOrder.length > 0 ? absentColOrder.filter(id => uniqueAbsentIds.includes(id)) : uniqueAbsentIds;
    
    const absentCols = orderedAbsentIds.map(id => {
      const log = dailyLogs.find(l => String(l?.absentId) === id);
      return log ? { id, name: log.absentName, reason: log.reason } : null;
    }).filter(Boolean);
    
    const { recommendedGroups, subbedOne, notArranged, canSwapList } = getCategorizedTeachers();
    const hasRecommended = recommendedGroups && Object.values(recommendedGroups).some(group => group.length > 0);
    
    const moveAbsentColumn = (id, direction) => {
        const currentIndex = orderedAbsentIds.indexOf(id);
        const newOrder = [...orderedAbsentIds];
        if (direction === 'left' && currentIndex > 0) {
            [newOrder[currentIndex - 1], newOrder[currentIndex]] = [newOrder[currentIndex], newOrder[currentIndex - 1]];
        } else if (direction === 'right' && currentIndex < newOrder.length - 1) {
            [newOrder[currentIndex], newOrder[currentIndex + 1]] = [newOrder[currentIndex + 1], newOrder[currentIndex]];
        }
        setAbsentColOrder(newOrder);
    };

    const handleAbsentCountConfirm = (absentId) => {
        const isConfirmed = confirmState[absentId] || false;
        if (isConfirmed) {
            showAlert("提示", "此項缺席統計已確定。");
            return;
        }
    
        setConfirmState(prev => ({...prev, [absentId]: true}));
        const count = editableAbsentCounts[absentId];
        setLogs(prev => {
            let processedCount = 0;
            return prev.map(l => {
                if (String(l.absentId) === String(absentId) && l.date === formDate) {
                    const shouldBeCounted = processedCount < count;
                    processedCount++;
                    return { ...l, isCountedAbsence: shouldBeCounted };
                }
                return l;
            });
        });
        showAlert("成功", "缺席統計節數已更新。");
    };
    
    const getButtonClass = (absentId) => {
        const isConfirmed = confirmState[absentId] || false;
        if (isConfirmed) {
            return 'bg-green-600 hover:bg-green-700'; 
        }
        return 'bg-red-600 hover:bg-red-700'; 
    };

    const getButtonText = (absentId) => {
        const isConfirmed = confirmState[absentId] || false;
        if (isConfirmed) {
            return '已確定';
        }
        return '待確定';
    };

    return (
      <div className={`flex flex-col md:flex-row gap-4 h-full`}>
        <div className={`shrink-0 bg-white p-4 rounded-xl border border-purple-100 shadow-sm flex flex-col h-full overflow-hidden transition-all duration-300 ${isPanelCollapsed ? 'w-0 p-0 border-0' : 'w-full md:w-[360px]'}`}>
          <h3 className="font-bold text-lg text-purple-900 mb-3 border-b border-purple-100 pb-2 flex items-center justify-between">
            <span className="flex items-center"><Star className="mr-2 text-fuchsia-500" size={18}/> 安排操作</span>
            <button onClick={() => setIsPanelCollapsed(true)} className="md:hidden text-purple-400 hover:text-purple-600"><ChevronsLeft size={20}/></button>
          </h3>
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
              <div className="flex-1 overflow-y-auto pr-1 space-y-4">
                 {activeCell.subId !== 'CANCELLED' ? ( 
                   <>
                     <div>
                       <div className="text-xs text-purple-700 mb-2 font-bold flex justify-between"><span>推薦代課名單</span></div>
                       <div className="space-y-2">
                         {renderTeacherGroup(recommendedGroups[1])}
                         {renderTeacherGroup(recommendedGroups[2])}
                         {renderTeacherGroup(recommendedGroups[3])}
                         {renderTeacherGroup(recommendedGroups[4])}
                         {renderTeacherGroup(recommendedGroups[5])}
                         {renderTeacherGroup(recommendedGroups[6])}
                         {renderTeacherGroup(recommendedGroups[7])}
                         {renderTeacherGroup(recommendedGroups[8])}
                         {!hasRecommended && <div className="text-center text-gray-400 text-sm py-2 border border-dashed rounded-lg">無優先推薦老師</div>}
                       </div>
                     </div>
                     <div>
                       <div className="text-xs text-amber-700 mb-2 font-bold flex justify-between"><span>正在上課 (可選)</span></div>
                         <div className="space-y-2">
                           {renderTeacherGroup(canSwapList)}
                           {(!canSwapList || canSwapList.length === 0) && <div className="text-center text-gray-400 text-sm py-2 border border-dashed rounded-lg">無老師在此名單</div>}
                         </div>
                       </div>
                     <div>
                       <div className="text-xs text-purple-700 mb-2 font-bold flex justify-between"><span>額外1節名單 (已代1節)</span></div>
                       <div className="space-y-2">
                         {renderTeacherGroup(subbedOne)}
                         {(!subbedOne || subbedOne.length === 0) && <div className="text-center text-gray-400 text-sm py-2 border border-dashed rounded-lg">無老師在此名單</div>}
                       </div>
                     </div>
                     <div>
                       <div className="text-xs text-gray-500 mb-2 font-bold flex justify-between"><span>不安排名單</span></div>
                       <div className="space-y-2">
                         {renderNotArrangedGroup(notArranged, 'not')}
                       </div>
                     </div>
                   </> 
                 ) : ( <div className="text-center text-gray-400 text-sm py-8 border border-dashed rounded-lg mt-4">課堂已取消</div> )}
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 bg-white p-4 rounded-xl border border-purple-100 shadow-sm flex flex-col h-full animate-in fade-in">
           <div className="flex-1 overflow-x-auto rounded-lg border border-gray-200" id="arrange-table-capture">
             <table className="w-full h-full text-sm text-center border-collapse min-w-max bg-white table-fixed">
                <thead className="bg-purple-50 sticky top-0 z-20 shadow-sm">
                   <tr>
                     <th className="p-1 border-b border-r border-gray-200 w-[50px] bg-purple-100 sticky left-0 z-30">
                        {isPanelCollapsed && <button onClick={() => setIsPanelCollapsed(false)} className="text-purple-400 hover:text-purple-600"><ChevronsRight size={20}/></button>}
                        <span className={isPanelCollapsed ? 'ml-2' : ''}>節次</span>
                     </th>
                     {absentCols.map((c, index) => ( 
                       <th key={c.id} className="p-1 border-b border-gray-200 min-w-[150px] bg-purple-50 relative group">
                         <div className="font-bold text-purple-900 text-sm">{c.name}</div>
                         <div className="text-[10px] text-red-500 bg-red-50 rounded px-1 inline-block border border-red-100">{c.reason}</div>
                         <div className="absolute top-1/2 -translate-y-1/2 left-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => moveAbsentColumn(c.id, 'left')} disabled={index === 0} className="p-0.5 rounded-full bg-white/50 hover:bg-white disabled:opacity-20"><ArrowLeft size={12}/></button>
                         </div>
                         <div className="absolute top-1/2 -translate-y-1/2 right-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => moveAbsentColumn(c.id, 'right')} disabled={index === absentCols.length - 1} className="p-0.5 rounded-full bg-white/50 hover:bg-white disabled:opacity-20"><ArrowRight size={12}/></button>
                         </div>
                         <div className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Trash2 size={12} className="cursor-pointer text-red-400 hover:text-red-700" onClick={() => handleDeleteAbsentTeacher(c.id)}/>
                         </div>
                       </th> 
                     ))}
                     {absentCols.length === 0 && <th className="p-1 border-b text-gray-400 font-normal">請先由上方加入缺席老師</th>}
                   </tr>
                   <tr className="bg-purple-50/70">
                        <th className="p-1 border-b border-r border-gray-200 font-bold text-purple-800 text-xs bg-purple-100 sticky left-0 z-30">缺席統計</th>
                        {absentCols.map(c => {
                            const totalPeriods = dailyLogs.filter(l => String(l.absentId) === String(c.id)).length;
                            return (
                                <th key={`stat-${c.id}`} className="p-1 border-b border-gray-200 font-normal">
                                    <div className="flex items-center justify-center gap-1">
                                        <input
                                            type="number"
                                            value={editableAbsentCounts[c.id] ?? 0}
                                            onChange={(e) => {
                                                const val = parseInt(e.target.value, 10);
                                                const max = totalPeriods;
                                                setEditableAbsentCounts(prev => ({...prev, [c.id]: Math.max(0, Math.min(val, max)) }));
                                                setConfirmState(prev => ({...prev, [c.id]: false}));
                                            }}
                                            className="w-12 text-center border rounded py-0.5"
                                        />
                                        <button 
                                            onClick={() => handleAbsentCountConfirm(c.id)} 
                                            className={`px-1.5 py-0.5 text-white text-[10px] rounded transition-colors ${getButtonClass(c.id)}`}>
                                            {getButtonText(c.id)}
                                        </button>
                                    </div>
                                </th>
                            );
                        })}
                        {absentCols.length === 0 && <th className="p-1 border-b border-gray-200"></th>}
                   </tr>
                </thead>
                <tbody>
                   {PERIODS.map(p => (
                     <tr key={p} className="hover:bg-purple-50/30">
                       <td className="p-1 border-b border-r border-gray-200 font-bold bg-white text-purple-800 sticky left-0 z-10">{p}</td>
                       {absentCols.map(c => {
                          const log = dailyLogs.find(l => String(l.absentId) === String(c.id) && l.period === p);
                          const isActive = activeCell?.logId === log?.id;
                          if (!log) return <td key={c.id} className="p-1 border-b border-gray-200 bg-gray-50 text-gray-300">-</td>;
                          const isCancelled = log.subId === 'CANCELLED';
                          return (
                            <td key={c.id} onClick={() => setActiveCell({...log, logId: log.id})} className={`p-1 border-b cursor-pointer transition-all ${isActive ? 'bg-purple-100 ring-2 ring-inset ring-purple-500' : isCancelled ? 'bg-gray-100 border-x border-gray-200' : !log.subId ? 'bg-red-50 hover:bg-red-100 border-x border-red-100' : 'bg-green-50 hover:bg-green-100 border-x border-green-100'}`}>
                              {isCancelled ? ( <div className="text-gray-500 font-bold text-xs">S班取消</div> ) : !log.subId ? ( <div className="text-red-500 font-bold text-xs drop-shadow-sm">需要代課</div> ) : ( <div><div className="text-green-700 font-bold text-sm">{log.subName}</div>{log.note && <div className="text-[9px] text-orange-600 font-bold mt-0.5 leading-tight">{log.note}</div>}</div> )}
                              <div className="text-[10px] text-gray-500">{log.className || '(未輸入)'}</div>
                            </td>
                          );
                       })}
                       {absentCols.length === 0 && <td className="p-1 border-b border-gray-200"></td>}
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
      <div className="bg-white p-6 rounded-2xl shadow-xl border border-purple-100 space-y-4 animate-in fade-in zoom-in duration-300 h-full overflow-auto">
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
              {(getSortedTeachers(teachers) || []).map((t, index) => {
                if (!t) return null;
                return (
                  <tr key={t.id || index} className="hover:bg-purple-50 bg-white">
                    <td className="p-3 text-center">
                      <div className="flex flex-col gap-1 items-center justify-center">
                        <button onClick={() => moveTeacher(index, 'up')} disabled={index===0} className="text-gray-400 hover:text-purple-600 disabled:opacity-30 leading-none">▲</button><button onClick={() => moveTeacher(index, 'down')} disabled={index===((getSortedTeachers(teachers)||[]).length-1)} className="text-gray-400 hover:text-purple-600 disabled:opacity-30 leading-none">▼</button>
                      </div>
                    </td>
                    <td className="p-3 text-gray-500 font-medium text-xs">{t.title || '-'}</td><td className="p-3 font-medium">{t.name || '未知'}</td>
                    <td className="p-3 flex flex-wrap gap-1">{PERIODS.map(p => ( <button key={p} onClick={()=>toggleFreePeriod(t.id, p)} className={`w-7 h-7 rounded-full text-xs transition-all ${(t.freePeriods || []).includes(p) ? 'bg-green-100 text-green-700 border border-green-300 font-bold' : 'bg-gray-50 text-gray-300 border border-gray-100'}`}>{p}</button>))}</td>
                    <td className="p-3 text-center"><button onClick={()=>deleteTeacher(t.id)} className="text-gray-300 hover:text-red-500"><Trash2 size={16}/></button></td>
                  </tr>
                );
              })}
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
      if(!t) return null;
      const monthAbs = monthLogs.filter(l => String(l?.absentId) === String(t.id) && l.isCountedAbsence).length;
      const monthSubs = monthLogs.filter(l => String(l?.subId) === String(t.id) && l?.subId !== 'CANCELLED' && !l?.isSwap).length;
      return { ...t, monthAbs, monthSubs };
    }).filter(Boolean);
    return (
      <div className="space-y-6 animate-in fade-in zoom-in duration-300 h-full overflow-auto">
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
  
  const handleDutyChange = (dutyId, absentId, value) => {
    setDuties(prev => {
        const dateKey = formDate;
        const newDateDuties = { ...(prev[dateKey] || {}) };
        const newDutyInfo = { ...(newDateDuties[dutyId] || {}) };
        newDutyInfo[absentId] = value;
        newDateDuties[dutyId] = newDutyInfo;
        return { ...prev, [dateKey]: newDateDuties };
    });
  };

  const renderAdvancedView = () => {
    const dailyLogs = (Array.isArray(logs) ? logs : []).filter(l => l?.date === formDate);
    const uniqueAbsentIds = [...new Set(dailyLogs.map(l => String(l.absentId)))].filter(id => !id.startsWith("FROM_"));
    const orderedAbsentIds = absentColOrder.length > 0 ? absentColOrder.filter(id => uniqueAbsentIds.includes(id)) : uniqueAbsentIds;
    const absentCols = orderedAbsentIds.map(id => {
        const log = dailyLogs.find(l => String(l.absentId) === id);
        return log ? { id, name: log.absentName, reason: log.reason } : null;
    }).filter(Boolean);
    
    const dateDuties = duties[formDate] || {};

    const newAllRows = [
        EXTRA_DUTY_ROWS[0], EXTRA_DUTY_ROWS[1], EXTRA_DUTY_ROWS[2],
        ...PERIODS.slice(0, 2).map(p => ({ id: `L${p}`, time: '', label: `L${p}` })),
        EXTRA_DUTY_ROWS[3],
        ...PERIODS.slice(2, 4).map(p => ({ id: `L${p}`, time: '', label: `L${p}` })),
        EXTRA_DUTY_ROWS[4],
        ...PERIODS.slice(4, 6).map(p => ({ id: `L${p}`, time: '', label: `L${p}` })),
        EXTRA_DUTY_ROWS[5], EXTRA_DUTY_ROWS[6],
        ...PERIODS.slice(6, 9).map(p => ({ id: `L${p}`, time: '', label: `L${p}` })),
        EXTRA_DUTY_ROWS[7]
    ];

    return (
        <div className="bg-white p-6 rounded-2xl shadow-xl border border-blue-100 animate-in fade-in zoom-in duration-300 h-full flex flex-col">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-blue-800 flex items-center"><ClipboardEdit className="mr-2"/> 進階 - 當值安排</h2>
            </div>
            <div className="flex-1 overflow-auto rounded-lg border">
                <table className="w-full text-sm text-center border-collapse min-w-max">
                    <thead className="bg-blue-50 sticky top-0 z-10 shadow-sm">
                        <tr>
                            <th className="p-1 border-b border-r w-24">時間</th>
                            <th className="p-1 border-b border-r w-16">節次</th>
                            {absentCols.map(c => <th key={c.id} className="p-1 border-b min-w-[150px]">{c.name}</th>)}
                             {absentCols.length === 0 && <th className="p-1 border-b"></th>}
                        </tr>
                    </thead>
                    <tbody>
                        {newAllRows.map((row, index) => {
                            const isLesson = row.id.startsWith('L');
                            const period = isLesson ? parseInt(row.id.substring(1)) : null;
                            const dutyId = row.id;

                            return (
                                <tr key={index} className="hover:bg-blue-50/30">
                                    <td className="p-1 border-b border-r bg-blue-50 font-mono text-xs">{row.time}</td>
                                    <td className="p-1 border-b border-r bg-blue-50 font-bold">{row.label}</td>
                                    {absentCols.map(c => {
                                        if (isLesson) {
                                            const log = dailyLogs.find(l => String(l.absentId) === String(c.id) && l.period === period);
                                            return (
                                                <td key={`${c.id}-${period}`} className={`p-1 border-b ${!log || log.subId === 'CANCELLED' ? 'bg-gray-50' : ''}`}>
                                                    {log ? (log.subId === 'CANCELLED' ? <span className="text-gray-400 text-xs">S班取消</span> : log.subName || <span className="text-red-500 text-xs">未安排</span>) : ''}
                                                </td>
                                            );
                                        }
                                        return (
                                            <td key={`${c.id}-${dutyId}`} className="p-0 border-b">
                                                <input
                                                    type="text"
                                                    value={(dateDuties[dutyId] && dateDuties[dutyId][c.id]) || ''}
                                                    onChange={(e) => handleDutyChange(dutyId, c.id, e.target.value)}
                                                    className="w-full h-full p-1 text-center bg-transparent border-none outline-none focus:bg-yellow-100"
                                                />
                                            </td>
                                        );
                                    })}
                                    {absentCols.length === 0 && <td className="p-1 border-b border-gray-200"></td>}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const generateHtmlForReport = () => {
  const safeLogs = Array.isArray(logs) ? logs : [];
  const dailyLogs = safeLogs.filter(l => l?.date === formDate).sort((a, b) => (a?.period || 0) - (b?.period || 0));
  
  // 1. 統一轉為 String 處理，並過濾掉空值與轉上標記 (FROM_)
  const uniqueAbsentIds = [...new Set(dailyLogs.map(l => String(l?.absentId)))].filter(id => id && id !== 'undefined' && id !== 'null' && !id.startsWith("FROM_"));
  
  // 2. 同步「安排」與「進階」頁面的自訂欄位順序
  const orderedAbsentIds = absentColOrder.length > 0 ? absentColOrder.filter(id => uniqueAbsentIds.includes(id)) : uniqueAbsentIds;
  
  // 3. 透過 String 比對正確擷取缺席老師資料
  const absentCols = orderedAbsentIds.map(id => {
      const log = dailyLogs.find(l => String(l?.absentId) === id);
      return log ? { id: String(log.absentId), name: log.absentName, reason: log.reason } : null;
  }).filter(Boolean);

  let headers = '';
  absentCols.forEach(col => {
      headers += `<td style="width:109pt;border:1pt solid black;padding:4pt;"><p class="s2">${col.name}(${col.reason})</p></td>`;
  });

  const rowsData = {};
  EXTRA_DUTY_ROWS.forEach(row => rowsData[row.id] = {});
  PERIODS.forEach(p => rowsData[`L${p}`] = {});

  dailyLogs.forEach(log => {
      if (log?.absentId && rowsData[`L${log.period}`]) {
          const absentIdStr = String(log.absentId);
          const subText = log.subId === 'CANCELLED' ? 'S班取消' : log.subName || '未安排';
          rowsData[`L${log.period}`][absentIdStr] = `<p class="s2">${subText}${log.note ? ` (${log.note})` : ''}</p>`;
      }
  });
  
  const dateDuties = duties[formDate] || {};
  Object.keys(dateDuties).forEach(dutyId => {
      Object.keys(dateDuties[dutyId]).forEach(absentId => {
          if (rowsData[dutyId]) {
              rowsData[dutyId][String(absentId)] = `<p class="s2">${dateDuties[dutyId][absentId]}</p>`;
          }
      });
  });

  let bodyRows = '';
  const newAllRows = [
      EXTRA_DUTY_ROWS[0], EXTRA_DUTY_ROWS[1], EXTRA_DUTY_ROWS[2],
      ...PERIODS.slice(0, 2).map(p => ({ id: `L${p}`, time: ``, label: `L${p}` })),
      EXTRA_DUTY_ROWS[3],
      ...PERIODS.slice(2, 4).map(p => ({ id: `L${p}`, time: ``, label: `L${p}` })),
      EXTRA_DUTY_ROWS[4],
      ...PERIODS.slice(4, 6).map(p => ({ id: `L${p}`, time: ``, label: `L${p}` })),
      EXTRA_DUTY_ROWS[5], EXTRA_DUTY_ROWS[6],
      ...PERIODS.slice(6, 9).map(p => ({ id: `L${p}`, time: ``, label: `L${p}` })),
      EXTRA_DUTY_ROWS[7]
  ];

  newAllRows.forEach(row => {
      let cells = '';
      absentCols.forEach(col => {
          const content = (rowsData[row.id] && rowsData[row.id][col.id]) || '';
          cells += `<td style="width:109pt;border:1pt solid black;padding:4pt;">${content}</td>`;
      });
      bodyRows += `<tr style="height:23pt"><td style="border:1pt solid black;padding:4pt;"><p class="s3">${row.time}</p></td><td style="border:1pt solid black;padding:4pt;"><p class="s5">${row.label}</p></td>${cells}</tr>`;
  });
  
  const dateString = new Date(formDate).toLocaleDateString('zh-HK', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>代課安排</title><style>.s1{font-size:16pt;font-family:sans-serif;}.s2{font-size:12pt;font-family:sans-serif;}.s3{font-size:12pt;font-family:sans-serif;}.s5{font-size:14pt;font-family:sans-serif;} table{border-collapse:collapse;} td{padding:4pt; text-align:center;}</style></head><body><p class="s1" style="text-align:center;">香海正覺蓮社佛教正覺蓮社學校教師代課/轉上安排</p><p>${dateString}</p><table style="width:100%;"><thead><tr style="height:23pt"><th style="width:78pt;border:1pt solid black;"></th><th style="width:49pt;border:1pt solid black;"></th>${headers}</tr></thead><tbody>${bodyRows}</tbody></table></body></html>`;
};

  const downloadHtmlReport = () => {
    const htmlContent = generateHtmlForReport();
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `代課日誌_${formDate}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
  
  if (isLoading) return (<div className="min-h-screen bg-fuchsia-50 flex flex-col items-center justify-center"><Loader2 className="w-12 h-12 text-purple-600 animate-spin mb-4" /><h2 className="text-xl font-bold text-purple-800">正在同步資料...</h2></div>);

  return (
    <div className="h-screen bg-fuchsia-50 font-sans text-gray-800 selection:bg-fuchsia-200 overflow-hidden flex flex-col">
      {renderModal()}
      {renderSwapModal()}
      {renderReplaceModal()}
      {renderAssignModal()} 
      <nav className="bg-gradient-to-r from-purple-700 via-fuchsia-600 to-pink-600 text-white shadow-lg z-40 shrink-0">
        <div className="max-w-[1850px] mx-auto px-4 py-2 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
               <div className="font-bold text-xl flex items-center tracking-wide mr-3"><Calendar className="mr-2"/> 智慧代課系統 8.6</div>
               {isCloudEnabled ? 
                 <div className="flex items-center space-x-2 cursor-pointer" onClick={() => alert("目前連線狀態正常。")}><span className="text-[10px] bg-green-500/20 text-white px-2 py-0.5 rounded-full flex items-center border border-green-200/30"><Cloud size={10} className="mr-1"/> 雲端同步</span>{saveStatus === 'saving' && <span className="text-[10px] text-white/70 flex items-center"><Loader2 size={10} className="mr-1 animate-spin"/>儲存中...</span>}{saveStatus === 'error' && <span className="text-[10px] text-red-200 flex items-center bg-red-500/20 px-1 rounded"><AlertCircle size={10} className="mr-1"/>儲存失敗</span>}</div>
                 : <span className="text-[10px] bg-white/10 text-white/70 px-2 py-0.5 rounded-full flex items-center border border-white/10" onClick={() => alert("目前為本機模式。")}><CloudOff size={10} className="mr-1"/> 本機模式</span>
               }
            </div>
            <div className="flex space-x-1">
              {[{id:'arrange',label:'安排',icon:Search}, {id:'advanced',label:'進階',icon:ClipboardEdit}, {id:'report',label:'日誌',icon:Clock}, {id:'stats',label:'統計',icon:BarChart3}, {id:'teachers',label:'設定',icon:Users}].map(t=>(
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
        {currentView==='teachers' && renderTeachersView()}
        {currentView==='stats' && renderStatsView()}
        {currentView === 'advanced' && renderAdvancedView()}
        {currentView==='report' && renderReportView()}
      </main>
    </div>
  );
}