import React, { useState, useEffect, useRef } from 'react';
import { Users, Calendar, BarChart3, Clock, Plus, Trash2, UserCheck, Search, X, AlertCircle, CheckCircle, Upload, Download, FileText, Star, ArrowRight, Heart, Save, RefreshCw, BookOpen } from 'lucide-react';

// 設定：一天 9 節
const TOTAL_PERIODS = 9;
const PERIODS = Array.from({ length: TOTAL_PERIODS }, (_, i) => i + 1);

// 主科關鍵字設定 (可自行擴充)
const CORE_SUBJECTS = ['中文', '英文', '數學', 'CHI', 'ENG', 'MATH', 'CHINESE', 'ENGLISH', 'MATHEMATICS'];

export default function SubstitutionApp() {
  // --- 狀態管理 ---
  
  // 教師列表
  const [teachers, setTeachers] = useState(() => {
    const saved = localStorage.getItem('sub_teachers_v5');
    return saved ? JSON.parse(saved) : [
      { id: 1, name: "陳大文", freePeriods: [], absences: 0, substitutions: 0, masterSchedule: {}, scheduleDetails: {} },
      { id: 2, name: "李小美", freePeriods: [], absences: 2, substitutions: 1, masterSchedule: {}, scheduleDetails: {} },
      { id: 3, name: "張小明", freePeriods: [], absences: 0, substitutions: 0, masterSchedule: {}, scheduleDetails: {} },
    ];
  });

  // 日誌
  const [logs, setLogs] = useState(() => {
    const saved = localStorage.getItem('sub_logs');
    return saved ? JSON.parse(saved) : [];
  });

  const [currentView, setCurrentView] = useState('arrange'); 

  // 排代課表單
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [absentTeacherId, setAbsentTeacherId] = useState('');
  const [className, setClassName] = useState('');
  
  // 新增老師輸入框
  const [newName, setNewName] = useState(''); 

  // 檔案上傳 Ref
  const teacherImportRef = useRef(null);
  const timetableImportRef = useRef(null);
  const backupImportRef = useRef(null);

  // 彈出視窗狀態
  const [modal, setModal] = useState({
    isOpen: false,
    type: 'info', 
    title: '',
    message: '',
    onConfirm: null
  });
  
  // --- 副作用 ---
  
  useEffect(() => {
    localStorage.setItem('sub_teachers_v5', JSON.stringify(teachers));
  }, [teachers]);

  useEffect(() => {
    localStorage.setItem('sub_logs', JSON.stringify(logs));
  }, [logs]);

  // 日期變更時，重置所有老師的「原始」空堂狀態
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

  // --- 智慧連動邏輯 ---
  
  useEffect(() => {
    setSelectedPeriod('');
    setClassName('');
  }, [formDate, absentTeacherId]);

  const handlePeriodChange = (e) => {
    const newPeriod = e.target.value;
    setSelectedPeriod(newPeriod);
    
    if (newPeriod && absentTeacherId && formDate) {
      const p = parseInt(newPeriod);
      const dayOfWeek = new Date(formDate).getDay();
      const teacher = teachers.find(t => t.id == absentTeacherId);
      
      const key = `${dayOfWeek}-${p}`;
      const detail = teacher?.scheduleDetails?.[key];
      
      if (detail && detail.className) {
        setClassName(detail.className); 
      } else {
        setClassName(''); 
      }
    }
  };

  // --- 輔助工具：中文排序 ---
  const getSortedTeachers = (list) => {
    return [...list].sort((a, b) => a.name.localeCompare(b.name, "zh-HK"));
  };

  // --- 輔助函式 ---
  const showAlert = (title, message) => {
    setModal({ isOpen: true, type: 'info', title, message, onConfirm: null });
  };

  const showConfirm = (title, message, onConfirmAction) => {
    setModal({ isOpen: true, type: 'confirm', title, message, onConfirm: onConfirmAction });
  };

  const closeModal = () => {
    setModal({ ...modal, isOpen: false });
  };

  // --- 業務邏輯 ---

  const addTeacher = (e) => {
    e.preventDefault();
    if(newName.trim()) {
      const newTeacher = {
        id: Date.now(),
        name: newName,
        freePeriods: [], 
        absences: 0,
        substitutions: 0,
        masterSchedule: {},
        scheduleDetails: {}
      };
      setTeachers([...teachers, newTeacher]);
      setNewName('');
    }
  };

  const deleteTeacher = (id) => {
    showConfirm("刪除確認", "確定要刪除這位老師嗎？", () => {
      setTeachers(teachers.filter(t => t.id !== id));
      closeModal();
    });
  };

  const toggleFreePeriod = (teacherId, period) => {
    setTeachers(teachers.map(t => {
      if (t.id === teacherId) {
        const isFree = t.freePeriods.includes(period);
        return {
          ...t,
          freePeriods: isFree 
            ? t.freePeriods.filter(p => p !== period) 
            : [...t.freePeriods, period].sort((a, b) => a - b)
        };
      }
      return t;
    }));
  };

  const deleteLog = (logId) => {
    const logToDelete = logs.find(l => l.id === logId);
    if (!logToDelete) return;

    showConfirm("確認刪除", "確定要刪除這筆代課紀錄嗎？\n數據將會自動回滾。", () => {
      setTeachers(prev => prev.map(t => {
          let changes = {};
          const isAbsentTeacher = (logToDelete.absentId && t.id == logToDelete.absentId) || (!logToDelete.absentId && t.name === logToDelete.absentName);
          if (isAbsentTeacher) changes.absences = Math.max(0, t.absences - 1);
          
          const isSubTeacher = (logToDelete.subId && t.id == logToDelete.subId) || (!logToDelete.subId && t.name === logToDelete.subName);
          if (isSubTeacher) changes.substitutions = Math.max(0, t.substitutions - 1);
          
          return Object.keys(changes).length > 0 ? { ...t, ...changes } : t;
      }));
      setLogs(prev => prev.filter(l => l.id !== logId));
      closeModal();
    });
  };

  const handleSubstitutionClick = (subTeacherId, isExtracting) => {
    if (!absentTeacherId || !selectedPeriod || !className) {
      showAlert("資料不完整", "請填寫完整的缺課資訊（包含班別）");
      return;
    }

    const subTeacher = teachers.find(t => t.id == subTeacherId);
    const absentTeacher = teachers.find(t => t.id == absentTeacherId);

    if (!absentTeacher || !subTeacher) {
      showAlert("系統錯誤", "找不到老師資料。");
      return;
    }

    const message = (
      <div className="text-left mt-2 p-3 bg-fuchsia-50 rounded border border-fuchsia-100 text-sm">
        <p><strong>日期:</strong> {formDate}</p>
        <p><strong>節次:</strong> 第 {selectedPeriod} 節</p>
        <p><strong>缺課班別:</strong> {className}</p>
        <p className="text-red-500"><strong>缺席:</strong> {absentTeacher.name}</p>
        <hr className="my-2 border-fuchsia-200"/>
        <p className="text-purple-600"><strong>代課:</strong> {subTeacher.name}</p>
        {isExtracting && (
          <p className="text-orange-600 font-bold mt-1 text-xs">
            ⚠️ 注意：此操作將從其原有的支援課堂中抽離
          </p>
        )}
      </div>
    );

    showConfirm("確認安排代課？", message, () => {
      setTeachers(prev => prev.map(t => {
        if (t.id == absentTeacherId) return { ...t, absences: t.absences + 1 };
        if (t.id == subTeacherId) return { ...t, substitutions: t.substitutions + 1 };
        return t;
      }));
      
      setLogs(prev => [{
        id: Date.now(),
        date: formDate,
        period: parseInt(selectedPeriod),
        className,
        absentName: absentTeacher.name,
        absentId: absentTeacher.id, 
        subName: subTeacher.name,
        subId: subTeacher.id,       
        timestamp: new Date().toLocaleString()
      }, ...prev]);
      
      closeModal();
      setTimeout(() => showAlert("成功", "代課安排已完成！"), 100);
      setClassName('');
      setAbsentTeacherId('');
      setSelectedPeriod('');
    });
  };

  const getAvailableTeachers = () => {
    if (!selectedPeriod || !absentTeacherId) return [];
    
    const p = parseInt(selectedPeriod);
    const dayOfWeek = new Date(formDate).getDay();
    const targetKey = `${dayOfWeek}-${p}`; 
    const normalizedTargetClass = className ? className.trim().toUpperCase() : "";
    
    const dailyLogs = logs.filter(l => l.date === formDate);

    return teachers
      .map(t => {
        const subbedPeriods = dailyLogs.filter(log => log.subId == t.id).map(log => log.period);
        const actualFreePeriods = t.freePeriods.filter(fp => !subbedPeriods.includes(fp));
        return { ...t, actualFreePeriods, subbedPeriods };
      })
      .filter(t => {
        if (t.id == absentTeacherId) return false;
        const isFree = t.actualFreePeriods.includes(p);
        const scheduleInfo = t.scheduleDetails?.[targetKey];
        const isSupport = scheduleInfo?.isSupport === true;
        return isFree || isSupport;
      })
      .map(t => {
        const scheduleInfo = t.scheduleDetails?.[targetKey];
        const isSupport = scheduleInfo?.isSupport === true;
        const supportClass = scheduleInfo?.className || '';
        
        // 1. 是否為該節本班的支援老師 (最高優先)
        const isTargetClassSupport = normalizedTargetClass && supportClass === normalizedTargetClass && isSupport;

        // 2. 是否為該班的主科老師 (中英數) - 需掃描該老師的完整課表
        let isCoreTeacher = false;
        let coreSubjectName = "";
        
        if (normalizedTargetClass && t.scheduleDetails) {
            // 遍歷該老師所有課堂，檢查是否有教該班的中英數
            const allClasses = Object.values(t.scheduleDetails);
            const foundClass = allClasses.find(c => 
                c.className && 
                c.className.toUpperCase() === normalizedTargetClass && 
                c.subject && 
                CORE_SUBJECTS.some(sub => c.subject.toUpperCase().includes(sub))
            );
            
            if (foundClass) {
                isCoreTeacher = true;
                coreSubjectName = foundClass.subject;
            }
        }

        return { 
          ...t, 
          isExtractable: isSupport, 
          supportClass: supportClass,
          isPriorityTarget: isTargetClassSupport,
          isCoreTeacher: isCoreTeacher,
          coreSubjectName: coreSubjectName
        };
      })
      .sort((a, b) => {
        // 優先 1: 本班支援 (接手)
        if (a.isPriorityTarget && !b.isPriorityTarget) return -1;
        if (!a.isPriorityTarget && b.isPriorityTarget) return 1;

        // 優先 2: 抽離支援 (其他班)
        if (a.isExtractable && !b.isExtractable) return -1;
        if (!a.isExtractable && b.isExtractable) return 1;

        // 優先 3: 該班主科老師 (新加入)
        if (a.isCoreTeacher && !b.isCoreTeacher) return -1;
        if (!a.isCoreTeacher && b.isCoreTeacher) return 1;
        
        // 優先 4: 空堂多
        const freeCountA = a.actualFreePeriods.length;
        const freeCountB = b.actualFreePeriods.length;
        if (freeCountA !== freeCountB) return freeCountB - freeCountA; 
        
        // 優先 5: 代課少
        if (a.substitutions !== b.substitutions) return a.substitutions - b.substitutions; 
        
        // 優先 6: 缺課多
        if (b.absences === a.absences) return a.name.localeCompare(b.name, "zh-HK");
        return b.absences - a.absences; 
      });
  };

  // --- 資料備份與還原 ---
  const downloadBackup = () => {
    const data = {
      teachers: teachers,
      logs: logs,
      backupDate: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `代課系統備份_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleRestoreBackup = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (data.teachers && data.logs) {
          if(confirm('警告：還原備份將會「覆蓋」目前所有的資料。確定要繼續嗎？')) {
            setTeachers(data.teachers);
            setLogs(data.logs);
            showAlert("還原成功", "資料庫已回復到備份狀態。");
          }
        } else {
          throw new Error("格式不符");
        }
      } catch (err) {
        showAlert("還原失敗", "檔案格式錯誤，請確認這是本系統匯出的 JSON 備份檔。");
      }
      event.target.value = '';
    };
    reader.readAsText(file);
  };

  // --- CSV 匯入相關 ---
  const handleTeacherStatsUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const rows = e.target.result.split('\n').map(row => row.trim()).filter(r => r);
        let currentTeachers = [...teachers];
        let count = 0;
        for (let i = 1; i < rows.length; i++) {
          const cols = rows[i].split(',');
          if (cols.length < 3) continue;
          const name = cols[0].trim();
          const absences = parseInt(cols[1]) || 0;
          const substitutions = parseInt(cols[2]) || 0;
          const idx = currentTeachers.findIndex(t => t.name === name);
          if (idx >= 0) {
            currentTeachers[idx] = { ...currentTeachers[idx], absences, substitutions };
          } else {
            currentTeachers.push({ id: Date.now() + i, name, absences, substitutions, freePeriods: [], masterSchedule: {}, scheduleDetails: {} });
          }
          count++;
        }
        setTeachers(currentTeachers);
        showAlert("統計匯入成功", `已更新 ${count} 筆資料`);
        event.target.value = '';
      } catch (err) { showAlert("錯誤", "CSV 格式有誤"); }
    };
    reader.readAsText(file);
  };

  const handleTimetableUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const rows = e.target.result.split('\n').map(row => row.trim()).filter(r => r);
        let newTeachers = [...teachers];
        let count = 0;
        const scheduleMap = {}; 
        const detailsMap = {}; 

        for (let i = 1; i < rows.length; i++) {
          const cols = rows[i].split(',');
          if (cols.length < 3) continue; 
          const name = cols[0].trim();
          const day = parseInt(cols[1]); 
          const period = parseInt(cols[2]); 
          const className = cols[3] ? cols[3].trim().toUpperCase() : "";
          const subject = cols[4] ? cols[4].trim() : "";
          const isSupportStr = cols[5] ? cols[5].trim().toLowerCase() : "";
          const isSupport = ['是', 'y', 'yes', 'true', '1'].includes(isSupportStr);
          
          if (!name || isNaN(day) || isNaN(period)) continue;
          if (!scheduleMap[name]) scheduleMap[name] = {};
          if (!scheduleMap[name][day]) scheduleMap[name][day] = [];
          if(!scheduleMap[name][day].includes(period)) scheduleMap[name][day].push(period);

          if (!detailsMap[name]) detailsMap[name] = {};
          const key = `${day}-${period}`;
          detailsMap[name][key] = { className, subject, isSupport };
          count++;
        }

        newTeachers = newTeachers.map(t => {
          const update = {};
          if (scheduleMap[t.name]) update.masterSchedule = scheduleMap[t.name];
          if (detailsMap[t.name]) update.scheduleDetails = detailsMap[t.name];
          return { ...t, ...update };
        });

        Object.keys(scheduleMap).forEach(name => {
          if (!newTeachers.find(t => t.name === name)) {
            newTeachers.push({ id: Date.now() + Math.random(), name, freePeriods: [], absences: 0, substitutions: 0, masterSchedule: scheduleMap[name], scheduleDetails: detailsMap[name] || {} });
          }
        });

        setTeachers(newTeachers);
        showAlert("課表匯入成功", `已處理 ${count} 堂課。下次進入系統無需再匯入。`);
        event.target.value = '';
        const today = new Date().toISOString().split('T')[0];
        setFormDate('');
        setTimeout(() => setFormDate(today), 50);
      } catch (err) { showAlert("匯入失敗", "CSV 格式錯誤"); }
    };
    reader.readAsText(file);
  };

  const downloadTimetableTemplate = () => {
    const csvContent = "\ufeff姓名,星期(1-5),節次(1-9),班級(重要),科目,是否入班(是/否)\n陳大文,1,1,3A,數學,否\n陳大文,1,2,3A,數學,否\n李小美,1,1,3A,數學支援,是\n李小美,1,3,1C,英文,否";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'timetable_template_v2.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- 視圖渲染 ---
  
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
    const availableList = getAvailableTeachers();
    const dayOfWeek = new Date(formDate).getDay();
    const dayStr = ['日','一','二','三','四','五','六'][dayOfWeek] || '';
    
    // 計算缺席老師的「可排代節次」
    let absentTeacherBusyPeriods = [];
    let allCovered = false;

    const sortedTeachers = getSortedTeachers(teachers);

    if (absentTeacherId) {
      const teacher = teachers.find(t => t.id == absentTeacherId);
      if (teacher && teacher.masterSchedule && teacher.masterSchedule[dayOfWeek]) {
        const coveredPeriods = logs
          .filter(l => l.date === formDate && l.absentId == absentTeacherId)
          .map(l => l.period);
        
        const allPeriods = teacher.masterSchedule[dayOfWeek];
        absentTeacherBusyPeriods = allPeriods
          .filter(p => !coveredPeriods.includes(p)) 
          .sort((a,b) => a-b);
        
        if (allPeriods.length > 0 && absentTeacherBusyPeriods.length === 0) {
            allCovered = true;
        }
      }
    }

    return (
      <div className="space-y-6">
        <div className="bg-white p-6 rounded-2xl shadow-xl border border-purple-100">
          <h2 className="text-xl font-bold mb-4 flex items-center text-purple-800">
            <Search className="mr-2" /> 智慧排代 (Smart Arrange)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            
            {/* 1. 先選日期 */}
            <div>
              <label className="block text-sm font-medium text-purple-700 mb-1">
                1. 日期 <span className="text-fuchsia-600 font-bold">(星期{dayStr})</span>
              </label>
              <input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} className="w-full p-2 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-400 focus:outline-none" />
            </div>

            {/* 2. 再選缺席老師 (選單已排序) */}
            <div>
              <label className="block text-sm font-medium text-purple-700 mb-1">2. 缺席老師</label>
              <select value={absentTeacherId} onChange={(e) => setAbsentTeacherId(e.target.value)} className="w-full p-2 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-400 focus:outline-none bg-white">
                <option value="">-- 請選擇 --</option>
                {sortedTeachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>

            {/* 3. 自動篩選節次 */}
            <div>
              <label className="block text-sm font-medium text-purple-700 mb-1">
                3. 缺課節次 (僅顯示未排代時段)
              </label>
              <select 
                value={selectedPeriod} 
                onChange={handlePeriodChange} 
                className="w-full p-2 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-400 focus:outline-none disabled:bg-gray-100"
                disabled={!absentTeacherId}
              >
                <option value="">-- 請選擇 --</option>
                {absentTeacherId ? (
                  allCovered ? (
                    <option value="" disabled>該老師今日課堂已全數安排代課</option>
                  ) : absentTeacherBusyPeriods.length > 0 ? (
                    absentTeacherBusyPeriods.map(p => {
                      const key = `${dayOfWeek}-${p}`;
                      const teacher = teachers.find(t => t.id == absentTeacherId);
                      const detail = teacher?.scheduleDetails?.[key];
                      const info = detail?.className ? ` - ${detail.className}` : '';
                      return <option key={p} value={p}>第 {p} 節{info}</option>;
                    })
                  ) : <option value="" disabled>該老師當天沒有課堂</option>
                ) : (
                  PERIODS.map(p => <option key={p} value={p}>第 {p} 節</option>)
                )}
              </select>
            </div>

            {/* 4. 自動填入班別 */}
            <div>
              <label className="block text-sm font-medium text-purple-700 mb-1">
                4. 缺課班別 (自動/手動)
              </label>
              <input 
                type="text" 
                placeholder="例如：4C" 
                value={className} 
                onChange={(e) => setClassName(e.target.value)} 
                className="w-full p-2 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-400 focus:outline-none" 
              />
            </div>
          </div>

          {selectedPeriod && absentTeacherId && (
            <div className="mt-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <h3 className="text-lg font-semibold mb-2 text-purple-900 flex items-center">
                <Star className="mr-2 text-fuchsia-500" size={20}/> 建議代課人選
              </h3>
              
              <div className="mb-3 text-xs text-purple-600 bg-purple-50 p-2 rounded-lg border border-purple-100">
                <span className="font-bold">優先順序：</span> 
                <span className="text-orange-600 mx-1">抽離支援</span> 
                &gt; <span className="text-green-600 mx-1">該班主科(中英數)</span> 
                &gt; 空堂多 &gt; 代課少 &gt; 缺課多
              </div>

              {availableList.length === 0 ? (
                <div className="p-4 bg-red-50 text-red-600 rounded-lg text-center border border-red-100">該時段無人有空堂或可抽離。</div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-purple-100 shadow-sm">
                  <table className="min-w-full bg-white">
                    <thead className="bg-gradient-to-r from-purple-50 to-pink-50">
                      <tr>
                        <th className="py-3 px-4 text-left text-purple-800 font-semibold">姓名</th>
                        <th className="py-3 px-4 text-center text-blue-600 font-semibold text-sm">剩餘空堂</th>
                        <th className="py-3 px-4 text-center text-purple-600 font-semibold text-sm">代課</th>
                        <th className="py-3 px-4 text-center text-red-500 font-semibold text-sm">缺課</th>
                        <th className="py-3 px-4 text-center text-gray-600 font-semibold text-sm">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-purple-50">
                      {availableList.map(teacher => (
                        <tr key={teacher.id} className={`hover:bg-purple-50 transition-colors 
                          ${teacher.isExtractable ? 'bg-orange-50 hover:bg-orange-100' : ''}
                          ${teacher.isCoreTeacher && !teacher.isExtractable && !teacher.isPriorityTarget ? 'bg-green-50 hover:bg-green-100' : ''}
                        `}>
                          <td className="py-3 px-4 font-medium text-gray-800">
                            {teacher.name}
                            {/* 標籤顯示邏輯 */}
                            {teacher.isPriorityTarget ? (
                                <div className="flex items-center mt-1 text-xs text-purple-700 font-bold">
                                    <Star size={12} className="mr-1 fill-purple-500" />
                                    本班支援
                                </div>
                            ) : teacher.isExtractable ? (
                              <div className="flex items-center mt-1 text-xs text-orange-700">
                                <ArrowRight size={12} className="mr-1" />
                                抽離支援 ({teacher.supportClass})
                              </div>
                            ) : teacher.isCoreTeacher ? (
                              <div className="flex items-center mt-1 text-xs text-green-700 font-medium">
                                <BookOpen size={12} className="mr-1" />
                                該班主科 ({teacher.coreSubjectName})
                              </div>
                            ) : null}
                          </td>
                          <td className="py-3 px-4 text-center text-blue-600 font-bold">{teacher.actualFreePeriods.length}</td>
                          <td className="py-3 px-4 text-center text-purple-600 font-bold">{teacher.substitutions}</td>
                          <td className="py-3 px-4 text-center text-red-500 font-bold">{teacher.absences}</td>
                          <td className="py-3 px-4 text-center">
                            <button 
                              type="button"
                              onClick={() => handleSubstitutionClick(teacher.id, teacher.isExtractable)} 
                              className={`px-4 py-1.5 rounded-lg text-sm shadow-md text-white flex items-center mx-auto transition-all transform active:scale-95 ${teacher.isExtractable ? 'bg-gradient-to-r from-orange-400 to-orange-500 hover:from-orange-500 hover:to-orange-600' : 'bg-gradient-to-r from-purple-500 to-fuchsia-500 hover:from-purple-600 hover:to-fuchsia-600'}`}
                            >
                              {teacher.isExtractable ? (
                                <>抽離 <ArrowRight size={14} className="ml-1"/></>
                              ) : '指派'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderTeachersView = () => {
    const dayOfWeek = new Date(formDate).getDay();
    const sortedTeachers = getSortedTeachers(teachers);

    return (
      <div className="space-y-6">
        <div className="bg-white p-6 rounded-2xl shadow-xl border border-purple-100">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
            <h2 className="text-xl font-bold flex items-center text-purple-800"><UserCheck className="mr-2" /> 教師設定與課表</h2>
            <div className="flex gap-2 w-full md:w-auto">
              <button onClick={downloadTimetableTemplate} className="flex-1 md:flex-none flex items-center justify-center px-3 py-2 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 text-sm border border-purple-200 transition-colors">
                <Download size={16} className="mr-1" /> 下載範本
              </button>
              <button onClick={() => timetableImportRef.current?.click()} className="flex-1 md:flex-none flex items-center justify-center px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm shadow-md transition-colors">
                <FileText size={16} className="mr-1" /> 匯入全校課表
              </button>
              <input type="file" ref={timetableImportRef} onChange={handleTimetableUpload} accept=".csv" className="hidden" />
            </div>
          </div>
          
          <div className="mb-4 p-3 bg-purple-50 text-purple-900 rounded-lg text-sm border border-purple-100 flex items-start">
            <Heart className="mr-2 text-fuchsia-500 mt-0.5" size={16}/>
            <div>
                <strong>資料會自動儲存！</strong><br/>
                系統會自動將您的資料保留在此電腦的瀏覽器中。無需每次匯入。<br/>
                <span className="text-xs text-gray-500">若需換電腦操作，請至「統計」頁面使用「備份資料庫」功能。</span>
            </div>
          </div>

          <form onSubmit={addTeacher} className="flex gap-2 mb-6">
            <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="輸入新老師姓名..." className="flex-1 p-2 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-400 outline-none" />
            <button type="submit" className="bg-fuchsia-600 text-white px-4 py-2 rounded-lg hover:bg-fuchsia-700 flex items-center shadow-md"><Plus size={18} className="mr-1"/> 新增</button>
          </form>
          <div className="overflow-x-auto rounded-xl border border-purple-100">
            <table className="min-w-full text-sm">
              <thead className="bg-purple-50">
                <tr>
                  <th className="p-3 text-left w-32 text-purple-800">姓名 (依姓氏)</th>
                  <th className="p-3 text-left text-purple-800">當日空堂 (綠燈=可代課)</th>
                  <th className="p-3 text-center w-16 text-purple-800">刪除</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-purple-50">
                {sortedTeachers.map(t => (
                  <tr key={t.id} className="hover:bg-purple-50 bg-white">
                    <td className="p-3 font-medium text-gray-700">{t.name}</td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {PERIODS.map(p => (
                          <button type="button" key={p} onClick={() => toggleFreePeriod(t.id, p)} className={`w-8 h-8 rounded-full flex items-center justify-center text-xs transition-all transform hover:scale-105 ${t.freePeriods.includes(p) ? 'bg-green-100 text-green-700 border-2 border-green-400 font-bold shadow-sm' : 'bg-gray-100 text-gray-300 border border-gray-200'}`} title={`第 ${p} 節`}>{p}</button>
                        ))}
                      </div>
                    </td>
                    <td className="p-3 text-center">
                      <button type="button" onClick={() => deleteTeacher(t.id)} className="text-gray-400 hover:text-red-500 transition-colors"><Trash2 size={18} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderStatsView = () => {
    const sortedStats = getSortedTeachers(teachers);

    const exportStatsToCSV = () => {
      let csvContent = "\ufeff姓名,總缺課,總代課\n";
      sortedStats.forEach(t => {
        csvContent += `${t.name},${t.absences},${t.substitutions}\n`;
      });
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `教師缺代課統計_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };

    return (
      <div className="space-y-6">
        <div className="bg-white p-6 rounded-2xl shadow-xl border border-purple-100">
          <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
            <h2 className="text-xl font-bold flex items-center text-purple-800"><BarChart3 className="mr-2" /> 統計表</h2>
            <div className="flex gap-2">
               <button onClick={exportStatsToCSV} className="flex items-center px-3 py-1.5 bg-fuchsia-600 text-white rounded-lg hover:bg-fuchsia-700 text-sm shadow-md transition-colors">
                 <Download size={16} className="mr-1" /> 匯出統計 (.csv)
               </button>
               <button onClick={() => teacherImportRef.current?.click()} className="flex items-center px-3 py-1.5 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 text-sm border border-purple-200 transition-colors"><Upload size={16} className="mr-1" /> 匯入統計</button>
               <input type="file" ref={teacherImportRef} onChange={handleTeacherStatsUpload} accept=".csv" className="hidden" />
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border border-purple-100">
            <table className="min-w-full bg-white">
              <thead className="bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white">
                <tr>
                  <th className="py-3 px-4 text-left">老師姓名</th>
                  <th className="py-3 px-4 text-center">總缺課</th>
                  <th className="py-3 px-4 text-center">總代課</th>
                  <th className="py-3 px-4 text-center">淨值</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-purple-50">
                {sortedStats.map((t, idx) => (
                  <tr key={t.id} className="hover:bg-purple-50 bg-white">
                    <td className="py-3 px-4 font-medium text-gray-800">{t.name}</td>
                    <td className="py-3 px-4 text-center text-red-500 font-bold">{t.absences}</td>
                    <td className="py-3 px-4 text-center text-purple-600 font-bold">{t.substitutions}</td>
                    <td className={`py-3 px-4 text-center font-bold ${t.substitutions - t.absences >= 0 ? 'text-green-600' : 'text-red-500'}`}>{t.substitutions - t.absences}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-gradient-to-r from-gray-50 to-gray-100 p-6 rounded-2xl shadow-inner border border-gray-200">
            <h3 className="font-bold text-gray-700 mb-2 flex items-center"><Save className="mr-2" size={20}/> 資料庫管理 (備份/轉移)</h3>
            <p className="text-sm text-gray-500 mb-4">
                本系統會自動儲存在這台電腦。如果您想將資料轉移到手機或其他電腦，請先「下載備份」，再到另一台裝置「還原備份」。
            </p>
            <div className="flex gap-3">
                <button onClick={downloadBackup} className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-md transition-colors">
                    <Download size={18} className="mr-2" /> 下載完整備份 (JSON)
                </button>
                <button onClick={() => backupImportRef.current?.click()} className="flex items-center px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 shadow-sm transition-colors">
                    <RefreshCw size={18} className="mr-2" /> 還原備份
                </button>
                <input type="file" ref={backupImportRef} onChange={handleRestoreBackup} accept=".json" className="hidden" />
            </div>
        </div>
      </div>
    );
  };

  const renderReportView = () => {
    const dailyLogs = logs.filter(l => l.date === formDate);
    return (
      <div className="bg-white p-6 rounded-2xl shadow-xl border border-purple-100">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold flex items-center text-purple-800"><Clock className="mr-2" /> 代課紀錄日誌</h2>
          <input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} className="p-1 border border-purple-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400" />
        </div>
        {dailyLogs.length === 0 ? (
          <div className="text-center py-12 bg-purple-50 rounded-xl border border-purple-100 border-dashed">
            <Heart className="mx-auto text-purple-200 mb-2" size={48} />
            <p className="text-purple-400">{formDate} 尚無代課紀錄。</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-6 bg-gradient-to-br from-yellow-50 to-orange-50 border border-yellow-100 rounded-xl text-center relative shadow-sm">
              <h3 className="font-bold text-lg mb-4 text-gray-800 border-b border-yellow-200 pb-2 inline-block px-4">{formDate} 代課公告表</h3>
              <div className="grid gap-3">
                {dailyLogs.sort((a,b) => a.period - b.period).map(log => (
                  <div key={log.id} className="flex justify-between items-center bg-white p-4 rounded-lg shadow-sm border border-yellow-100 group hover:shadow-md transition-all">
                    <div className="flex items-center gap-3">
                      <span className="bg-purple-100 text-purple-800 px-3 py-1 rounded-full text-sm font-bold">第 {log.period} 節</span>
                      <span className="font-bold text-gray-700 text-lg">{log.className} 班</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-3 text-sm">
                            <span className="text-gray-400 line-through">{log.absentName}</span>
                            <ArrowRight size={16} className="text-gray-300" />
                            <span className="font-bold text-fuchsia-600 text-base bg-fuchsia-50 px-2 py-0.5 rounded">{log.subName} 代課</span>
                        </div>
                        <button 
                            onClick={() => deleteLog(log.id)}
                            className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-all opacity-0 group-hover:opacity-100"
                            title="刪除並復原統計"
                        >
                            <Trash2 size={18} />
                        </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-fuchsia-50 font-sans text-gray-800 relative pb-10">
      {renderModal()}
      <nav className="bg-gradient-to-r from-purple-700 via-fuchsia-600 to-pink-600 text-white shadow-lg sticky top-0 z-40 backdrop-blur-sm bg-opacity-95">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center font-bold text-xl tracking-wide">
              <Calendar className="mr-2" /> 智慧代課系統
            </div>
            <div className="flex space-x-1">
              {[{ id: 'arrange', label: '安排代課', icon: Search }, { id: 'teachers', label: '教師設定', icon: Users }, { id: 'report', label: '日誌', icon: Clock }, { id: 'stats', label: '統計', icon: BarChart3 }].map(tab => (
                <button key={tab.id} onClick={() => setCurrentView(tab.id)} className={`flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${currentView === tab.id ? 'bg-white/20 text-white shadow-inner backdrop-blur-md' : 'text-purple-100 hover:bg-white/10'}`}>
                  <tab.icon size={16} className="mr-1 sm:mr-2" /><span className="hidden sm:inline">{tab.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </nav>
      <main className="max-w-4xl mx-auto p-4 py-6">
        {currentView === 'arrange' && renderArrangeView()}
        {currentView === 'teachers' && renderTeachersView()}
        {currentView === 'stats' && renderStatsView()}
        {currentView === 'report' && renderReportView()}
      </main>
    </div>
  );
}