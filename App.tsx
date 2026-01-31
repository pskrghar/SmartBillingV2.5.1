import React, { useState, useEffect, useMemo, useRef } from 'react';
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import JSZip from "jszip";
import { 
  PlusIcon, 
  TrashIcon, 
  ArrowUpTrayIcon, 
  ArrowDownTrayIcon,
  Cog6ToothIcon, 
  ExclamationTriangleIcon, 
  CheckCircleIcon, 
  XMarkIcon, 
  ArrowsRightLeftIcon, 
  CalculatorIcon, 
  ListBulletIcon,
  ChevronDownIcon,
  CalendarDaysIcon,
  DocumentDuplicateIcon,
  DocumentTextIcon,
  DocumentIcon,
  ArchiveBoxIcon,
  ArrowLeftIcon,
  CodeBracketIcon,
  FolderIcon,
  FolderPlusIcon,
  PencilIcon,
  EllipsisVerticalIcon,
  ChevronRightIcon,
  ChartBarIcon,
  SparklesIcon,
  ClockIcon,
  MagnifyingGlassPlusIcon,
  MagnifyingGlassMinusIcon,
  PhotoIcon,
  CpuChipIcon,
  BoltIcon,
  ScaleIcon,
  Bars3Icon,
  PencilSquareIcon,
  SunIcon,
  MoonIcon,
  BookOpenIcon,
  ArrowDownOnSquareIcon,
  Square3Stack3DIcon,
  FolderArrowDownIcon
} from '@heroicons/react/24/outline';
import { BillingRow, ItemType, BillingConfig, ParsingError, SlabSummary, ManifestHistory, ManifestMetadata, Folder } from './types';
import { parseBillingDocument } from './services/geminiService';
import { calculateRow, calculateParcelAmount, evaluateExpression } from './utils/billingLogic';

const DEFAULT_CONFIG: BillingConfig = {
  parcelSlab1Rate: 3,
  parcelSlab2Rate: 2,
  parcelSlab3Rate: 1,
  documentRate: 5,
};

const STORAGE_KEY = 'smart_billing_manifest_history_v2';
const FOLDERS_KEY = 'smart_billing_folders_v2';
const GLOBAL_CONFIG_KEY = 'smart_billing_global_config';
const PREFS_KEY = 'smart_billing_user_prefs';

// Expanded overrides for full editing capability
interface ManifestOverride {
  date?: string;
  no?: string;
  pCount?: number;
  PCount?: number;
  dCount?: number;
  pWeight?: number;
  PDetail?: string; // Stores the string like "12+15+30"
}

// Bulk Import Types
interface BulkImportStatus {
  fileName: string;
  status: 'success' | 'error' | 'warning';
  message: string;
}

const App: React.FC = () => {
  // Navigation State
  const [view, setView] = useState<'dashboard' | 'billing'>('dashboard');
  const [dashboardTab, setDashboardTab] = useState<'history' | 'final'>('history');
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [selectedFinalFolderIds, setSelectedFinalFolderIds] = useState<string[]>([]);
  
  // App History & Folders Data
  const [history, setHistory] = useState<ManifestHistory[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  
  // Active Billing State
  const [activeManifestId, setActiveManifestId] = useState<string | null>(null);
  const [rows, setRows] = useState<BillingRow[]>([]);
  const [config, setConfig] = useState<BillingConfig>(DEFAULT_CONFIG);
  const [manifestMeta, setManifestMeta] = useState<ManifestMetadata>({ manifestNo: '', manifestDate: '' });
  
  // Global Settings State
  const [globalConfig, setGlobalConfig] = useState<BillingConfig>(DEFAULT_CONFIG);
  const [isGlobalSettingsOpen, setIsGlobalSettingsOpen] = useState(false);
  const [appTheme, setAppTheme] = useState<'light' | 'dark' | 'reading'>('light');
  const [appScale, setAppScale] = useState(100);
  
  // Final Bill Edit State
  const [isFinalBillEditing, setIsFinalBillEditing] = useState(false);
  const [finalBillOverrides, setFinalBillOverrides] = useState<Record<string, ManifestOverride>>({});
  const [reportMeta, setReportMeta] = useState({ month: '', agency: '', area: '' });

  // UI State
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isFinalExportOpen, setIsFinalExportOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("Processing...");
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadTab, setUploadTab] = useState<'doc' | 'img' | 'json'>('doc');
  
  // Folder Export UI
  const [isFolderExportOpen, setIsFolderExportOpen] = useState(false);
  
  // Bulk Import UI
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [bulkImportTab, setBulkImportTab] = useState<'zip' | 'multi'>('zip');
  const [bulkImportFolderId, setBulkImportFolderId] = useState<string>('new');
  const [bulkImportNewFolderName, setBulkImportNewFolderName] = useState('');
  const [bulkImportResults, setBulkImportResults] = useState<BulkImportStatus[]>([]);

  // Processing Mode State
  const [processingMode, setProcessingMode] = useState<'default' | 'hybrid'>('default');
  
  const [errors, setErrors] = useState<ParsingError[]>([]);
  const [status, setStatus] = useState<{ type: 'success' | 'info' | 'error', message: string } | null>(null);
  
  // Import Conflict State
  const [importConflict, setImportConflict] = useState<{ existing: ManifestHistory, newCandidate: ManifestHistory } | null>(null);
  
  // Folder UI State
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [manifestToMoveId, setManifestToMoveId] = useState<string | null>(null);

  // Per-column font size state for Modern Report
  const [fontSizes, setFontSizes] = useState({
    date: 14,
    units: 11,
    weight: 10,
    amount: 10
  });
  
  const exportRef = useRef<HTMLDivElement>(null);
  const finalExportRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(event.target as Node)) {
        setIsExportOpen(false);
      }
      if (finalExportRef.current && !finalExportRef.current.contains(event.target as Node)) {
        setIsFinalExportOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Load Data from LocalStorage
  useEffect(() => {
    const savedHistory = localStorage.getItem(STORAGE_KEY);
    const savedFolders = localStorage.getItem(FOLDERS_KEY);
    const savedGlobalConfig = localStorage.getItem(GLOBAL_CONFIG_KEY);
    const savedPrefs = localStorage.getItem(PREFS_KEY);

    if (savedHistory) {
      try { setHistory(JSON.parse(savedHistory)); } catch (e) { console.error("Failed to load history", e); }
    }
    if (savedFolders) {
      try { setFolders(JSON.parse(savedFolders)); } catch (e) { console.error("Failed to load folders", e); }
    }
    if (savedGlobalConfig) {
      try { setGlobalConfig(JSON.parse(savedGlobalConfig)); } catch (e) { console.error("Failed to load global config", e); }
    }
    if (savedPrefs) {
      try {
        const prefs = JSON.parse(savedPrefs);
        if (prefs.theme) setAppTheme(prefs.theme);
        if (prefs.scale) setAppScale(prefs.scale);
      } catch(e) { console.error("Failed to load prefs", e); }
    }
  }, []);

  const saveGlobalSettings = (newConfig: BillingConfig, newTheme: string, newScale: number) => {
      setGlobalConfig(newConfig);
      setAppTheme(newTheme as any);
      setAppScale(newScale);
      localStorage.setItem(GLOBAL_CONFIG_KEY, JSON.stringify(newConfig));
      localStorage.setItem(PREFS_KEY, JSON.stringify({ theme: newTheme, scale: newScale }));
  };

  // Recalculate everything when config changes (only when in billing mode)
  useEffect(() => {
    if (view === 'billing') {
      setRows(prevRows => prevRows.map(row => calculateRow(row, config)));
    }
  }, [config, view]);

  const totalAmount = useMemo(() => rows.reduce((sum, row) => sum + row.amount, 0), [rows]);

  // Derived state for active session summary
  const summary = useMemo(() => {
    const s = {
      slab1Weight: 0, slab2Weight: 0, slab3Weight: 0,
      parcelCountS1: 0, parcelCountS2Plus: 0,
      heavyParcelWeightsList: [] as number[],
      lightParcelsTotalWeight: 0, heavyParcelsTotalWeight: 0,
      docCount: 0, docTotal: 0, totalBillableWeight: 0,
      parcelCount: 0
    };
    rows.forEach(row => {
      if (row.type === ItemType.DOCUMENT) { s.docCount++; s.docTotal += row.amount; } 
      else {
        s.parcelCount++;
        const rounded = Math.ceil(row.weight);
        s.totalBillableWeight += rounded;
        const calc = calculateParcelAmount(row.weight, config);
        s.slab1Weight += calc.s1w; s.slab2Weight += calc.s2w; s.slab3Weight += calc.s3w;
        if (rounded <= 10) { s.parcelCountS1++; s.lightParcelsTotalWeight += rounded; } 
        else { s.parcelCountS2Plus++; s.heavyParcelsTotalWeight += rounded; s.heavyParcelWeightsList.push(rounded); }
      }
    });
    return s;
  }, [rows, config]);

  const filteredHistory = useMemo(() => {
    if (currentFolderId) return history.filter(h => h.folderId === currentFolderId);
    return history.filter(h => !h.folderId);
  }, [history, currentFolderId]);

  // Dynamic Page Title Logic
  const pageSubtitle = useMemo(() => {
    if (view === 'billing') return "Active Billing Session";
    if (dashboardTab === 'final') {
      return selectedFinalFolderIds.length > 0 ? "Monthly Consolidated Statement" : "Folder View";
    }
    return "Records Explorer";
  }, [view, dashboardTab, selectedFinalFolderIds]);

  const getFolderBreadcrumb = () => {
    if (!currentFolderId) return null;
    const currentFolder = folders.find(f => f.id === currentFolderId);
    return (
      <div className="flex items-center gap-2 mb-6 no-print overflow-x-auto whitespace-nowrap pb-2">
        <button onClick={() => setCurrentFolderId(null)} className="text-indigo-600 font-bold hover:underline">Root History</button>
        <ChevronRightIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
        <span className="text-gray-900 font-black">{currentFolder?.name || 'Folder'}</span>
      </div>
    );
  };

  // Data Persistence
  const saveHistory = (newHistory: ManifestHistory[]) => {
    setHistory(newHistory);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newHistory));
  };

  const saveFolders = (newFolders: Folder[]) => {
    setFolders(newFolders);
    localStorage.setItem(FOLDERS_KEY, JSON.stringify(newFolders));
  };

  // Folder Actions
  const handleCreateFolder = () => {
    if (!newFolderName.trim()) return;
    const newFolder: Folder = { id: crypto.randomUUID(), name: newFolderName, createdAt: Date.now() };
    saveFolders([...folders, newFolder]);
    setNewFolderName('');
    setIsCreateFolderOpen(false);
  };

  const handleRenameFolder = (id: string, newName: string) => {
    saveFolders(folders.map(f => f.id === id ? { ...f, name: newName } : f));
    setEditingFolderId(null);
  };

  const handleDeleteFolder = (id: string) => {
    if (confirm("Delete this folder? Manifests inside will be moved to root.")) {
      saveFolders(folders.filter(f => f.id !== id));
      saveHistory(history.map(h => h.folderId === id ? { ...h, folderId: undefined } : h));
      if (currentFolderId === id) setCurrentFolderId(null);
    }
  };

  const handleMoveManifest = (manifestId: string, folderId: string | null) => {
    saveHistory(history.map(h => h.id === manifestId ? { ...h, folderId: folderId || undefined } : h));
    setManifestToMoveId(null);
    setStatus({ type: 'success', message: 'Manifest moved successfully.' });
  };

  // --- FOLDER EXPORT FEATURE ---
  const exportFolderToZip = async (folderId: string) => {
    const folder = folders.find(f => f.id === folderId);
    if (!folder) return;

    const manifestsToExport = history.filter(h => h.folderId === folderId);
    
    if (manifestsToExport.length === 0) {
      alert("Folder is empty. Nothing to export.");
      return;
    }

    setLoadingMessage("Compressing folder...");
    setIsUploading(true);

    try {
      const zip = new JSZip();
      
      // Add Metadata
      const metadata = {
        folderName: folder.name,
        createdDate: new Date().toLocaleDateString(),
        createdTime: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
        totalManifests: manifestsToExport.length,
        version: "2.0"
      };
      zip.file("folder_info.json", JSON.stringify(metadata, null, 2));

      // Add Manifests
      manifestsToExport.forEach(manifest => {
        // Sanitize filename
        const safeName = manifest.manifestNo.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        zip.file(`${safeName}.json`, JSON.stringify(manifest, null, 2));
      });

      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${folder.name}_export.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setIsFolderExportOpen(false);
      setStatus({ type: 'success', message: 'Folder exported successfully.' });
    } catch (error) {
      console.error("Export failed", error);
      setStatus({ type: 'error', message: 'Export failed.' });
    } finally {
      setIsUploading(false);
    }
  };

  // --- BULK IMPORT HELPERS ---
  const processImportedManifest = (content: any, targetFolderId: string): BulkImportStatus => {
    try {
      if (!content.rows || !Array.isArray(content.rows)) {
        return { fileName: content.manifestNo || 'Unknown', status: 'error', message: 'Invalid format' };
      }

      // Check duplicates
      const exists = history.some(h => h.manifestNo === content.manifestNo);
      if (exists) {
        return { fileName: content.manifestNo, status: 'warning', message: 'Duplicate skipped' };
      }

      // Recalculate to ensure data integrity with current (or imported) config
      const configToUse = content.config || globalConfig;
      const rowsWithCalculations = content.rows.map((r: any) => calculateRow(r, configToUse));
      
      const newManifest: ManifestHistory = {
        id: crypto.randomUUID(),
        manifestNo: content.manifestNo || `IMP-${Date.now()}`,
        manifestDate: content.manifestDate || new Date().toLocaleDateString(),
        rows: rowsWithCalculations,
        config: configToUse,
        totalAmount: rowsWithCalculations.reduce((sum: number, r: any) => sum + r.amount, 0),
        itemCount: rowsWithCalculations.length,
        createdAt: Date.now(),
        folderId: targetFolderId
      };

      setHistory(prev => [newManifest, ...prev]);
      return { fileName: newManifest.manifestNo, status: 'success', message: 'Imported' };

    } catch (e) {
      return { fileName: 'Unknown File', status: 'error', message: 'Parse error' };
    }
  };

  const handleZipImport = async (file: File) => {
    setIsUploading(true);
    setLoadingMessage("Unzipping & Validating...");
    setBulkImportResults([]);

    try {
      const zip = await JSZip.loadAsync(file);
      
      // Check for folder info
      let folderName = file.name.replace('.zip', '');
      const infoFile = zip.file("folder_info.json");
      if (infoFile) {
        const infoText = await infoFile.async("text");
        const info = JSON.parse(infoText);
        if (info.folderName) folderName = info.folderName;
      }

      // Create new folder
      const newFolderId = crypto.randomUUID();
      const newFolder: Folder = { id: newFolderId, name: folderName, createdAt: Date.now() };
      setFolders(prev => [...prev, newFolder]);
      saveFolders([...folders, newFolder]); // Persist immediately

      const results: BulkImportStatus[] = [];
      const files = Object.keys(zip.files).filter(filename => filename.endsWith('.json') && filename !== 'folder_info.json');

      for (const filename of files) {
        const fileData = await zip.file(filename)?.async("text");
        if (fileData) {
          try {
            const json = JSON.parse(fileData);
            const result = processImportedManifest(json, newFolderId);
            results.push(result);
          } catch (e) {
            results.push({ fileName: filename, status: 'error', message: 'JSON Parse Error' });
          }
        }
      }
      
      setBulkImportResults(results);
      saveHistory([...history]); // Trigger persistence of history updates done in processImportedManifest logic (requires refactor to batch update usually, but here react state batching helps)
      // Actually, processImportedManifest calls setHistory multiple times which is bad. 
      // Refactoring to batch update:
      
    } catch (e) {
      console.error(e);
      setStatus({ type: 'error', message: 'Failed to read ZIP file.' });
    } finally {
      setIsUploading(false);
    }
  };

  // Refactored Batch Import Logic
  const executeBatchImport = (manifests: ManifestHistory[]) => {
    setHistory(prev => {
        const updated = [...manifests, ...prev];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        return updated;
    });
  };

  const handleBulkJsonImport = async (files: FileList) => {
    if (files.length > 30) {
      alert("Maximum 30 files allowed at once.");
      return;
    }

    // Determine target folder
    let targetId = bulkImportFolderId;
    if (bulkImportFolderId === 'new') {
      if (!bulkImportNewFolderName.trim()) {
        alert("Please enter a folder name.");
        return;
      }
      targetId = crypto.randomUUID();
      const newFolder = { id: targetId, name: bulkImportNewFolderName, createdAt: Date.now() };
      setFolders(prev => [...prev, newFolder]);
      saveFolders([...folders, newFolder]);
    }

    setLoadingMessage("Processing Bulk Import...");
    setIsUploading(true);
    
    const results: BulkImportStatus[] = [];
    const newManifests: ManifestHistory[] = [];

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
            const text = await file.text();
            const json = JSON.parse(text);
            
            // Check duplicate in existing history AND in current batch
            const exists = history.some(h => h.manifestNo === json.manifestNo) || newManifests.some(h => h.manifestNo === json.manifestNo);
            
            if (exists) {
                results.push({ fileName: file.name, status: 'warning', message: 'Duplicate skipped' });
                continue;
            }

            if (!json.rows) {
                 results.push({ fileName: file.name, status: 'error', message: 'Invalid structure' });
                 continue;
            }

            const configToUse = json.config || globalConfig;
            const rowsWithCalculations = json.rows.map((r: any) => calculateRow(r, configToUse));
            
            newManifests.push({
                id: crypto.randomUUID(),
                manifestNo: json.manifestNo || `IMP-${Date.now()}-${i}`,
                manifestDate: json.manifestDate || new Date().toLocaleDateString(),
                rows: rowsWithCalculations,
                config: configToUse,
                totalAmount: rowsWithCalculations.reduce((sum: number, r: any) => sum + r.amount, 0),
                itemCount: rowsWithCalculations.length,
                createdAt: Date.now(),
                folderId: targetId
            });
            
            results.push({ fileName: file.name, status: 'success', message: 'Ready to import' });

        } catch (e) {
            results.push({ fileName: file.name, status: 'error', message: 'Read failed' });
        }
    }

    executeBatchImport(newManifests);
    setBulkImportResults(results);
    setIsUploading(false);
  };

  const handleZipImportRefactored = async (file: File) => {
      setIsUploading(true);
      setLoadingMessage("Unzipping...");
      setBulkImportResults([]);

      try {
          const zip = await JSZip.loadAsync(file);
          
          let folderName = file.name.replace(/\.zip$/i, '');
          const infoFile = zip.file("folder_info.json");
          if (infoFile) {
              const infoText = await infoFile.async("text");
              try {
                  const info = JSON.parse(infoText);
                  if (info.folderName) folderName = info.folderName;
              } catch(e) {}
          }

          const newFolderId = crypto.randomUUID();
          const newFolder: Folder = { id: newFolderId, name: folderName, createdAt: Date.now() };
          
          const newManifests: ManifestHistory[] = [];
          const results: BulkImportStatus[] = [];
          
          const files = Object.keys(zip.files).filter(name => name.toLowerCase().endsWith('.json') && !name.includes('folder_info'));

          for (const filename of files) {
              const content = await zip.file(filename)?.async("text");
              if (!content) continue;
              try {
                  const json = JSON.parse(content);
                  const exists = history.some(h => h.manifestNo === json.manifestNo) || newManifests.some(h => h.manifestNo === json.manifestNo);
                  if (exists) {
                      results.push({ fileName: filename, status: 'warning', message: 'Duplicate' });
                      continue;
                  }
                  
                  // Process
                  const configToUse = json.config || globalConfig;
                  const rows = (json.rows || []).map((r: any) => calculateRow(r, configToUse));
                  newManifests.push({
                      id: crypto.randomUUID(),
                      manifestNo: json.manifestNo,
                      manifestDate: json.manifestDate,
                      rows: rows,
                      config: configToUse,
                      totalAmount: rows.reduce((s:number, r:any) => s + r.amount, 0),
                      itemCount: rows.length,
                      createdAt: Date.now(),
                      folderId: newFolderId
                  });
                  results.push({ fileName: filename, status: 'success', message: 'Valid' });
              } catch (e) {
                  results.push({ fileName: filename, status: 'error', message: 'Corrupt' });
              }
          }

          if (newManifests.length > 0) {
              setFolders(prev => {
                  const updated = [...prev, newFolder];
                  saveFolders(updated);
                  return updated;
              });
              executeBatchImport(newManifests);
          }
          setBulkImportResults(results);

      } catch (e) {
          alert("Invalid ZIP file");
      } finally {
          setIsUploading(false);
      }
  };


  const addRow = () => {
    const newRowBase: Omit<BillingRow, 'rate' | 'amount' | 'breakdown'> = {
      id: crypto.randomUUID(),
      slNo: rows.length + 1,
      serialNo: '',
      description: '',
      type: ItemType.PARCEL,
      weight: 0,
      isManualRate: false
    };
    const newRow = calculateRow(newRowBase, config);
    setRows([...rows, newRow]);
  };

  const updateRow = (id: string, updates: Partial<BillingRow>) => {
    setRows(prevRows => prevRows.map(row => {
      if (row.id === id) {
        return calculateRow({ ...row, ...updates }, config);
      }
      return row;
    }));
  };

  const deleteRow = (id: string) => {
    setRows(prevRows => {
      const filtered = prevRows.filter(row => row.id !== id);
      return filtered.map((row, index) => ({ ...row, slNo: index + 1 }));
    });
  };

  const applyGlobalType = (type: ItemType) => {
    setRows(prevRows => prevRows.map(row => calculateRow({ ...row, type }, config)));
  };

  const saveManifest = () => {
    const manifestData: ManifestHistory = {
      id: activeManifestId || crypto.randomUUID(),
      manifestNo: manifestMeta.manifestNo,
      manifestDate: manifestMeta.manifestDate,
      rows,
      config,
      totalAmount,
      itemCount: rows.length,
      createdAt: Date.now(),
      folderId: currentFolderId || undefined
    };

    let newHistory;
    if (activeManifestId) {
      newHistory = history.map(h => h.id === activeManifestId ? manifestData : h);
    } else {
      newHistory = [manifestData, ...history];
    }
    
    saveHistory(newHistory);
    setActiveManifestId(manifestData.id);
    setStatus({ type: 'success', message: 'Manifest saved successfully.' });
  };

  const autoSaveManifest = (newRows: BillingRow[], meta: ManifestMetadata, currentConfig: BillingConfig) => {
    const newId = crypto.randomUUID();
    const manifestData: ManifestHistory = {
      id: newId,
      manifestNo: meta.manifestNo,
      manifestDate: meta.manifestDate,
      rows: newRows,
      config: currentConfig,
      totalAmount: newRows.reduce((sum, r) => sum + r.amount, 0),
      itemCount: newRows.length,
      createdAt: Date.now(),
      folderId: currentFolderId || undefined
    };
    const newHistory = [manifestData, ...history];
    saveHistory(newHistory);
    setActiveManifestId(newId);
    return newId;
  };

  const startBlankSession = () => {
    setActiveManifestId(null); setRows([]); setConfig(globalConfig); // Use global config for new sessions
    setManifestMeta({ manifestNo: '', manifestDate: '' }); setView('billing');
  };

  const openManifestFromHistory = (manifest: ManifestHistory) => {
    setActiveManifestId(manifest.id); setRows(manifest.rows); setConfig(manifest.config);
    setManifestMeta({ manifestNo: manifest.manifestNo, manifestDate: manifest.manifestDate }); setView('billing');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resolveConflict = (action: 'keep_both' | 'override' | 'discard') => {
    if (!importConflict) return;
    const { existing, newCandidate } = importConflict;

    if (action === 'discard') {
      setStatus({ type: 'info', message: 'Import cancelled by user.' });
    } else if (action === 'keep_both') {
      const candidateToSave = { ...newCandidate, id: crypto.randomUUID() };
      saveHistory([candidateToSave, ...history]);
      setActiveManifestId(candidateToSave.id);
      setRows(candidateToSave.rows);
      setManifestMeta({ manifestNo: candidateToSave.manifestNo, manifestDate: candidateToSave.manifestDate });
      setConfig(candidateToSave.config);
      setView('billing');
      setStatus({ type: 'success', message: 'Imported as a new copy.' });
    } else if (action === 'override') {
      const newHistory = history.filter(h => h.id !== existing.id);
      const candidateToSave = { ...newCandidate, id: crypto.randomUUID() };
      saveHistory([candidateToSave, ...newHistory]);
      setActiveManifestId(candidateToSave.id);
      setRows(candidateToSave.rows);
      setManifestMeta({ manifestNo: candidateToSave.manifestNo, manifestDate: candidateToSave.manifestDate });
      setConfig(candidateToSave.config);
      setView('billing');
      setStatus({ type: 'success', message: 'Existing record overwritten.' });
    }

    setImportConflict(null);
    setIsUploadModalOpen(false);
  };

  // --- Upload Handlers ---

  const handleJsonFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = JSON.parse(e.target?.result as string);
        if (content.rows && Array.isArray(content.rows)) {
          const meta = {
            manifestNo: content.manifestNo || `MF-${Date.now().toString().slice(-6)}`,
            manifestDate: content.manifestDate || new Date().toLocaleDateString()
          };
          const configToUse = content.config || globalConfig; // Prefer file config, else global
          const rowsWithCalculations = content.rows.map((r: any) => calculateRow(r, configToUse));
          
          const newCandidate: ManifestHistory = {
            id: crypto.randomUUID(),
            manifestNo: meta.manifestNo,
            manifestDate: meta.manifestDate,
            rows: rowsWithCalculations,
            config: configToUse,
            totalAmount: rowsWithCalculations.reduce((sum: number, r: any) => sum + r.amount, 0),
            itemCount: rowsWithCalculations.length,
            createdAt: Date.now()
          };

          const existing = history.find(h => h.manifestNo === newCandidate.manifestNo);
          if (existing) {
            setImportConflict({ existing, newCandidate });
            return;
          }

          setRows(rowsWithCalculations);
          setManifestMeta(meta);
          setConfig(configToUse);
          const newId = autoSaveManifest(rowsWithCalculations, meta, configToUse);
          setActiveManifestId(newId);
          setView('billing');
          setStatus({ type: 'success', message: 'JSON Manifest imported and saved to history.' });
          setIsUploadModalOpen(false);
        } else { throw new Error("Invalid structure"); }
      } catch (err) { setStatus({ type: 'error', message: 'Failed to parse JSON manifest.' }); }
    };
    reader.readAsText(file);
  };

  const processFilesWithAI = async (files: File[], instruction: string) => {
    setIsUploading(true);
    setLoadingMessage("Initializing...");
    setStatus({ type: 'info', message: 'Analysis initiated...' });
    setErrors([]);

    try {
      const inputs = await Promise.all(files.map(async (file) => {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.onerror = reject;
        });
        return { data: base64, mimeType: file.type };
      }));

      const useHybrid = processingMode === 'hybrid';
      
      const result = await parseBillingDocument(
        inputs, 
        instruction, 
        useHybrid,
        (statusMsg) => setLoadingMessage(statusMsg)
      );
      
      const newRowsRaw = result.items.map((item: any, index: number) => ({
        id: crypto.randomUUID(),
        slNo: item.slNo || (index + 1),
        serialNo: item.serialNo || `AWB-${1000 + index}`,
        description: item.description || 'Processed Item',
        type: item.type === 'Document' ? ItemType.DOCUMENT : ItemType.PARCEL,
        weight: item.weight || 0,
        isManualRate: false
      }));
      // Use GLOBAL CONFIG for new imports
      const calculatedRows = newRowsRaw.map((r: any) => calculateRow(r, globalConfig));
      const meta = {
        manifestNo: result.manifestNo || `MF-${Math.floor(Math.random() * 90000) + 10000}`,
        manifestDate: result.manifestDate || new Date().toLocaleDateString()
      };

      const newCandidate: ManifestHistory = {
        id: crypto.randomUUID(),
        manifestNo: meta.manifestNo,
        manifestDate: meta.manifestDate,
        rows: calculatedRows,
        config: globalConfig,
        totalAmount: calculatedRows.reduce((sum: number, r: any) => sum + r.amount, 0),
        itemCount: calculatedRows.length,
        createdAt: Date.now()
      };

      const existing = history.find(h => h.manifestNo === newCandidate.manifestNo);
      if (existing) {
        setIsUploading(false);
        setImportConflict({ existing, newCandidate });
        return;
      }

      setRows(calculatedRows);
      setManifestMeta(meta);
      setErrors(result.errors || []);
      setConfig(globalConfig);
      const newId = autoSaveManifest(calculatedRows, meta, globalConfig);
      setActiveManifestId(newId);
      setStatus({ type: 'success', message: 'Document parsed successfully.' });
      setIsUploading(false); 
      setView('billing');
      setIsUploadModalOpen(false);
    } catch (err) {
      console.error(err);
      setStatus({ type: 'error', message: 'Analysis failed. Please try again or switch processing modes.' });
      setIsUploading(false);
    }
  };

  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if(!file) return;
    
    if(file.type === 'application/json' || file.name.endsWith('.json')) {
       handleJsonFile(file);
       return;
    }

    if (file.size > 5 * 1024 * 1024) {
        alert("File size too large. Please keep under 5MB for optimal AI processing.");
        return;
    }
    setIsUploadModalOpen(false);
    await processFilesWithAI([file], "Extract billing data.");
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files: File[] = e.target.files ? Array.from(e.target.files) : [];
    if(files.length === 0) return;
    if(files.length > 5) {
        alert("Maximum 5 images allowed");
        return;
    }
    setIsUploadModalOpen(false);
    await processFilesWithAI(files, "Extract billing data from these images. Treat them as sequential pages of one manifest.");
  };

  const handleJsonUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if(!file) return;
    handleJsonFile(file);
  };

  // --- End Upload Handlers ---

  // ... (existing export helpers omitted for brevity but preserved in full output) ...
  const deleteManifest = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm("Permanently delete this manifest record?")) {
      saveHistory(history.filter(h => h.id !== id));
    }
  };

  const handleExportExcel = () => {
    const headers = ["Sl.No", "Serial/AWB", "Description", "Type", "Weight(kg)", "Slab Breakdown", "Amount(₹)"];
    const csvContent = [headers.join(","), ...rows.map(r => [r.slNo, `"${r.serialNo}"`, `"${r.description}"`, r.type, r.weight, `"${r.breakdown}"`, r.amount].join(","))].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.setAttribute("href", url);
    link.setAttribute("download", `Manifest_${manifestMeta.manifestNo || 'Export'}.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    setIsExportOpen(false);
  };

  const handleExportJson = () => {
    const manifestData: ManifestHistory = {
      id: activeManifestId || crypto.randomUUID(),
      manifestNo: manifestMeta.manifestNo, manifestDate: manifestMeta.manifestDate,
      rows, config, totalAmount, itemCount: rows.length, createdAt: Date.now(),
      folderId: currentFolderId || undefined
    };
    const blob = new Blob([JSON.stringify(manifestData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.setAttribute("href", url);
    link.setAttribute("download", `Manifest_${manifestMeta.manifestNo || 'Export'}.json`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    setIsExportOpen(false);
  };

  const handleExportPdf = () => { window.print(); setIsExportOpen(false); };

  const parseDateStr = (dateStr: string) => {
    const parts = dateStr.split('/');
    if (parts.length === 3) return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0])).getTime();
    return new Date(dateStr).getTime();
  };

  const calculateManifestSummary = (manifest: ManifestHistory) => {
    const s = { 
      slab1Total: 0, slab2Total: 0, slab3Total: 0, docTotal: 0, totalAmount: 0, 
      smallParcelCount: 0, bigParcelCount: 0, docCount: 0, 
      totalWeight: 0, smallParcelTotalWeight: 0,
      s1w: 0, s2w: 0, s3w: 0,
      heavyWeights: [] as number[],
      heavyTotal: 0
    };
    manifest.rows.forEach(row => {
      if (row.type === ItemType.DOCUMENT) { 
        s.docCount++; s.docTotal += row.amount; 
      } else {
        const rounded = Math.ceil(row.weight);
        s.totalWeight += rounded;
        if (rounded > 10) {
          s.bigParcelCount++;
          s.heavyWeights.push(rounded);
          s.heavyTotal += rounded;
        } else {
          s.smallParcelCount++;
          s.smallParcelTotalWeight += rounded;
        }
        const calc = calculateParcelAmount(row.weight, manifest.config);
        s.s1w += calc.s1w; s.s2w += calc.s2w; s.s3w += calc.s3w;
        s.slab1Total += calc.s1w * manifest.config.parcelSlab1Rate;
        s.slab2Total += calc.s2w * manifest.config.parcelSlab2Rate;
        s.slab3Total += calc.s3w * manifest.config.parcelSlab3Rate;
      }
    });
    s.totalAmount = s.slab1Total + s.slab2Total + s.slab3Total + s.docTotal;
    return s;
  };

  // Helper to parse "15+20+25" into [15, 20, 25]
  const parsePDetail = (detail: string): number[] => {
    if (!detail) return [];
    return detail.split('+').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
  };

  const modernBillingReport = useMemo(() => {
    if (selectedFinalFolderIds.length === 0) return null;
    const folderManifests = history.filter(h => h.folderId && selectedFinalFolderIds.includes(h.folderId)).sort((a, b) => parseDateStr(a.manifestDate) - parseDateStr(b.manifestDate));
    
    // Apply overrides logic dynamically
    const lines = folderManifests.map(m => {
        const originalSummary = calculateManifestSummary(m);
        const override = finalBillOverrides[m.id] || {};
        
        // Use overrides or fallback to original calculated values
        const finalDate = override.date ?? m.manifestDate;
        const finalNo = override.no ?? m.manifestNo;
        const finalPCount = override.pCount ?? originalSummary.smallParcelCount;
        const finalDCount = override.dCount ?? originalSummary.docCount;
        const finalPWt = override.pWeight ?? originalSummary.smallParcelTotalWeight;
        
        // Logic for Heavy Parcels (P)
        let finalHeavyWeights = originalSummary.heavyWeights;
        
        // If P Detail is overridden, parse it to get new weights
        if (override.PDetail !== undefined) {
            finalHeavyWeights = parsePDetail(override.PDetail);
        }
        
        // Big Parcel Count (P): Use manual override OR derived from PDetail array length OR original
        const finalPBigCount = override.PCount ?? (override.PDetail !== undefined ? finalHeavyWeights.length : originalSummary.bigParcelCount);
        
        const finalHeavyTotal = finalHeavyWeights.reduce((a, b) => a + b, 0);
        
        // --- Recalculate Costs ---
        
        // Slab 1 Weight: Small Parcel Total + (Big Parcel Count * 10)
        const finalS1w = finalPWt + (finalPBigCount * 10);
        const finalSlab1Total = finalS1w * m.config.parcelSlab1Rate;
        
        // Recalculate Slab 2 & 3 based on specific heavy weights
        let finalS2w = 0;
        let finalS3w = 0;
        let finalSlab2Total = 0;
        let finalSlab3Total = 0;
        
        finalHeavyWeights.forEach(weight => {
             const calc = calculateParcelAmount(weight, m.config);
             finalS2w += calc.s2w;
             finalS3w += calc.s3w;
             // We recalculate totals here to be safe (cost = weight * rate)
             finalSlab2Total += calc.s2w * m.config.parcelSlab2Rate;
             finalSlab3Total += calc.s3w * m.config.parcelSlab3Rate;
        });
        
        const finalDocTotal = finalDCount * m.config.documentRate;
        const finalTotalAmount = finalSlab1Total + finalSlab2Total + finalSlab3Total + finalDocTotal;
        const finalTotalWeight = finalPWt + finalHeavyTotal;

        return {
            manifest: { ...m, manifestDate: finalDate, manifestNo: finalNo }, // Mocking updated manifest for display
            summary: {
                ...originalSummary,
                smallParcelCount: finalPCount,
                bigParcelCount: finalPBigCount,
                docCount: finalDCount,
                smallParcelTotalWeight: finalPWt,
                heavyWeights: finalHeavyWeights,
                heavyTotal: finalHeavyTotal,
                totalWeight: finalTotalWeight,
                s1w: finalS1w,
                s2w: finalS2w,
                s3w: finalS3w,
                slab1Total: finalSlab1Total,
                slab2Total: finalSlab2Total,
                slab3Total: finalSlab3Total,
                docTotal: finalDocTotal,
                totalAmount: finalTotalAmount
            },
            overrides: override // Pass override to know what to display in inputs
        };
    });

    const totals = lines.reduce((acc, curr) => ({
      p_small: acc.p_small + curr.summary.smallParcelCount,
      P_big: acc.P_big + curr.summary.bigParcelCount,
      d: acc.d + curr.summary.docCount, 
      w: acc.w + curr.summary.totalWeight, 
      sw: acc.sw + curr.summary.smallParcelTotalWeight,
      s1: acc.s1 + curr.summary.slab1Total, 
      s2: acc.s2 + curr.summary.slab2Total, 
      s3: acc.s3 + curr.summary.slab3Total,
      dt: acc.dt + curr.summary.docTotal, 
      grand: acc.grand + curr.summary.totalAmount,
      hw: acc.hw + curr.summary.heavyTotal,
      s1w: acc.s1w + curr.summary.s1w, 
      s2w: acc.s2w + curr.summary.s2w, 
      s3w: acc.s3w + curr.summary.s3w
    }), { p_small: 0, P_big: 0, d: 0, w: 0, sw: 0, s1: 0, s2: 0, s3: 0, dt: 0, grand: 0, hw: 0, s1w: 0, s2w: 0, s3w: 0 });
    
    // Fix total weight calc in totals (sw might have changed)
    totals.w = totals.sw + totals.hw;

    return { lines, totals, folderName: folders.filter(f => selectedFinalFolderIds.includes(f.id)).map(f => f.name).join(' + ') || 'Consolidated Report' };
  }, [selectedFinalFolderIds, history, folders, finalBillOverrides]);

  const changeFontSize = (col: keyof typeof fontSizes, delta: number) => {
    setFontSizes(prev => ({ ...prev, [col]: Math.max(8, prev[col] + delta) }));
  };

  const handleExportModernJson = () => {
    if (!modernBillingReport) return;
    const blob = new Blob([JSON.stringify(modernBillingReport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.setAttribute("href", url);
    link.setAttribute("download", `Statement_${modernBillingReport.folderName}_Export.json`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    setIsFinalExportOpen(false);
  };

  const handleExportModernExcel = () => {
    if (!modernBillingReport) return;
    const headers = ["#", "Date", "Manifest No", "Small Parcels (p)", "Big Parcels (P)", "Docs (D)", "p weight", "P detail", "Total Wt", "Amount Logic", "Net Amount"];
    const csvContent = [
      headers.join(","),
      ...modernBillingReport.lines.map((l, i) => [
        i + 1, l.manifest.manifestDate, l.manifest.manifestNo, l.summary.smallParcelCount, l.summary.bigParcelCount, l.summary.docCount,
        l.summary.smallParcelTotalWeight,
        l.summary.heavyWeights.length > 0 ? `"${l.summary.heavyWeights.join('+')}=${l.summary.heavyTotal}"` : "0",
        l.summary.totalWeight,
        `"S1:(${l.summary.s1w}kg@${l.manifest.config.parcelSlab1Rate}=₹${l.summary.slab1Total}) S2:(${l.summary.s2w}kg@${l.manifest.config.parcelSlab2Rate}=₹${l.summary.slab2Total}) S3:(${l.summary.s3w}kg@${l.manifest.config.parcelSlab3Rate}=₹${l.summary.slab3Total}) Doc:(${l.summary.docCount}*${l.manifest.config.documentRate}=₹${l.summary.docTotal})"`,
        l.summary.totalAmount
      ].join(",")),
      ["TOTALS", "", "", modernBillingReport.totals.p_small, modernBillingReport.totals.P_big, modernBillingReport.totals.d, modernBillingReport.totals.sw, modernBillingReport.totals.hw, modernBillingReport.totals.w, "", modernBillingReport.totals.grand].join(",")
    ].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.setAttribute("href", url);
    link.setAttribute("download", `Statement_${modernBillingReport.folderName}_Export.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    setIsFinalExportOpen(false);
  };

  const handleDownloadPDF = () => {
    if (!modernBillingReport) return;

    const doc = new jsPDF({
      orientation: "portrait",
      unit: "in",
      format: "a4"
    });

    const margin = 0.31;
    const ROWS_PER_PAGE = 12;

    const drawHeader = () => {
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      const companyName = "JETLINE COURIERS PVT. LTD.";
      const pageWidth = doc.internal.pageSize.width;
      const textWidth = doc.getTextWidth(companyName);
      doc.text(companyName, pageWidth / 2, margin + 0.2, { align: "center" });
      
      doc.setLineWidth(0.01);
      doc.line((pageWidth - textWidth) / 2, margin + 0.22, (pageWidth + textWidth) / 2, margin + 0.22);

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text("PATNA (BIHAR)", pageWidth / 2, margin + 0.4, { align: "center" });

      doc.line(margin, margin + 0.55, pageWidth - margin, margin + 0.55);

      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      const startY = margin + 0.75;
      
      doc.text(`MONTH: ${reportMeta.month || '____________'}`, margin, startY);
      doc.text(`AGENCY: ${reportMeta.agency || modernBillingReport.folderName}`, pageWidth / 2, startY, { align: "center" });
      doc.text(`AREA: ${reportMeta.area || '____________'}`, pageWidth - margin, startY, { align: "right" });

      doc.line(margin, startY + 0.15, pageWidth - margin, startY + 0.15);
    };

    const drawFooter = (pageNum: number, totalPages: number) => {
        const str = `Page ${pageNum} / ${totalPages}`;
        doc.setFontSize(8);
        doc.text(str, doc.internal.pageSize.width - margin, margin + 0.1, { align: "right" });
    };

    // Data Preparation (Chunking)
    const allLines = modernBillingReport.lines;
    const chunks = [];
    for (let i = 0; i < allLines.length; i += ROWS_PER_PAGE) {
        chunks.push(allLines.slice(i, i + ROWS_PER_PAGE));
    }

    // Pre-calculate Page Sums
    const pageSums = chunks.map(chunk => 
        chunk.reduce((sum, line) => sum + line.summary.totalAmount, 0)
    );

    let finalY = margin;

    chunks.forEach((chunk, index) => {
        if (index > 0) doc.addPage();
        
        drawHeader();

        const tableBody = chunk.map((l, i) => {
            // Global Serial No calculation: (chunkIndex * 12) + rowIndex + 1
            const slNo = (index * ROWS_PER_PAGE) + i + 1;
            
            const col2 = `${l.manifest.manifestDate}\n${l.manifest.manifestNo}`;
            const col3 = `p: ${l.summary.smallParcelCount}\nP: ${l.summary.bigParcelCount}\nD: ${l.summary.docCount}`;
            let col4 = `p = ${l.summary.smallParcelTotalWeight}kg`;
            if (l.summary.heavyWeights.length > 0) {
                col4 += `\nP detail: ${l.summary.heavyWeights.join('+')} = ${l.summary.heavyTotal}kg`;
            }
            col4 += `\nS1: (${l.summary.smallParcelTotalWeight} + ${l.summary.bigParcelCount}*10) = ${l.summary.s1w} kg | S2: ${l.summary.s2w} kg | S3: ${l.summary.s3w} kg`;
            
            let col5 = "";
            if (l.summary.s1w > 0) col5 += `S1: ${l.summary.s1w}kg * ${l.manifest.config.parcelSlab1Rate} = ${l.summary.slab1Total}\n`;
            if (l.summary.s2w > 0) col5 += `S2: ${l.summary.s2w}kg * ${l.manifest.config.parcelSlab2Rate} = ${l.summary.slab2Total}\n`;
            if (l.summary.s3w > 0) col5 += `S3: ${l.summary.s3w}kg * ${l.manifest.config.parcelSlab3Rate} = ${l.summary.slab3Total}\n`;
            if (l.summary.docCount > 0) col5 += `Doc: ${l.summary.docCount} no * ${l.manifest.config.documentRate} = ${l.summary.docTotal}\n`;
            
            col5 += `\nTotal = Rs.${l.summary.totalAmount}`;

            return [slNo.toString(), col2, col3, col4, col5];
        });

        autoTable(doc, {
            head: [['Sl', 'Date / Manifest', 'Parcel\n(p/P/D)', 'Weight Breakdown', 'Amount (Rs.)']],
            body: tableBody,
            startY: margin + 1.0,
            margin: { top: margin + 1.0, right: margin, bottom: margin + 0.5, left: margin },
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 0.05, textColor: 20, lineColor: 200, lineWidth: 0.005, valign: 'top', overflow: 'linebreak' },
            headStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: 'bold', halign: 'center' },
            columnStyles: {
                0: { cellWidth: 0.3, halign: 'center' },
                1: { cellWidth: 1.0 },
                2: { cellWidth: 0.6, halign: 'center' },
                3: { cellWidth: 'auto' },
                4: { cellWidth: 1.5, halign: 'right' }
            }
        });

        finalY = (doc as any).lastAutoTable.finalY;
    });

    // Check space for Grand Total (approx 2.5 inches needed)
    if (finalY > doc.internal.pageSize.height - 2.5) {
        doc.addPage();
        drawHeader();
        finalY = margin + 1.0;
    } else {
        finalY += 0.2;
    }

    // Grand Total Section
    doc.setFillColor(240, 245, 255);
    doc.rect(margin, finalY, doc.internal.pageSize.width - (2 * margin), 1.5, 'F');
    doc.setDrawColor(200);
    doc.rect(margin, finalY, doc.internal.pageSize.width - (2 * margin), 1.5, 'S');

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("TOTALS", margin + 0.2, finalY + 0.8);

    doc.setFontSize(9);
    doc.text(`p: ${modernBillingReport.totals.p_small}`, margin + 1.5, finalY + 0.4);
    doc.text(`P: ${modernBillingReport.totals.P_big}`, margin + 1.5, finalY + 0.6);
    doc.text(`D: ${modernBillingReport.totals.d}`, margin + 1.5, finalY + 0.8);

    doc.text(`p wt sum: ${modernBillingReport.totals.sw}kg`, margin + 2.5, finalY + 0.4);
    doc.text(`P detail sum: ${modernBillingReport.totals.hw}kg`, margin + 2.5, finalY + 0.6);

    doc.setFontSize(20);
    doc.text(`Rs.${modernBillingReport.totals.grand.toLocaleString()}`, doc.internal.pageSize.width - margin - 0.2, finalY + 0.8, { align: "right" });

    // Page Breakdown Summary
    let breakdownY = finalY + 1.7;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    
    if (pageSums.length > 0) {
        // Construct string: Page 1(Rs.X) + Page 2(Rs.Y) ...
        const breakdownParts = pageSums.map((sum, idx) => `Page ${idx + 1}(Rs.${sum.toLocaleString()})`);
        const breakdownStr = breakdownParts.join(' + ') + ` = Grand Total Rs.${modernBillingReport.totals.grand.toLocaleString()}`;
        
        const splitText = doc.splitTextToSize(breakdownStr, doc.internal.pageSize.width - (2 * margin));
        doc.text(splitText, margin, breakdownY);
        breakdownY += (splitText.length * 0.2);
    }

    // Signatures
    const bottomY = doc.internal.pageSize.height - margin - 0.5;
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Prepared By", margin, bottomY);
    doc.text("Verified By", doc.internal.pageSize.width / 2, bottomY, { align: "center" });
    doc.text("Authorized Signatory", doc.internal.pageSize.width - margin, bottomY, { align: "right" });

    // Final Footer Loop
    const totalPages = doc.internal.getNumberOfPages();
    for(let i=1; i<=totalPages; i++) {
        doc.setPage(i);
        drawFooter(i, totalPages);
    }

    doc.save(`Statement_${modernBillingReport.folderName}.pdf`);
  };

  const handleExportModernPdf = () => { window.print(); setIsFinalExportOpen(false); };

  const FontSizeControls = ({ col }: { col: keyof typeof fontSizes }) => (
    <div className="flex items-center gap-1 ml-2 opacity-0 group-hover/header:opacity-100 transition-opacity no-print">
      <button onClick={() => changeFontSize(col, 1)} className="p-0.5 hover:bg-indigo-100 rounded text-indigo-600"><MagnifyingGlassPlusIcon className="h-3 w-3"/></button>
      <button onClick={() => changeFontSize(col, -1)} className="p-0.5 hover:bg-indigo-100 rounded text-indigo-600"><MagnifyingGlassMinusIcon className="h-3 w-3"/></button>
    </div>
  );

  const renderBillingHistorySection = () => (
    <div className="space-y-6 md:space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 md:gap-8">
        <div>
           <h2 className="text-2xl md:text-4xl font-black text-indigo-950 tracking-tight">Records Explorer</h2>
           <p className="text-gray-400 font-bold uppercase tracking-widest text-[10px] md:text-xs mt-2 italic">Organize your manifests into folders</p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 md:gap-4 flex-wrap">
          <button onClick={() => setIsCreateFolderOpen(true)} className="bg-white border-2 border-indigo-100 text-indigo-600 px-4 md:px-6 py-3 md:py-4 rounded-xl md:rounded-[2rem] font-black hover:bg-indigo-50 transition-all active:scale-95 flex items-center justify-center group text-sm md:text-base"><FolderPlusIcon className="h-5 w-5 mr-3 group-hover:scale-110 transition-transform" />New Folder</button>
          
          <button onClick={() => setIsFolderExportOpen(true)} className="bg-white border-2 border-indigo-100 text-indigo-600 px-4 md:px-6 py-3 md:py-4 rounded-xl md:rounded-[2rem] font-black hover:bg-indigo-50 transition-all active:scale-95 flex items-center justify-center group text-sm md:text-base">
             <ArrowDownOnSquareIcon className="h-5 w-5 mr-3 group-hover:translate-y-1 transition-transform" />Folder Export
          </button>

          <button onClick={() => setIsUploadModalOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 md:px-8 py-3 md:py-4 rounded-xl md:rounded-[2rem] font-black shadow-xl shadow-indigo-100 flex items-center justify-center transition-all active:scale-95 group text-sm md:text-base">
             <ArrowUpTrayIcon className="h-5 w-5 mr-3 group-hover:-translate-y-1 transition-transform" />Import
          </button>

          <button onClick={() => setIsBulkImportOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 md:px-8 py-3 md:py-4 rounded-xl md:rounded-[2rem] font-black shadow-xl shadow-indigo-100 flex items-center justify-center transition-all active:scale-95 group text-sm md:text-base">
             <Square3Stack3DIcon className="h-5 w-5 mr-3 group-hover:-translate-y-1 transition-transform" />Bulk Import
          </button>
          
          <button onClick={startBlankSession} className="bg-white border-2 border-indigo-100 text-indigo-600 px-4 md:px-8 py-3 md:py-4 rounded-xl md:rounded-[2rem] font-black hover:bg-indigo-50 transition-all active:scale-95 text-sm md:text-base text-center">Manual</button>
        </div>
      </header>
      {getFolderBreadcrumb()}
      {folders.length === 0 && history.length === 0 ? (
        <div className="bg-white rounded-2xl md:rounded-[3rem] p-10 md:p-20 text-center border-2 md:border-4 border-dashed border-gray-100"><div className="mx-auto h-20 w-20 md:h-24 md:w-24 bg-gray-50 rounded-[2rem] md:rounded-[2.5rem] flex items-center justify-center mb-6"><ArchiveBoxIcon className="h-8 w-8 md:h-10 md:w-10 text-gray-300" /></div><h3 className="text-xl md:text-2xl font-black text-gray-300 mb-2">Workspace Empty</h3><p className="text-gray-400 text-xs md:text-sm max-w-sm mx-auto">Start by creating a folder or uploading a manifest.</p></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-8">
          {!currentFolderId && folders.map(folder => (
            <div key={folder.id} onClick={() => setCurrentFolderId(folder.id)} className="group bg-white rounded-2xl md:rounded-[2.5rem] p-6 md:p-8 border border-gray-100 shadow-sm hover:shadow-2xl hover:-translate-y-1 md:hover:-translate-y-2 transition-all cursor-pointer relative overflow-hidden">
              <div className="flex justify-between items-start mb-6"><div className="bg-indigo-100 text-indigo-600 p-3 md:p-4 rounded-xl md:rounded-2xl group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-sm"><FolderIcon className="h-6 w-6 md:h-8 md:w-8" /></div><div className="flex gap-2"><button onClick={(e) => { e.stopPropagation(); setEditingFolderId(folder.id); setNewFolderName(folder.name); }} className="p-2 text-gray-300 hover:text-indigo-600 transition-colors"><PencilIcon className="h-5 w-5"/></button><button onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder.id); }} className="p-2 text-gray-300 hover:text-red-500 transition-colors"><TrashIcon className="h-5 w-5"/></button></div></div>
              <h4 className="text-lg md:text-2xl font-black text-gray-900 truncate">{folder.name}</h4>
              <p className="text-[10px] md:text-xs font-bold text-gray-400 mt-2 uppercase tracking-widest">{history.filter(h => h.folderId === folder.id).length} Manifests</p>
            </div>
          ))}
          {filteredHistory.map((manifest) => (
            <div key={manifest.id} onClick={() => openManifestFromHistory(manifest)} className="group bg-white rounded-2xl md:rounded-[2.5rem] p-6 md:p-8 border border-gray-100 shadow-sm hover:shadow-2xl hover:-translate-y-1 md:hover:-translate-y-2 transition-all cursor-pointer relative overflow-hidden">
              <div className="absolute top-0 right-0 p-6 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity"><DocumentDuplicateIcon className="h-20 w-20 md:h-28 md:w-28 text-indigo-900" /></div>
              <div className="flex justify-between items-start mb-6 md:mb-8"><div className="bg-indigo-50 text-indigo-600 p-3 md:p-4 rounded-xl md:rounded-2xl group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-sm"><ListBulletIcon className="h-6 w-6 md:h-7 md:w-7" /></div><div className="flex gap-2 relative"><button onClick={(e) => { e.stopPropagation(); setManifestToMoveId(manifestToMoveId === manifest.id ? null : manifest.id); }} className="p-2 text-gray-300 hover:text-indigo-600 transition-colors bg-white rounded-full shadow-sm"><EllipsisVerticalIcon className="h-5 w-5" /></button><button onClick={(e) => deleteManifest(e, manifest.id)} className="p-2 text-gray-300 hover:text-red-500 transition-colors bg-white rounded-full shadow-sm"><TrashIcon className="h-5 w-5" /></button>{manifestToMoveId === manifest.id && (<div className="absolute right-0 top-12 w-56 bg-white rounded-2xl shadow-2xl border border-gray-100 py-3 z-50 animate-in fade-in slide-in-from-top-2"><div className="px-4 pb-2 mb-2 border-b border-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-widest">Move to Folder</div><button onClick={(e) => { e.stopPropagation(); handleMoveManifest(manifest.id, null); }} className="w-full px-5 py-2 text-left text-xs font-bold text-gray-600 hover:bg-indigo-50 transition-colors"> Root History</button>{folders.map(f => (<button key={f.id} onClick={(e) => { e.stopPropagation(); handleMoveManifest(manifest.id, f.id); }} className="w-full px-5 py-2 text-left text-xs font-bold text-gray-600 hover:bg-indigo-50 transition-colors truncate"> {f.name}</button>))}</div>)}</div></div>
              <div className="space-y-1"><div className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">Manifest ID</div><h4 className="text-xl md:text-2xl font-black text-gray-900 truncate">{manifest.manifestNo}</h4></div>
              <div className="mt-4 flex items-center text-xs font-bold text-gray-400 bg-gray-50 inline-flex px-3 py-1 rounded-lg"><CalendarDaysIcon className="h-4 w-4 mr-2" /> {manifest.manifestDate}</div>
              <div className="mt-8 md:mt-10 pt-4 md:pt-6 border-t border-gray-100 flex items-end justify-between"><div><div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Total Bill</div><div className="text-2xl md:text-3xl font-black text-indigo-950">₹{manifest.totalAmount.toLocaleString()}</div></div><div className="flex flex-col items-end"><div className="text-[10px] font-bold bg-emerald-50 text-emerald-600 px-3 py-1 rounded-full uppercase tracking-tighter shadow-sm mb-1">{manifest.itemCount} Units</div></div></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderBillingEditor = () => (
    <div className="w-full max-w-7xl mx-auto p-4 md:p-8 animate-in slide-in-from-bottom-4 duration-500">
      {/* Header with Meta */}
      <div className="bg-white rounded-2xl md:rounded-[2rem] shadow-sm border border-gray-100 p-6 md:p-8 mb-6 md:mb-8">
         <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
            <div>
               <h2 className="text-2xl md:text-3xl font-black text-gray-900">Manifest Editor</h2>
               <div className="flex items-center gap-2 mt-2">
                 <span className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">{rows.length} Items</span>
                 {status && <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${status.type === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>{status.message}</span>}
               </div>
            </div>
            <div className="flex items-center gap-3 w-full md:w-auto">
                <button onClick={() => setIsConfigOpen(true)} className="p-3 rounded-xl bg-gray-50 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all"><Cog6ToothIcon className="h-6 w-6" /></button>
                <button onClick={saveManifest} className="flex-1 md:flex-none py-3 px-8 bg-indigo-600 text-white rounded-xl font-black hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 active:scale-95">Save Changes</button>
            </div>
         </div>
         
         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block ml-1">Manifest Number</label>
              <input type="text" value={manifestMeta.manifestNo} onChange={(e) => setManifestMeta({...manifestMeta, manifestNo: e.target.value})} className="w-full px-5 py-3 bg-gray-50 border-2 border-gray-100 rounded-xl font-bold text-gray-900 focus:border-indigo-500 focus:ring-0 transition-all" placeholder="e.g. MF-2024-001" />
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block ml-1">Manifest Date</label>
              <input type="text" value={manifestMeta.manifestDate} onChange={(e) => setManifestMeta({...manifestMeta, manifestDate: e.target.value})} className="w-full px-5 py-3 bg-gray-50 border-2 border-gray-100 rounded-xl font-bold text-gray-900 focus:border-indigo-500 focus:ring-0 transition-all" placeholder="DD/MM/YYYY" />
            </div>
         </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 md:mb-8">
         <div className="bg-indigo-600 rounded-2xl p-5 text-white shadow-xl shadow-indigo-200">
            <div className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-1">Total Amount</div>
            <div className="text-2xl md:text-3xl font-black">₹{totalAmount.toLocaleString()}</div>
         </div>
         <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Total Weight</div>
            <div className="text-2xl md:text-3xl font-black text-gray-900">{summary.totalBillableWeight} <span className="text-sm text-gray-400">kg</span></div>
         </div>
         <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Documents</div>
            <div className="text-2xl md:text-3xl font-black text-gray-900">{summary.docCount}</div>
         </div>
         <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Parcels</div>
            <div className="text-2xl md:text-3xl font-black text-gray-900">{summary.parcelCount}</div>
         </div>
      </div>

      {/* Errors Area */}
      {errors.length > 0 && (
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-6 mb-8">
           <h3 className="text-amber-800 font-bold flex items-center mb-4"><ExclamationTriangleIcon className="h-5 w-5 mr-2"/> Attention Required</h3>
           <ul className="space-y-2">
             {errors.map((err, idx) => (
               <li key={idx} className="text-sm text-amber-700 bg-white/50 px-4 py-2 rounded-lg flex items-start">
                 <span className="font-bold mr-2 uppercase text-[10px] bg-amber-200 px-2 py-0.5 rounded text-amber-800 mt-0.5">{err.type}</span>
                 {err.message}
               </li>
             ))}
           </ul>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl md:rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden">
         <div className="overflow-x-auto">
           <table className="w-full text-left border-collapse">
             <thead>
               <tr className="bg-gray-50/50 border-b border-gray-100">
                 <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest w-16">#</th>
                 <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest w-48">Reference / AWB</th>
                 <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest w-64">Description</th>
                 <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest w-32">Type</th>
                 <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest w-32 text-right">Weight</th>
                 <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Rate</th>
                 <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Amount</th>
                 <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest w-16"></th>
               </tr>
             </thead>
             <tbody className="divide-y divide-gray-50">
               {rows.map((row) => (
                 <tr key={row.id} className="group hover:bg-indigo-50/30 transition-colors">
                   <td className="px-6 py-4 font-bold text-gray-400 text-sm">{row.slNo}</td>
                   <td className="px-6 py-4">
                      <input type="text" value={row.serialNo} onChange={(e) => updateRow(row.id, { serialNo: e.target.value })} className="w-full bg-transparent font-bold text-gray-900 focus:outline-none focus:text-indigo-600 transition-colors placeholder-gray-300" placeholder="AWB No..." />
                   </td>
                   <td className="px-6 py-4">
                      <input type="text" value={row.description} onChange={(e) => updateRow(row.id, { description: e.target.value })} className="w-full bg-transparent font-medium text-gray-600 focus:outline-none focus:text-indigo-600 transition-colors placeholder-gray-300 text-sm" placeholder="Item description..." />
                   </td>
                   <td className="px-6 py-4">
                      <select value={row.type} onChange={(e) => updateRow(row.id, { type: e.target.value as ItemType })} className="bg-gray-100 rounded-lg px-2 py-1 text-xs font-bold text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer hover:bg-gray-200 transition-colors">
                        <option value={ItemType.PARCEL}>Parcel</option>
                        <option value={ItemType.DOCUMENT}>Document</option>
                      </select>
                   </td>
                   <td className="px-6 py-4 text-right">
                     <div className="flex items-center justify-end">
                       <input 
                         type="number" step="0.01"
                         value={row.weight} 
                         onChange={(e) => updateRow(row.id, { weight: parseFloat(e.target.value) || 0 })}
                         className="w-20 text-right bg-transparent font-bold text-gray-900 focus:outline-none focus:text-indigo-600 transition-colors placeholder-gray-300" 
                         placeholder="0"
                        />
                        <span className="text-xs text-gray-400 font-bold ml-1">kg</span>
                     </div>
                   </td>
                   <td className="px-6 py-4 text-right">
                      <div className="flex flex-col items-end">
                        <div className="text-sm font-bold text-gray-900">₹{row.rate.toFixed(2)}</div>
                        <div className="text-[10px] text-gray-400 font-medium truncate max-w-[150px]">{row.breakdown}</div>
                      </div>
                   </td>
                   <td className="px-6 py-4 text-right">
                      <div className="text-sm font-black text-indigo-900">₹{row.amount.toFixed(2)}</div>
                   </td>
                   <td className="px-6 py-4 text-right opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => deleteRow(row.id)} className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"><TrashIcon className="h-4 w-4" /></button>
                   </td>
                 </tr>
               ))}
             </tbody>
           </table>
         </div>
         <button onClick={addRow} className="w-full py-4 bg-gray-50 text-gray-400 font-bold hover:bg-indigo-50 hover:text-indigo-600 transition-all flex items-center justify-center gap-2 text-sm"><PlusIcon className="h-5 w-5"/> Add Line Item</button>
      </div>
    </div>
  );

  const themeClasses = {
    light: 'bg-slate-50 text-slate-900',
    dark: 'bg-slate-900 text-slate-100',
    reading: 'bg-amber-50 text-slate-800'
  };

  const toggleFolderSelection = (folderId: string) => {
    setSelectedFinalFolderIds(prev => 
      prev.includes(folderId) ? prev.filter(id => id !== folderId) : [...prev, folderId]
    );
  };

  const renderFinalBillingSection = () => {
    return (
      <div className="p-4 md:p-8 animate-in fade-in duration-500">
        <div className="mb-8">
           <h2 className="text-2xl md:text-3xl font-black text-indigo-950">Consolidated Billing</h2>
           <p className="text-gray-400 font-bold uppercase tracking-widest text-[10px] md:text-xs mt-2 italic">Select folders to generate a combined monthly report</p>
        </div>

        {/* Folder Selection Grid */}
        <div className="mb-8">
           <h3 className="text-sm font-black text-gray-500 uppercase tracking-widest mb-4">Available Folders</h3>
           <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {folders.map(folder => {
                 const isSelected = selectedFinalFolderIds.includes(folder.id);
                 return (
                    <button 
                       key={folder.id} 
                       onClick={() => toggleFolderSelection(folder.id)}
                       className={`p-4 rounded-xl border-2 text-left transition-all ${isSelected ? 'border-indigo-600 bg-indigo-50 ring-2 ring-indigo-200' : 'border-gray-100 bg-white hover:border-indigo-200'}`}
                    >
                       <div className={`flex items-center justify-between mb-2 ${isSelected ? 'text-indigo-600' : 'text-gray-300'}`}>
                          <FolderIcon className="h-5 w-5" />
                          {isSelected && <CheckCircleIcon className="h-5 w-5 text-indigo-600" />}
                       </div>
                       <div className={`font-bold text-sm truncate ${isSelected ? 'text-indigo-900' : 'text-gray-600'}`}>{folder.name}</div>
                    </button>
                 )
              })}
           </div>
           {folders.length === 0 && <div className="text-gray-400 text-sm italic">No folders created yet.</div>}
        </div>

        {/* Report View */}
        {modernBillingReport ? (
           <div className="bg-white rounded-[2rem] shadow-xl border border-gray-100 overflow-hidden relative">
              {/* Toolbar */}
              <div className="p-6 border-b border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gray-50/50">
                 <div className="flex gap-4 items-end">
                    <div>
                       <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 block mb-1">Month</label>
                       <input className="bg-white border border-gray-200 rounded-lg px-3 py-1 text-sm font-bold w-32" placeholder="e.g. October" value={reportMeta.month} onChange={e => setReportMeta({...reportMeta, month: e.target.value})} />
                    </div>
                    <div>
                       <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 block mb-1">Agency</label>
                       <input className="bg-white border border-gray-200 rounded-lg px-3 py-1 text-sm font-bold w-40" placeholder="Agency Name" value={reportMeta.agency} onChange={e => setReportMeta({...reportMeta, agency: e.target.value})} />
                    </div>
                    <div>
                       <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 block mb-1">Area</label>
                       <input className="bg-white border border-gray-200 rounded-lg px-3 py-1 text-sm font-bold w-32" placeholder="Area" value={reportMeta.area} onChange={e => setReportMeta({...reportMeta, area: e.target.value})} />
                    </div>
                 </div>
                 
                 <div className="flex items-center gap-2">
                    <button onClick={() => setIsFinalBillEditing(!isFinalBillEditing)} className={`p-2 rounded-lg font-bold text-xs flex items-center gap-2 transition-all ${isFinalBillEditing ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                       <PencilSquareIcon className="h-4 w-4" /> {isFinalBillEditing ? 'Done Editing' : 'Edit Values'}
                    </button>
                    <div className="relative" ref={finalExportRef}>
                        <button onClick={() => setIsFinalExportOpen(!isFinalExportOpen)} className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-black text-xs flex items-center shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all"><ArrowDownTrayIcon className="h-4 w-4 mr-2" /> Export Report</button>
                        {isFinalExportOpen && (
                            <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-2xl border border-gray-100 py-2 z-50">
                                <button onClick={handleExportModernExcel} className="w-full px-4 py-2 text-left text-xs font-bold hover:bg-gray-50 flex items-center"><DocumentTextIcon className="h-4 w-4 mr-2 text-emerald-500"/> Excel (CSV)</button>
                                <button onClick={handleExportModernJson} className="w-full px-4 py-2 text-left text-xs font-bold hover:bg-gray-50 flex items-center"><CodeBracketIcon className="h-4 w-4 mr-2 text-indigo-500"/> JSON Data</button>
                                <button onClick={handleDownloadPDF} className="w-full px-4 py-2 text-left text-xs font-bold hover:bg-gray-50 flex items-center"><DocumentIcon className="h-4 w-4 mr-2 text-red-500"/> Download PDF</button>
                                <button onClick={handleExportModernPdf} className="w-full px-4 py-2 text-left text-xs font-bold hover:bg-gray-50 flex items-center"><ArrowUpTrayIcon className="h-4 w-4 mr-2 text-gray-500"/> Print View</button>
                            </div>
                        )}
                    </div>
                 </div>
              </div>

              {/* Modern Table */}
              <div className="overflow-x-auto">
                 <table className="w-full text-left border-collapse">
                    <thead>
                       <tr className="bg-gray-50 border-b border-gray-200 text-gray-500">
                          <th className="p-3 text-[10px] font-black uppercase tracking-widest text-center w-12">#</th>
                          <th className="p-3 text-[10px] font-black uppercase tracking-widest group/header hover:bg-gray-100 transition-colors w-32">
                              <div className="flex items-center">Date / Ref <FontSizeControls col="date" /></div>
                          </th>
                          <th className="p-3 text-[10px] font-black uppercase tracking-widest text-center group/header hover:bg-gray-100 transition-colors w-24">
                              <div className="flex items-center justify-center">Units <FontSizeControls col="units" /></div>
                          </th>
                          <th className="p-3 text-[10px] font-black uppercase tracking-widest w-40 group/header hover:bg-gray-100 transition-colors">
                              <div className="flex items-center">Weight Detail <FontSizeControls col="weight" /></div>
                          </th>
                          <th className="p-3 text-[10px] font-black uppercase tracking-widest group/header hover:bg-gray-100 transition-colors">
                              <div className="flex items-center">Calculation Logic <FontSizeControls col="amount" /></div>
                          </th>
                          <th className="p-3 text-[10px] font-black uppercase tracking-widest text-right w-24">Total</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                       {modernBillingReport.lines.map((line, idx) => {
                           const override = line.overrides || {};
                           return (
                               <tr key={line.manifest.id} className="hover:bg-indigo-50/10 transition-colors">
                                  <td className="p-3 text-center text-xs font-bold text-gray-400 border-r border-gray-50">{idx + 1}</td>
                                  <td className="p-3 border-r border-gray-50 align-top" style={{ fontSize: `${fontSizes.date}px` }}>
                                     {isFinalBillEditing ? (
                                         <div className="space-y-1">
                                             <input className="w-full bg-gray-50 border border-gray-200 rounded px-1 text-xs" value={line.manifest.manifestDate} onChange={(e) => setFinalBillOverrides({...finalBillOverrides, [line.manifest.id]: { ...override, date: e.target.value }})} />
                                             <input className="w-full bg-gray-50 border border-gray-200 rounded px-1 text-xs" value={line.manifest.manifestNo} onChange={(e) => setFinalBillOverrides({...finalBillOverrides, [line.manifest.id]: { ...override, no: e.target.value }})} />
                                         </div>
                                     ) : (
                                         <div>
                                            <div className="font-bold text-gray-900">{line.manifest.manifestDate}</div>
                                            <div className="font-medium text-gray-500">{line.manifest.manifestNo}</div>
                                         </div>
                                     )}
                                  </td>
                                  <td className="p-3 border-r border-gray-50 text-center align-top" style={{ fontSize: `${fontSizes.units}px` }}>
                                     {isFinalBillEditing ? (
                                         <div className="grid grid-cols-2 gap-1">
                                             <div className="text-[9px] text-gray-400 text-right pr-1">p</div>
                                             <input type="number" className="w-full bg-gray-50 border border-gray-200 rounded px-1 text-xs" value={line.summary.smallParcelCount} onChange={(e) => setFinalBillOverrides({...finalBillOverrides, [line.manifest.id]: { ...override, pCount: parseInt(e.target.value) || 0 }})} />
                                             <div className="text-[9px] text-gray-400 text-right pr-1">P</div>
                                             <input type="number" className="w-full bg-gray-50 border border-gray-200 rounded px-1 text-xs" value={line.summary.bigParcelCount} onChange={(e) => setFinalBillOverrides({...finalBillOverrides, [line.manifest.id]: { ...override, PCount: parseInt(e.target.value) || 0 }})} />
                                             <div className="text-[9px] text-gray-400 text-right pr-1">D</div>
                                             <input type="number" className="w-full bg-gray-50 border border-gray-200 rounded px-1 text-xs" value={line.summary.docCount} onChange={(e) => setFinalBillOverrides({...finalBillOverrides, [line.manifest.id]: { ...override, dCount: parseInt(e.target.value) || 0 }})} />
                                         </div>
                                     ) : (
                                         <div className="space-y-0.5 font-bold text-gray-600">
                                            <div title="Small Parcels"><span className="text-gray-400 text-[10px] mr-1">p:</span>{line.summary.smallParcelCount}</div>
                                            <div title="Big Parcels"><span className="text-gray-400 text-[10px] mr-1">P:</span>{line.summary.bigParcelCount}</div>
                                            <div title="Documents"><span className="text-gray-400 text-[10px] mr-1">D:</span>{line.summary.docCount}</div>
                                         </div>
                                     )}
                                  </td>
                                  <td className="p-3 border-r border-gray-50 align-top" style={{ fontSize: `${fontSizes.weight}px` }}>
                                     <div className="space-y-1">
                                        <div className="flex justify-between">
                                            <span className="text-gray-400 font-bold mr-2">p:</span>
                                            {isFinalBillEditing ? (
                                                <input type="number" className="w-16 bg-gray-50 border border-gray-200 rounded px-1 text-xs" value={line.summary.smallParcelTotalWeight} onChange={(e) => setFinalBillOverrides({...finalBillOverrides, [line.manifest.id]: { ...override, pWeight: parseFloat(e.target.value) || 0 }})} />
                                            ) : (
                                                <span className="font-bold">{line.summary.smallParcelTotalWeight} kg</span>
                                            )}
                                        </div>
                                        {line.summary.heavyWeights.length > 0 || isFinalBillEditing ? (
                                            <div className="bg-amber-50 rounded p-1.5 border border-amber-100">
                                                <div className="text-[9px] text-amber-700 font-bold mb-0.5">Heavy (P) Detail</div>
                                                {isFinalBillEditing ? (
                                                    <input 
                                                        type="text" 
                                                        className="w-full bg-white border border-amber-200 rounded px-1 text-xs" 
                                                        placeholder="e.g. 15+20+30"
                                                        value={override.PDetail !== undefined ? override.PDetail : line.summary.heavyWeights.join('+')}
                                                        onChange={(e) => setFinalBillOverrides({...finalBillOverrides, [line.manifest.id]: { ...override, PDetail: e.target.value }})}
                                                    />
                                                ) : (
                                                    <div className="text-amber-900 font-mono text-xs break-all">
                                                        {line.summary.heavyWeights.join('+')} = <strong>{line.summary.heavyTotal}kg</strong>
                                                    </div>
                                                )}
                                            </div>
                                        ) : null}
                                        <div className="text-[10px] text-gray-400 font-bold border-t border-gray-100 pt-1 mt-1">
                                            Total: {line.summary.totalWeight} kg
                                        </div>
                                     </div>
                                  </td>
                                  <td className="p-3 border-r border-gray-50 align-top" style={{ fontSize: `${fontSizes.amount}px` }}>
                                      <div className="space-y-1">
                                          {line.summary.slab1Total > 0 && (
                                              <div className="flex justify-between text-indigo-900 bg-indigo-50/50 px-1.5 py-0.5 rounded">
                                                  <span><span className="font-bold text-indigo-400 mr-1">S1:</span>{line.summary.s1w}kg * {line.manifest.config.parcelSlab1Rate}</span>
                                                  <span className="font-bold">₹{line.summary.slab1Total}</span>
                                              </div>
                                          )}
                                          {line.summary.slab2Total > 0 && (
                                              <div className="flex justify-between text-indigo-900 bg-indigo-50/50 px-1.5 py-0.5 rounded">
                                                  <span><span className="font-bold text-indigo-400 mr-1">S2:</span>{line.summary.s2w}kg * {line.manifest.config.parcelSlab2Rate}</span>
                                                  <span className="font-bold">₹{line.summary.slab2Total}</span>
                                              </div>
                                          )}
                                          {line.summary.slab3Total > 0 && (
                                              <div className="flex justify-between text-indigo-900 bg-indigo-50/50 px-1.5 py-0.5 rounded">
                                                  <span><span className="font-bold text-indigo-400 mr-1">S3:</span>{line.summary.s3w}kg * {line.manifest.config.parcelSlab3Rate}</span>
                                                  <span className="font-bold">₹{line.summary.slab3Total}</span>
                                              </div>
                                          )}
                                          {line.summary.docTotal > 0 && (
                                              <div className="flex justify-between text-emerald-900 bg-emerald-50/50 px-1.5 py-0.5 rounded">
                                                  <span><span className="font-bold text-emerald-500 mr-1">Doc:</span>{line.summary.docCount} * {line.manifest.config.documentRate}</span>
                                                  <span className="font-bold">₹{line.summary.docTotal}</span>
                                              </div>
                                          )}
                                      </div>
                                  </td>
                                  <td className="p-3 align-top text-right">
                                      <div className="text-sm font-black text-gray-900">₹{line.summary.totalAmount.toLocaleString()}</div>
                                  </td>
                               </tr>
                           )
                       })}
                    </tbody>
                    <tfoot className="bg-gray-900 text-white">
                        <tr>
                            <td colSpan={2} className="p-4 font-bold text-right uppercase tracking-widest text-xs">Grand Totals</td>
                            <td className="p-4 text-center text-xs font-bold">
                                <div className="text-indigo-300">p: {modernBillingReport.totals.p_small}</div>
                                <div className="text-indigo-300">P: {modernBillingReport.totals.P_big}</div>
                                <div className="text-emerald-300">D: {modernBillingReport.totals.d}</div>
                            </td>
                            <td className="p-4 text-xs">
                                <div className="font-bold">Total Wt: {modernBillingReport.totals.w} kg</div>
                                <div className="text-[10px] text-gray-400">p wt: {modernBillingReport.totals.sw}</div>
                                <div className="text-[10px] text-gray-400">P wt: {modernBillingReport.totals.hw}</div>
                            </td>
                            <td className="p-4 text-xs text-right text-gray-400">
                                <div>Slab 1 Sum: ₹{modernBillingReport.totals.s1}</div>
                                <div>Slab 2 Sum: ₹{modernBillingReport.totals.s2}</div>
                                <div>Slab 3 Sum: ₹{modernBillingReport.totals.s3}</div>
                                <div>Doc Sum: ₹{modernBillingReport.totals.dt}</div>
                            </td>
                            <td className="p-4 text-right text-xl font-black text-white">
                                ₹{modernBillingReport.totals.grand.toLocaleString()}
                            </td>
                        </tr>
                    </tfoot>
                 </table>
              </div>
           </div>
        ) : (
           <div className="text-center py-20 bg-gray-50 border-2 border-dashed border-gray-200 rounded-[2rem]">
              <ChartBarIcon className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-xl font-black text-gray-400">No Data Selected</h3>
              <p className="text-gray-400 mt-2">Select folders above to generate report</p>
           </div>
        )}
      </div>
    );
  };

  return (
    <div className={`min-h-screen flex flex-col font-inter transition-colors duration-300 ${themeClasses[appTheme]}`} style={{ fontSize: `${appScale}%` }}>
      <nav className="sticky top-0 z-40 px-4 md:px-8 py-3 md:py-4 flex flex-col md:flex-row justify-between items-center shadow-sm backdrop-blur-xl bg-white/90 border-b border-gray-100 transition-all no-print">
        <div className="flex w-full md:w-auto justify-between items-center mb-3 md:mb-0">
            <div className="flex items-center space-x-4 cursor-pointer group" onClick={() => { setView('dashboard'); setCurrentFolderId(null); setSelectedFinalFolderIds([]); }}>
               <div className="bg-indigo-600 p-2 md:p-2.5 rounded-xl md:rounded-2xl shadow-lg shadow-indigo-200 group-hover:scale-110 transition-transform"><CalculatorIcon className="h-6 w-6 md:h-7 md:w-7 text-white" /></div>
               <div><h1 className="text-xl md:text-2xl font-black text-indigo-950 leading-none tracking-tight">SmartBilling</h1><p className="text-[9px] md:text-[10px] text-gray-400 font-black uppercase tracking-[3px] md:tracking-[4px] mt-1 italic">{pageSubtitle}</p></div>
            </div>
        </div>
        
        <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
            {view === 'dashboard' && (
               <div className="flex items-center bg-gray-100/50 rounded-xl md:rounded-[2rem] p-1 border border-gray-200 w-full md:w-auto">
                  <button onClick={() => setDashboardTab('history')} className={`flex-1 md:flex-none px-4 md:px-6 py-2 rounded-lg md:rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest transition-all ${dashboardTab === 'history' ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-gray-100' : 'text-gray-400 hover:text-indigo-600'}`}>Explorer</button>
                  <button onClick={() => setDashboardTab('final')} className={`flex-1 md:flex-none px-4 md:px-6 py-2 rounded-lg md:rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest transition-all ${dashboardTab === 'final' ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-gray-100' : 'text-gray-400 hover:text-indigo-600'}`}>Final Bill</button>
               </div>
            )}
            
            <div className="flex items-center justify-end space-x-3 w-full md:w-auto">
              {view === 'billing' ? (
                <div className="relative" ref={exportRef}>
                  <button onClick={() => setIsExportOpen(!isExportOpen)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 md:px-6 py-2.5 rounded-xl md:rounded-[1.5rem] font-black text-xs md:text-sm flex items-center transition-all shadow-lg shadow-indigo-100 active:scale-95"><ArrowDownTrayIcon className="h-4 w-4 mr-2" />Export</button>
                  {isExportOpen && (<div className="absolute right-0 mt-2 w-52 bg-white rounded-2xl shadow-2xl border border-gray-100 py-2 z-50 animate-in fade-in slide-in-from-top-2"><button onClick={handleExportExcel} className="w-full px-5 py-3 text-left text-xs font-black text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 flex items-center transition-colors"><DocumentTextIcon className="h-4 w-4 mr-3 text-emerald-400" />Excel (CSV)</button><button onClick={handleExportJson} className="w-full px-5 py-3 text-left text-xs font-black text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 flex items-center transition-colors"><CodeBracketIcon className="h-4 w-4 mr-3 text-indigo-400" />JSON</button><button onClick={handleExportPdf} className="w-full px-5 py-3 text-left text-xs font-black text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 flex items-center transition-colors"><DocumentIcon className="h-4 w-4 mr-3 text-red-400" />PDF</button></div>)}
                </div>
              ) : (
                  <div className="flex items-center gap-2">
                      <button onClick={() => alert("Chunking feature coming soon!")} className="p-3 bg-yellow-400 hover:bg-yellow-500 text-white rounded-full shadow-lg shadow-yellow-200 transition-all hover:scale-110 active:scale-95 group relative" title="Chunking Feature">
                          <BoltIcon className="h-5 w-5 animate-pulse" />
                      </button>
                      <button onClick={() => setIsGlobalSettingsOpen(true)} className="p-3 bg-white border-2 border-gray-100 text-gray-400 hover:text-indigo-600 hover:border-indigo-100 rounded-full shadow-sm transition-all hover:rotate-90 active:scale-95" title="App Settings">
                          <Cog6ToothIcon className="h-5 w-5" />
                      </button>
                  </div>
              )}
            </div>
        </div>
      </nav>
      <main className="flex-1 flex flex-col pb-20 w-full max-w-7xl mx-auto">
         {view === 'billing' ? renderBillingEditor() : (<div className="flex-1 w-full">{dashboardTab === 'history' ? <div className="p-4 md:p-6">{renderBillingHistorySection()}</div> : renderFinalBillingSection()}</div>)}
      </main>

      {/* Global Settings Modal */}
      {isGlobalSettingsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-indigo-950/80 backdrop-blur-md p-4 animate-in fade-in duration-300 no-print">
             <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-gray-100 transform transition-all">
                <div className="px-8 py-6 bg-gradient-to-r from-slate-800 to-slate-900 flex justify-between items-center text-white">
                   <div>
                      <h2 className="text-xl font-black tracking-tight">App Settings</h2>
                      <p className="text-slate-400 text-xs font-medium uppercase tracking-widest mt-1">Preferences & Defaults</p>
                   </div>
                   <button onClick={() => setIsGlobalSettingsOpen(false)} className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-all text-white"><XMarkIcon className="h-5 w-5" /></button>
                </div>
                
                <div className="p-8 space-y-8 bg-slate-50 max-h-[70vh] overflow-y-auto">
                   
                   {/* Appearance Section */}
                   <div className="space-y-4">
                      <div className="flex items-center gap-2 text-slate-900 border-b border-slate-200 pb-2">
                         <SparklesIcon className="h-5 w-5 text-indigo-500" />
                         <span className="font-black text-sm uppercase tracking-wider">Appearance</span>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-3">
                          <button onClick={() => setAppTheme('light')} className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${appTheme === 'light' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 bg-white text-gray-400 hover:border-indigo-200'}`}>
                              <SunIcon className="h-6 w-6" />
                              <span className="text-[10px] font-bold uppercase">Light</span>
                          </button>
                          <button onClick={() => setAppTheme('dark')} className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${appTheme === 'dark' ? 'border-indigo-500 bg-slate-800 text-white' : 'border-gray-200 bg-white text-gray-400 hover:border-indigo-200'}`}>
                              <MoonIcon className="h-6 w-6" />
                              <span className="text-[10px] font-bold uppercase">Dark</span>
                          </button>
                          <button onClick={() => setAppTheme('reading')} className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${appTheme === 'reading' ? 'border-amber-500 bg-amber-50 text-amber-800' : 'border-gray-200 bg-white text-gray-400 hover:border-indigo-200'}`}>
                              <BookOpenIcon className="h-6 w-6" />
                              <span className="text-[10px] font-bold uppercase">Reading</span>
                          </button>
                      </div>

                      <div>
                          <div className="flex justify-between items-center mb-2">
                              <span className="text-xs font-bold text-gray-500 uppercase">Text Size</span>
                              <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded">{appScale}%</span>
                          </div>
                          <input type="range" min="75" max="125" step="5" value={appScale} onChange={(e) => setAppScale(parseInt(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                          <div className="flex justify-between text-[10px] text-gray-400 font-bold mt-1"><span>A-</span><span>A+</span></div>
                      </div>
                   </div>

                   {/* Pricing Engine Section (Reused Logic) */}
                   <div className="space-y-4">
                      <div className="flex items-center gap-2 text-slate-900 border-b border-slate-200 pb-2">
                         <ScaleIcon className="h-5 w-5 text-emerald-500" />
                         <span className="font-black text-sm uppercase tracking-wider">Default Slab Rates</span>
                      </div>
                      <p className="text-[10px] text-gray-400 font-medium">These rates will apply to all new imports automatically.</p>
                      
                      <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm space-y-4">
                         <div className="grid grid-cols-2 gap-4">
                            <div className="col-span-2">
                               <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Slab 1 (0-10kg)</label>
                               <div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₹</span><input type="number" className="w-full pl-8 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500/20 outline-none" value={globalConfig.parcelSlab1Rate} onChange={(e) => setGlobalConfig({ ...globalConfig, parcelSlab1Rate: parseFloat(e.target.value) || 0 })} /></div>
                            </div>
                            <div>
                               <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Slab 2 (10-100kg)</label>
                               <div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₹</span><input type="number" className="w-full pl-8 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500/20 outline-none" value={globalConfig.parcelSlab2Rate} onChange={(e) => setGlobalConfig({ ...globalConfig, parcelSlab2Rate: parseFloat(e.target.value) || 0 })} /></div>
                            </div>
                            <div>
                               <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Slab 3 (&gt;100kg)</label>
                               <div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₹</span><input type="number" className="w-full pl-8 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500/20 outline-none" value={globalConfig.parcelSlab3Rate} onChange={(e) => setGlobalConfig({ ...globalConfig, parcelSlab3Rate: parseFloat(e.target.value) || 0 })} /></div>
                            </div>
                            <div className="col-span-2 pt-2 border-t border-gray-100 mt-2">
                               <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Document Flat Rate</label>
                               <div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₹</span><input type="number" className="w-full pl-8 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl font-bold text-gray-900 focus:ring-2 focus:ring-emerald-500/20 outline-none" value={globalConfig.documentRate} onChange={(e) => setGlobalConfig({ ...globalConfig, documentRate: parseFloat(e.target.value) || 0 })} /></div>
                            </div>
                         </div>
                      </div>
                   </div>
                   
                   <button onClick={() => { saveGlobalSettings(globalConfig, appTheme, appScale); setIsGlobalSettingsOpen(false); }} className="w-full py-4 bg-slate-900 text-white font-black rounded-xl hover:bg-black transition-all shadow-xl active:scale-95 flex items-center justify-center gap-2">
                      <CheckCircleIcon className="h-5 w-5 text-emerald-400" />
                      Save Preferences
                   </button>
                </div>
             </div>
          </div>
      )}

      {/* Folder Export Modal */}
      {isFolderExportOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-indigo-950/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
             <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-gray-100 transform transition-all">
                <div className="px-8 py-6 bg-gradient-to-r from-blue-600 to-indigo-600 flex justify-between items-center text-white">
                   <div>
                      <h2 className="text-xl font-black tracking-tight">Export Folder</h2>
                      <p className="text-indigo-100 text-xs font-medium uppercase tracking-widest mt-1">Create Backup Package (ZIP)</p>
                   </div>
                   <button onClick={() => setIsFolderExportOpen(false)} className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-all text-white"><XMarkIcon className="h-5 w-5" /></button>
                </div>
                
                <div className="p-8 space-y-6 bg-slate-50 max-h-[70vh] overflow-y-auto">
                   <p className="text-sm text-gray-500 font-medium">Select a folder to export all its manifests as a single ZIP file.</p>
                   
                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {folders.map(folder => {
                          const count = history.filter(h => h.folderId === folder.id).length;
                          return (
                              <button 
                                  key={folder.id} 
                                  onClick={() => exportFolderToZip(folder.id)}
                                  className="group flex flex-col p-4 bg-white border border-gray-200 rounded-2xl hover:border-indigo-500 hover:shadow-lg transition-all text-left"
                              >
                                  <div className="flex items-center justify-between mb-2">
                                      <FolderIcon className="h-6 w-6 text-indigo-300 group-hover:text-indigo-600" />
                                      <span className="text-[10px] font-black bg-gray-100 text-gray-500 px-2 py-1 rounded-full">{count} Items</span>
                                  </div>
                                  <span className="font-bold text-gray-900 group-hover:text-indigo-900 truncate w-full">{folder.name}</span>
                              </button>
                          )
                      })}
                   </div>
                   {folders.length === 0 && <div className="text-center py-8 text-gray-400 font-bold text-sm">No folders available to export.</div>}
                </div>
             </div>
          </div>
      )}

      {/* Bulk Import Modal */}
      {isBulkImportOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-indigo-950/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
             <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden border border-gray-100 transform transition-all flex flex-col max-h-[90vh]">
                <div className="px-8 py-6 bg-gradient-to-r from-emerald-600 to-teal-600 flex justify-between items-center text-white flex-shrink-0">
                   <div>
                      <h2 className="text-xl font-black tracking-tight">Bulk Import</h2>
                      <p className="text-emerald-100 text-xs font-medium uppercase tracking-widest mt-1">Multiple Files & Folders</p>
                   </div>
                   <button onClick={() => {setIsBulkImportOpen(false); setBulkImportResults([]);}} className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-all text-white"><XMarkIcon className="h-5 w-5" /></button>
                </div>
                
                <div className="flex border-b border-gray-100 bg-gray-50/50 flex-shrink-0">
                    <button onClick={() => setBulkImportTab('zip')} className={`flex-1 py-4 text-sm font-black uppercase tracking-wider transition-all ${bulkImportTab === 'zip' ? 'text-emerald-600 border-b-2 border-emerald-600 bg-emerald-50/30' : 'text-gray-400 hover:text-gray-600'}`}>
                        Folder Import (ZIP)
                    </button>
                    <button onClick={() => setBulkImportTab('multi')} className={`flex-1 py-4 text-sm font-black uppercase tracking-wider transition-all ${bulkImportTab === 'multi' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/30' : 'text-gray-400 hover:text-gray-600'}`}>
                        Import Multiple (JSON)
                    </button>
                </div>

                <div className="p-8 overflow-y-auto flex-1 bg-white">
                    {bulkImportTab === 'zip' ? (
                        <div className="space-y-6">
                            <div className="border-2 border-dashed border-emerald-100 rounded-2xl p-10 text-center hover:bg-emerald-50/20 transition-all relative group">
                                <input type="file" accept=".zip" onChange={(e) => e.target.files?.[0] && handleZipImportRefactored(e.target.files[0])} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                                <div className="bg-emerald-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                                    <ArchiveBoxIcon className="h-8 w-8 text-emerald-600" />
                                </div>
                                <h3 className="text-lg font-black text-gray-900 mb-1">Upload ZIP Archive</h3>
                                <p className="text-xs text-gray-400 font-medium">Restores an entire folder with original metadata</p>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Target Folder</label>
                                <select 
                                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-indigo-500/20 mb-3"
                                    value={bulkImportFolderId}
                                    onChange={(e) => setBulkImportFolderId(e.target.value)}
                                >
                                    <option value="new">+ Create New Folder</option>
                                    {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                                </select>
                                {bulkImportFolderId === 'new' && (
                                    <input 
                                        type="text" 
                                        placeholder="Enter Folder Name..." 
                                        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold text-gray-900 outline-none focus:ring-2 focus:ring-indigo-500/20"
                                        value={bulkImportNewFolderName}
                                        onChange={(e) => setBulkImportNewFolderName(e.target.value)}
                                    />
                                )}
                            </div>

                            <div className="border-2 border-dashed border-indigo-100 rounded-2xl p-8 text-center hover:bg-indigo-50/20 transition-all relative group">
                                <input type="file" accept=".json" multiple onChange={(e) => e.target.files && handleBulkJsonImport(e.target.files)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                                <div className="bg-indigo-100 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                                    <DocumentDuplicateIcon className="h-6 w-6 text-indigo-600" />
                                </div>
                                <h3 className="text-base font-black text-gray-900">Select JSON Files</h3>
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Max 30 Files</p>
                            </div>
                        </div>
                    )}

                    {/* Import Results List */}
                    {bulkImportResults.length > 0 && (
                        <div className="mt-8">
                            <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3 border-b border-gray-100 pb-2">Import Results ({bulkImportResults.length})</h4>
                            <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
                                {bulkImportResults.map((res, idx) => (
                                    <div key={idx} className={`flex items-center justify-between p-2 rounded-lg text-xs font-medium border ${res.status === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-100' : res.status === 'warning' ? 'bg-amber-50 text-amber-800 border-amber-100' : 'bg-red-50 text-red-800 border-red-100'}`}>
                                        <div className="truncate flex-1 mr-2">{res.fileName}</div>
                                        <div className="font-bold uppercase tracking-wider text-[10px]">{res.message}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
             </div>
          </div>
      )}

      {/* Local Config Modal (For Active Manifest) - Existing */}
      {isConfigOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-indigo-950/80 backdrop-blur-md p-4 animate-in fade-in duration-300 no-print">
             <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-gray-100 transform transition-all">
                {/* Header */}
                <div className="px-8 py-6 bg-gradient-to-r from-indigo-600 to-indigo-700 flex justify-between items-center text-white">
                   <div>
                      <h2 className="text-xl font-black tracking-tight">Active Rates</h2>
                      <p className="text-indigo-200 text-xs font-medium uppercase tracking-widest mt-1">For this manifest only</p>
                   </div>
                   <button onClick={() => setIsConfigOpen(false)} className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-all text-white"><XMarkIcon className="h-5 w-5" /></button>
                </div>
                
                <div className="p-8 space-y-6 bg-slate-50">
                   {/* Parcel Section */}
                   <div className="space-y-4">
                      <div className="flex items-center gap-2 text-indigo-900 mb-2">
                         <ScaleIcon className="h-5 w-5 text-indigo-500" />
                         <span className="font-black text-sm uppercase tracking-wider">Parcel Slabs</span>
                      </div>
                      
                      <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm space-y-4">
                         <div className="grid grid-cols-2 gap-4">
                            <div className="col-span-2">
                               <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Slab 1 (0-10kg)</label>
                               <div className="relative">
                                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₹</span>
                                  <input type="number" className="w-full pl-8 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl font-black text-gray-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none" value={config.parcelSlab1Rate} onChange={(e) => setConfig({ ...config, parcelSlab1Rate: parseFloat(e.target.value) || 0 })} />
                               </div>
                            </div>
                            <div>
                               <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Slab 2 (10-100kg)</label>
                               <div className="relative">
                                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₹</span>
                                  <input type="number" className="w-full pl-8 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl font-black text-gray-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none" value={config.parcelSlab2Rate} onChange={(e) => setConfig({ ...config, parcelSlab2Rate: parseFloat(e.target.value) || 0 })} />
                               </div>
                            </div>
                            <div>
                               <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Slab 3 (&gt;100kg)</label>
                               <div className="relative">
                                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₹</span>
                                  <input type="number" className="w-full pl-8 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl font-black text-gray-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none" value={config.parcelSlab3Rate} onChange={(e) => setConfig({ ...config, parcelSlab3Rate: parseFloat(e.target.value) || 0 })} />
                               </div>
                            </div>
                         </div>
                      </div>
                   </div>

                   {/* Document Section */}
                   <div className="space-y-4">
                      <div className="flex items-center gap-2 text-indigo-900 mb-2">
                         <DocumentTextIcon className="h-5 w-5 text-emerald-500" />
                         <span className="font-black text-sm uppercase tracking-wider">Documents</span>
                      </div>
                      <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
                          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Flat Rate</label>
                           <div className="relative">
                              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₹</span>
                              <input type="number" className="w-full pl-8 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl font-black text-gray-900 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none" value={config.documentRate} onChange={(e) => setConfig({ ...config, documentRate: parseFloat(e.target.value) || 0 })} />
                           </div>
                      </div>
                   </div>
                   
                   <button onClick={() => setIsConfigOpen(false)} className="w-full py-4 bg-indigo-900 text-white font-black rounded-xl hover:bg-black transition-all shadow-xl shadow-indigo-200 active:scale-95 flex items-center justify-center gap-2">
                      <CheckCircleIcon className="h-5 w-5 text-indigo-400" />
                      Save Configuration
                   </button>
                </div>
             </div>
          </div>
      )}
      
      {/* Import Conflict Modal */}
      {importConflict && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-indigo-950/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-2xl md:rounded-[2.5rem] shadow-2xl max-w-3xl w-full overflow-hidden border border-gray-100 flex flex-col max-h-[85vh] overflow-y-auto">
             <div className="px-6 md:px-8 py-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 sticky top-0 z-10 backdrop-blur-md">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-100 text-amber-600 rounded-xl"><ExclamationTriangleIcon className="h-6 w-6"/></div>
                  <div><h2 className="text-lg md:text-xl font-black text-gray-900">Duplicate Manifest Found</h2><p className="text-[10px] md:text-xs text-gray-400 font-bold uppercase tracking-widest">Manifest <span className="text-indigo-600">{importConflict.newCandidate.manifestNo}</span> exists.</p></div>
                </div>
                <button onClick={() => resolveConflict('discard')} className="p-2 bg-white rounded-xl shadow-sm text-gray-400 hover:text-gray-900 transition-all"><XMarkIcon className="h-5 w-5" /></button>
             </div>
             
             <div className="p-6 md:p-8 grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                {/* Existing Record */}
                <div className="bg-gray-50 p-6 rounded-2xl md:rounded-3xl border border-gray-200">
                   <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Existing Record</div>
                   <div className="space-y-4">
                      <div><div className="text-xs text-gray-500 font-medium">Manifest Date</div><div className="text-lg font-black text-gray-900">{importConflict.existing.manifestDate}</div></div>
                      <div className="flex justify-between">
                         <div><div className="text-xs text-gray-500 font-medium">Total Items</div><div className="text-lg font-black text-gray-900">{importConflict.existing.itemCount}</div></div>
                         <div className="text-right">
                            <div className="text-xs text-gray-500 font-medium">Total Amount</div>
                            <div className="text-xl font-black text-indigo-600">₹{importConflict.existing.totalAmount.toLocaleString()}</div>
                         </div>
                      </div>
                      <div className="text-xs text-gray-400 font-medium pt-2 border-t border-gray-200">Created: {new Date(importConflict.existing.createdAt).toLocaleString()}</div>
                   </div>
                </div>

                {/* New Import */}
                <div className="bg-indigo-50 p-6 rounded-2xl md:rounded-3xl border border-indigo-200 relative overflow-hidden">
                   <div className="absolute top-0 right-0 p-4 opacity-10"><BoltIcon className="h-24 w-24 text-indigo-600"/></div>
                   <div className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-4 relative z-10">New Import</div>
                   <div className="space-y-4 relative z-10">
                      <div><div className="text-xs text-indigo-400 font-medium">Manifest Date</div><div className="text-lg font-black text-indigo-900">{importConflict.newCandidate.manifestDate}</div></div>
                      <div className="flex justify-between">
                         <div><div className="text-xs text-indigo-400 font-medium">Total Items</div><div className="text-lg font-black text-indigo-900">{importConflict.newCandidate.itemCount}</div></div>
                         <div className="text-right">
                            <div className="text-xs text-indigo-400 font-medium">Total Amount</div>
                            <div className="text-xl font-black text-indigo-700">₹{importConflict.newCandidate.totalAmount.toLocaleString()}</div>
                         </div>
                      </div>
                      <div className="text-xs text-indigo-400/60 font-medium pt-2 border-t border-indigo-200">Source: File Import</div>
                   </div>
                </div>
             </div>

             <div className="bg-gray-50 px-6 md:px-8 py-6 flex flex-col md:flex-row gap-4 sticky bottom-0 z-10 border-t border-gray-100">
                <button onClick={() => resolveConflict('keep_both')} className="flex-1 py-3 md:py-4 bg-white border-2 border-indigo-100 text-indigo-600 rounded-xl md:rounded-2xl font-black text-sm hover:bg-indigo-50 hover:border-indigo-200 transition-all flex items-center justify-center gap-2 shadow-sm"><DocumentDuplicateIcon className="h-5 w-5"/> Keep Both</button>
                <button onClick={() => resolveConflict('override')} className="flex-1 py-3 md:py-4 bg-indigo-600 text-white rounded-xl md:rounded-2xl font-black text-sm hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 flex items-center justify-center gap-2"><ScaleIcon className="h-5 w-5"/> Override</button>
                <button onClick={() => resolveConflict('discard')} className="px-6 py-4 text-gray-400 font-black text-sm hover:text-red-500 transition-colors">Discard</button>
             </div>
          </div>
        </div>
      )}

      {isUploading && (
          <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-indigo-950/90 backdrop-blur-2xl animate-in fade-in duration-500 no-print">
            <div className="relative text-center p-4">
                <div className="mx-auto h-24 w-24 md:h-32 md:w-32 bg-indigo-600 rounded-[3rem] md:rounded-[3.5rem] animate-bounce shadow-[0_0_80px_rgba(79,70,229,0.5)] flex items-center justify-center mb-8 md:mb-12">
                   <CalculatorIcon className="h-12 w-12 md:h-16 md:w-16 text-white" />
                </div>
                <h2 className="text-2xl md:text-4xl font-black text-white tracking-tight mb-4">Neural Data Extraction</h2>
                <div className="flex flex-col items-center space-y-2">
                   <p className="text-indigo-300 font-bold uppercase tracking-widest text-xs animate-pulse text-center">{loadingMessage}</p>
                   {processingMode === 'hybrid' && (
                       <div className="flex items-center gap-2 mt-2 px-4 py-1 bg-white/10 rounded-full">
                           <BoltIcon className="h-3 w-3 text-yellow-400" />
                           <span className="text-[10px] text-white font-black uppercase">Hybrid Mode Active</span>
                       </div>
                   )}
                </div>
            </div>
          </div>
      )}
      {(isCreateFolderOpen || editingFolderId) && (<div className="fixed inset-0 z-50 flex items-center justify-center bg-indigo-950/80 backdrop-blur-md p-4 animate-in fade-in duration-300"><div className="bg-white rounded-2xl md:rounded-[3rem] shadow-2xl max-w-lg w-full overflow-hidden border border-gray-100 p-8 md:p-12"><h2 className="text-2xl md:text-3xl font-black text-gray-900 mb-2">{editingFolderId ? 'Rename Folder' : 'New Folder'}</h2><p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-8">Organize your billing history</p><input autoFocus className="w-full px-6 py-4 md:px-8 md:py-5 bg-gray-50 border border-gray-200 rounded-xl md:rounded-[2rem] font-black text-lg md:text-xl mb-8 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none" placeholder="Folder Name..." value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (editingFolderId ? handleRenameFolder(editingFolderId, newFolderName) : handleCreateFolder())} /><div className="flex gap-4"><button onClick={() => { setIsCreateFolderOpen(false); setEditingFolderId(null); setNewFolderName(''); }} className="flex-1 py-3 md:py-4 font-black text-gray-400 bg-gray-50 rounded-xl md:rounded-[2rem] hover:bg-gray-100 transition-all">Cancel</button><button onClick={() => editingFolderId ? handleRenameFolder(editingFolderId, newFolderName) : handleCreateFolder()} className="flex-1 py-3 md:py-4 font-black text-white bg-indigo-600 rounded-xl md:rounded-[2rem] hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-200">{editingFolderId ? 'Update' : 'Create'}</button></div></div></div>)}
      {/* Upload Modal */}
      {isUploadModalOpen && !importConflict && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-indigo-950/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-2xl md:rounded-[2.5rem] shadow-2xl max-w-2xl w-full overflow-hidden border border-gray-100 flex flex-col max-h-[90vh]">
             <div className="px-6 md:px-8 py-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <div><h2 className="text-xl md:text-2xl font-black text-gray-900">Import Data</h2><p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Select import method</p></div>
                <button onClick={() => setIsUploadModalOpen(false)} className="p-2 bg-white rounded-xl shadow-sm text-gray-400 hover:text-gray-900 transition-all"><XMarkIcon className="h-5 w-5" /></button>
             </div>
             
             {/* AI Mode Selector */}
             {(uploadTab === 'doc' || uploadTab === 'img') && (
                <div className="px-6 md:px-8 pt-6">
                    <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-3 block ml-1">AI Processing Model</span>
                    <div className="flex flex-col sm:flex-row gap-3 bg-gray-50 p-1 rounded-2xl">
                        <button 
                            onClick={() => setProcessingMode('default')}
                            className={`flex-1 flex items-center justify-center gap-3 py-3 rounded-xl transition-all ${processingMode === 'default' ? 'bg-white shadow-md text-indigo-600 ring-1 ring-gray-200' : 'text-gray-400 hover:text-gray-600'}`}
                        >
                            <CpuChipIcon className="h-5 w-5" />
                            <div className="text-left">
                                <div className="text-xs font-black uppercase">Default AI</div>
                                <div className="text-[9px] font-bold opacity-60">Fast • Balanced</div>
                            </div>
                        </button>
                        <button 
                             onClick={() => setProcessingMode('hybrid')}
                             className={`flex-1 flex items-center justify-center gap-3 py-3 rounded-xl transition-all ${processingMode === 'hybrid' ? 'bg-indigo-600 shadow-md text-white' : 'text-gray-400 hover:text-gray-600'}`}
                        >
                            <BoltIcon className="h-5 w-5" />
                            <div className="text-left">
                                <div className="text-xs font-black uppercase">Hybrid AI</div>
                                <div className="text-[9px] font-bold opacity-80">High Accuracy • Fallback</div>
                            </div>
                        </button>
                    </div>
                    {processingMode === 'hybrid' && <p className="text-[10px] text-gray-400 font-medium mt-3 px-2">Hybrid mode prioritizes column accuracy (Sl No, AWB, Weight) using advanced models and automatically falls back to standard models if limits are reached.</p>}
                </div>
             )}

             <div className="flex flex-col sm:flex-row p-2 bg-gray-50/50 gap-2 px-6 md:px-8 mt-6">
                <button onClick={() => setUploadTab('doc')} className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${uploadTab === 'doc' ? 'bg-white text-indigo-600 shadow-md ring-1 ring-gray-100' : 'text-gray-400 hover:bg-gray-100'}`}>Document (PDF)</button>
                <button onClick={() => setUploadTab('img')} className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${uploadTab === 'img' ? 'bg-white text-indigo-600 shadow-md ring-1 ring-gray-100' : 'text-gray-400 hover:bg-gray-100'}`}>Images</button>
                <button onClick={() => setUploadTab('json')} className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${uploadTab === 'json' ? 'bg-white text-emerald-600 shadow-md ring-1 ring-gray-100' : 'text-gray-400 hover:bg-gray-100'}`}>JSON Backup</button>
             </div>

             <div className="p-6 md:p-8 overflow-y-auto">
                {uploadTab === 'doc' && (
                   <div className="space-y-6">
                      <div className="border-2 border-dashed border-gray-200 rounded-3xl p-8 text-center hover:bg-indigo-50/30 transition-colors relative">
                         <input type="file" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" accept=".pdf,.xlsx,.xls,.doc,.docx" onChange={(e) => handleDocUpload(e)} />
                         <DocumentTextIcon className="h-12 w-12 text-indigo-200 mx-auto mb-4" />
                         <p className="text-indigo-900 font-bold">Click to select PDF, Excel, or Word</p>
                         <p className="text-xs text-indigo-400 mt-2">Max 5 Pages / 5MB</p>
                      </div>
                   </div>
                )}

                {uploadTab === 'img' && (
                   <div className="space-y-6">
                       <div className="border-2 border-dashed border-gray-200 rounded-3xl p-8 text-center hover:bg-indigo-50/30 transition-colors relative">
                         <input type="file" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" accept="image/*" multiple onChange={(e) => handleImageUpload(e)} />
                         <div className="flex justify-center -space-x-4 mb-4">
                            {[1,2,3].map(i => <div key={i} className="h-10 w-10 md:h-12 md:w-12 rounded-full bg-indigo-100 border-2 border-white flex items-center justify-center"><PhotoIcon className="h-5 w-5 md:h-6 md:w-6 text-indigo-300" /></div>)}
                         </div>
                         <p className="text-indigo-900 font-bold">Select Images (Max 5)</p>
                         <p className="text-xs text-indigo-400 mt-2">JPG, PNG, WebP supported</p>
                      </div>
                   </div>
                )}

                {uploadTab === 'json' && (
                    <div className="space-y-6">
                       <div className="border-2 border-dashed border-emerald-100 rounded-3xl p-8 text-center hover:bg-emerald-50/30 transition-colors relative">
                         <input type="file" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" accept=".json" onChange={(e) => handleJsonUpload(e)} />
                         <CodeBracketIcon className="h-12 w-12 text-emerald-200 mx-auto mb-4" />
                         <p className="text-emerald-900 font-bold">Select JSON Backup File</p>
                         <p className="text-xs text-emerald-400 mt-2">Direct restore, no AI processing</p>
                      </div>
                    </div>
                )}
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;