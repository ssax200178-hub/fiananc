import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { confirmDialog } from '../utils/confirm';
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

import { useAppContext } from '../AppContext';

/* ──────────────────────────── Error Boundary ──────────────────────────── */
class GridErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
    constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
    componentDidCatch(error: Error, info: React.ErrorInfo) { console.error("Grid Error:", error, info); }
    render() {
        if (this.state.hasError) {
            return (
                <div className="flex-1 flex flex-col items-center justify-center bg-white dark:bg-[#1e1e1e] text-center p-8">
                    <span className="material-symbols-outlined text-5xl text-red-500 mb-4">error</span>
                    <h3 className="text-lg font-bold text-red-600 mb-2">خطأ في عرض الجدول</h3>
                    <p className="text-sm text-gray-500 mb-4">{this.state.error?.message}</p>
                    <button onClick={() => this.setState({ hasError: false, error: null })} className="px-4 py-2 bg-[#217346] text-white rounded text-sm font-bold hover:bg-[#185c37] transition">إعادة المحاولة</button>
                </div>
            );
        }
        return this.props.children;
    }
}

/* ──────────────────────────── Main Component ──────────────────────────── */
const OperationsGridPage: React.FC = () => {
    const {
        restaurants,
        operationalSheets,
        createOperationalSheet,
        updateSheetRow,
        deleteOperationalSheet,
        currentUser,
        isLoading,
        theme
    } = useAppContext();

    const gridRef = useRef<AgGridReact>(null);
    const [selectedSheetId, setSelectedSheetId] = useState<string | 'restaurants'>('restaurants');
    const [isCreating, setIsCreating] = useState(false);
    const [newSheetName, setNewSheetName] = useState('');
    const [newSheetColumns, setNewSheetColumns] = useState('المبيعات, المصاريف, الصافي');
    const [isSaving, setIsSaving] = useState(false);
    const [selectedCell, setSelectedCell] = useState('A1');
    const [formulaBarValue, setFormulaBarValue] = useState('');

    const isDark = theme === 'dark';

    const activeSheet = useMemo(() =>
        operationalSheets.find(s => s.id === selectedSheetId),
        [operationalSheets, selectedSheetId]);

    const rowData = useMemo(() => {
        if (selectedSheetId === 'restaurants') return restaurants;
        return activeSheet?.rows || [];
    }, [selectedSheetId, restaurants, activeSheet]);

    const columnDefs = useMemo(() => {
        if (selectedSheetId === 'restaurants') {
            return [
                { field: 'name', headerName: 'المطعم', pinned: 'right' as const, editable: true, flex: 2, minWidth: 180 },
                { field: 'branch', headerName: 'الفرع', pinned: 'right' as const, editable: true, flex: 1.2, minWidth: 120 },
                { field: 'balance', headerName: 'الرصيد الحسابي', editable: true, type: 'numericColumn' as const, valueParser: (p: any) => Number(p.newValue), flex: 1, minWidth: 130 },
                { field: 'phone', headerName: 'الهاتف', editable: true, flex: 1, minWidth: 130 },
                { field: 'isActive', headerName: 'الحالة', editable: true, cellRenderer: (p: any) => p.value ? '✅ نشط' : '❌ غير نشط', flex: 0.8, minWidth: 100 },
                { field: 'notes', headerName: 'ملاحظات', editable: true, flex: 2, minWidth: 200 },
            ];
        }

        const baseCols = [
            { field: 'restaurantName', headerName: 'المطعم', pinned: 'right' as const, flex: 1.5, minWidth: 150, valueGetter: (p: any) => p.data.restaurantName || p.data.name },
            { field: 'branch', headerName: 'الفرع', pinned: 'right' as const, flex: 1, minWidth: 100 },
        ];

        const dynamicCols = (activeSheet?.columns || []).map(col => ({
            headerName: col,
            field: `data.${col}`,
            editable: true,
            flex: 1,
            minWidth: 120,
            valueGetter: (p: any) => p.data.data?.[col] || '',
            valueSetter: (p: any) => {
                p.data.data = { ...p.data.data, [col]: p.newValue };
                return true;
            }
        }));

        return [...baseCols, ...dynamicCols];
    }, [selectedSheetId, activeSheet]);

    const onCellValueChanged = useCallback(async (event: any) => {
        if (selectedSheetId === 'restaurants') return;
        if (activeSheet) {
            setIsSaving(true);
            try {
                await updateSheetRow(activeSheet.id, event.data.restaurantId, event.colDef.headerName, event.newValue);
            } catch (error) {
                console.error("Failed to update cell:", error);
                event.api.refreshCells({ rowNodes: [event.node], force: true });
            } finally {
                setIsSaving(false);
            }
        }
    }, [selectedSheetId, activeSheet, updateSheetRow]);

    const onCellClicked = useCallback((event: any) => {
        const colIndex = event.columnApi?.getAllDisplayedColumns?.()?.indexOf?.(event.column) ?? 0;
        const letter = String.fromCharCode(65 + Math.max(0, colIndex));
        const row = (event.rowIndex ?? 0) + 1;
        setSelectedCell(`${letter}${row}`);
        setFormulaBarValue(String(event.value ?? ''));
    }, []);

    const handleCreateSheet = async () => {
        if (!newSheetName.trim()) return;
        const cols = newSheetColumns.split(',').map(c => c.trim()).filter(c => c);
        const id = await createOperationalSheet(newSheetName, cols);
        setSelectedSheetId(id);
        setIsCreating(false);
        setNewSheetName('');
    };

    if (isLoading) {
        return (
            <div className="h-screen flex flex-col items-center justify-center" style={{ background: isDark ? '#1e1e1e' : '#fff' }}>
                <span className="material-symbols-outlined animate-spin text-4xl" style={{ color: '#217346' }}>sync</span>
                <p className="mt-4 font-bold" style={{ color: isDark ? '#d4d4d4' : '#333' }}>جاري تحميل البيانات...</p>
            </div>
        );
    }

    if (!restaurants || restaurants.length === 0) {
        return (
            <div className="h-screen flex flex-col items-center justify-center" style={{ background: isDark ? '#1e1e1e' : '#fff' }}>
                <span className="material-symbols-outlined text-6xl text-gray-300 mb-4">table_chart</span>
                <h2 className="text-xl font-bold" style={{ color: isDark ? '#d4d4d4' : '#333' }}>لا توجد بيانات مطاعم</h2>
                <p className="text-gray-500 mt-2">يرجى إضافة مطاعم إلى النظام أولاً.</p>
            </div>
        );
    }

    const excelGreen = '#217346';
    const ribbonBg = isDark ? '#2d2d2d' : '#217346';
    const toolbarBg = isDark ? '#3c3c3c' : '#f3f3f3';
    const formulaBg = isDark ? '#1e1e1e' : '#ffffff';
    const borderColor = isDark ? '#404040' : '#d1d5db';
    const textColor = isDark ? '#d4d4d4' : '#333333';
    const sheetTabBg = isDark ? '#2d2d2d' : '#e8e8e8';
    const sheetTabActive = isDark ? '#1e1e1e' : '#ffffff';
    const statusBarBg = isDark ? '#007a33' : '#217346';

    return (
        <div className="h-[calc(100vh-64px)] flex flex-col overflow-hidden" dir="rtl" style={{ background: isDark ? '#1e1e1e' : '#fff' }}>

            {/* ═══════════════ TITLE BAR (Excel-style) ═══════════════ */}
            <div className="flex items-center justify-between px-3 py-1" style={{ background: ribbonBg }}>
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.15)' }}>
                        <span className="material-symbols-outlined text-white text-lg">table_chart</span>
                    </div>
                    <span className="text-white text-xs font-bold opacity-90">
                        {selectedSheetId === 'restaurants' ? 'سجل المطاعم الأساسي' : activeSheet?.name || 'ملف جديد'}
                        {' - '}جدول العمليات
                    </span>
                </div>
                {isSaving && (
                    <div className="flex items-center gap-1.5 text-white/80 text-xs">
                        <span className="material-symbols-outlined text-sm animate-spin">sync</span>
                        <span>جاري الحفظ...</span>
                    </div>
                )}
            </div>

            {/* ═══════════════ TOOLBAR RIBBON ═══════════════ */}
            <div className="flex items-center gap-1 px-2 py-1.5 border-b" style={{ background: toolbarBg, borderColor }}>
                {/* File Actions Group */}
                <div className="flex items-center gap-0.5">
                    <ToolbarButton icon="note_add" label="جديد" onClick={() => setIsCreating(true)} isDark={isDark} />
                    <ToolbarButton icon="download" label="تصدير" onClick={() => gridRef.current?.api?.exportDataAsCsv()} isDark={isDark} />
                    <ToolbarButton icon="refresh" label="تحديث" onClick={async () => {
                        setIsSaving(true);
                        await new Promise(r => setTimeout(r, 400));
                        gridRef.current?.api?.refreshCells({ force: true });
                        setIsSaving(false);
                    }} isDark={isDark} />
                </div>

                <div className="w-px h-6 mx-1" style={{ background: borderColor }} />

                {/* Edit Actions */}
                <div className="flex items-center gap-0.5">
                    <ToolbarButton icon="select_all" label="تحديد الكل" onClick={() => gridRef.current?.api?.selectAll()} isDark={isDark} />
                    <ToolbarButton icon="deselect" label="إلغاء" onClick={() => gridRef.current?.api?.deselectAll()} isDark={isDark} />
                </div>

                <div className="w-px h-6 mx-1" style={{ background: borderColor }} />

                {/* View Actions */}
                <div className="flex items-center gap-0.5">
                    <ToolbarButton icon="zoom_in" label="تكبير" onClick={() => gridRef.current?.api?.sizeColumnsToFit()} isDark={isDark} />
                    <ToolbarButton icon="filter_list" label="فلتر" onClick={() => { }} isDark={isDark} />
                </div>

                {selectedSheetId !== 'restaurants' && (
                    <>
                        <div className="w-px h-6 mx-1" style={{ background: borderColor }} />
                        <ToolbarButton icon="delete" label="حذف الملف" onClick={async () => {
                            const confirmed = await confirmDialog('هل أنت متأكد من حذف هذا الكشف؟', { type: 'danger', confirmText: 'حذف', cancelText: 'إلغاء' });
                            if (confirmed) {
                                deleteOperationalSheet(selectedSheetId);
                                setSelectedSheetId('restaurants');
                            }
                        }} isDark={isDark} danger />
                    </>
                )}

                {/* Row count on right */}
                <div className="mr-auto flex items-center gap-2">
                    <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ color: isDark ? '#aaa' : '#666', background: isDark ? '#404040' : '#e8e8e8' }}>
                        {rowData?.length || 0} صف
                    </span>
                </div>
            </div>

            {/* ═══════════════ FORMULA BAR ═══════════════ */}
            <div className="flex items-center border-b" style={{ borderColor }}>
                <div className="flex items-center justify-center border-l px-3 py-1.5 min-w-[60px]" style={{ borderColor, background: isDark ? '#2d2d2d' : '#f9fafb' }}>
                    <span className="text-xs font-mono font-bold" style={{ color: textColor }}>{selectedCell}</span>
                </div>
                <div className="flex items-center px-2" style={{ color: isDark ? '#666' : '#bbb' }}>
                    <span className="text-xs italic">fx</span>
                </div>
                <input
                    type="text"
                    readOnly
                    value={formulaBarValue}
                    className="flex-1 text-sm py-1.5 px-2 border-none focus:outline-none font-mono"
                    style={{ background: formulaBg, color: textColor }}
                    dir="auto"
                />
            </div>

            {/* ═══════════════ NEW SHEET CREATION PANEL ═══════════════ */}
            {isCreating && (
                <div className="flex items-center gap-3 px-3 py-2.5 border-b" style={{ background: isDark ? '#2a3a2a' : '#e8f5e9', borderColor }}>
                    <span className="material-symbols-outlined text-sm" style={{ color: excelGreen }}>add_circle</span>
                    <input
                        type="text"
                        value={newSheetName}
                        onChange={e => setNewSheetName(e.target.value)}
                        placeholder="اسم الكشف الجديد..."
                        className="px-3 py-1.5 text-sm border rounded font-bold w-48 focus:outline-none focus:ring-1"
                        style={{ borderColor, background: formulaBg, color: textColor, '--tw-ring-color': excelGreen } as any}
                        autoFocus
                    />
                    <input
                        type="text"
                        value={newSheetColumns}
                        onChange={e => setNewSheetColumns(e.target.value)}
                        placeholder="الأعمدة (فاصلة ,)"
                        className="px-3 py-1.5 text-sm border rounded font-bold w-64 focus:outline-none focus:ring-1"
                        style={{ borderColor, background: formulaBg, color: textColor, '--tw-ring-color': excelGreen } as any}
                        dir="ltr"
                    />
                    <button onClick={handleCreateSheet} className="px-4 py-1.5 text-white text-sm font-bold rounded hover:opacity-90 transition" style={{ background: excelGreen }}>إنشاء</button>
                    <button onClick={() => setIsCreating(false)} className="px-3 py-1.5 text-sm font-bold rounded hover:opacity-80 transition" style={{ color: textColor }}>إلغاء</button>
                </div>
            )}

            {/* ═══════════════ AG GRID (Main Spreadsheet Area) ═══════════════ */}
            <GridErrorBoundary>
                <div
                    className={isDark ? 'ag-theme-alpine-dark' : 'ag-theme-alpine'}
                    style={{
                        flex: 1,
                        width: '100%',
                        overflow: 'hidden',
                        '--ag-header-background-color': isDark ? '#2d2d2d' : '#f0f0f0',
                        '--ag-header-foreground-color': isDark ? '#d4d4d4' : '#333',
                        '--ag-background-color': isDark ? '#1e1e1e' : '#ffffff',
                        '--ag-odd-row-background-color': isDark ? '#252525' : '#f9fafb',
                        '--ag-row-hover-color': isDark ? '#333' : '#e8f0fe',
                        '--ag-alpine-active-color': excelGreen,
                        '--ag-range-selection-background-color': isDark ? 'rgba(33,115,70,0.3)' : 'rgba(33,115,70,0.15)',
                        '--ag-range-selection-border-color': excelGreen,
                        '--ag-selected-row-background-color': isDark ? 'rgba(33,115,70,0.25)' : 'rgba(33,115,70,0.1)',
                        '--ag-border-color': isDark ? '#404040' : '#e0e0e0',
                        '--ag-header-height': '36px',
                        '--ag-row-height': '32px',
                        '--ag-font-size': '13px',
                        '--ag-font-family': "'Noto Sans Arabic', 'Segoe UI', sans-serif",
                        '--ag-cell-horizontal-padding': '10px',
                        '--ag-grid-size': '4px',
                    } as any}
                >
                    <AgGridReact
                        ref={gridRef}
                        rowData={rowData}
                        columnDefs={columnDefs}
                        defaultColDef={{
                            sortable: true,
                            resizable: true,
                            filter: true,
                            flex: 1,
                            minWidth: 80,
                            enableCellChangeFlash: true,
                        }}
                        onCellValueChanged={onCellValueChanged}
                        onCellClicked={onCellClicked}
                        enableRtl={true}
                        animateRows={true}
                        rowSelection="multiple"
                        suppressRowClickSelection={true}
                        overlayNoRowsTemplate={`<span style="color:${isDark ? '#aaa' : '#999'};font-weight:bold;font-size:14px">لا توجد بيانات لعرضها</span>`}
                        overlayLoadingTemplate={`<span style="color:${isDark ? '#aaa' : '#999'};font-weight:bold;font-size:14px">جاري التحميل...</span>`}
                    />
                </div>
            </GridErrorBoundary>

            {/* ═══════════════ SHEET TABS (Bottom Bar - like Excel) ═══════════════ */}
            <div className="flex items-center border-t" style={{ background: sheetTabBg, borderColor }}>
                {/* Navigation arrows */}
                <div className="flex items-center border-l px-1" style={{ borderColor }}>
                    <button className="p-1 hover:opacity-70" style={{ color: isDark ? '#aaa' : '#666' }}>
                        <span className="material-symbols-outlined text-sm">chevron_right</span>
                    </button>
                    <button className="p-1 hover:opacity-70" style={{ color: isDark ? '#aaa' : '#666' }}>
                        <span className="material-symbols-outlined text-sm">chevron_left</span>
                    </button>
                </div>

                {/* Add new sheet tab */}
                <button
                    onClick={() => setIsCreating(true)}
                    className="p-1.5 mx-0.5 hover:opacity-70"
                    style={{ color: isDark ? '#aaa' : '#666' }}
                    title="إضافة ملف جديد"
                >
                    <span className="material-symbols-outlined text-sm">add</span>
                </button>

                {/* Sheet Tabs */}
                <div className="flex items-end overflow-x-auto no-scrollbar">
                    <SheetTab
                        label="📁 سجل المطاعم"
                        active={selectedSheetId === 'restaurants'}
                        onClick={() => setSelectedSheetId('restaurants')}
                        isDark={isDark}
                        activeBg={sheetTabActive}
                        tabBg={sheetTabBg}
                        borderColor={borderColor}
                    />
                    {operationalSheets.map(s => (
                        <SheetTab
                            key={s.id}
                            label={`📄 ${s.name}`}
                            active={selectedSheetId === s.id}
                            onClick={() => setSelectedSheetId(s.id)}
                            isDark={isDark}
                            activeBg={sheetTabActive}
                            tabBg={sheetTabBg}
                            borderColor={borderColor}
                        />
                    ))}
                </div>
            </div>

            {/* ═══════════════ STATUS BAR (Bottom) ═══════════════ */}
            <div className="flex items-center justify-between px-3 py-1" style={{ background: statusBarBg }}>
                <div className="flex items-center gap-3 text-white/90 text-xs font-bold">
                    <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                        جاهز
                    </span>
                    <span className="opacity-60">|</span>
                    <span>{rowData?.length || 0} صف</span>
                    <span className="opacity-60">|</span>
                    <span>{columnDefs?.length || 0} عمود</span>
                </div>
                <div className="flex items-center gap-2 text-white/70 text-xs">
                    <span>{selectedCell}</span>
                    <span className="opacity-60">|</span>
                    <span>100%</span>
                </div>
            </div>
        </div>
    );
};

/* ──────────────────── Toolbar Button Sub-component ──────────────────── */
const ToolbarButton: React.FC<{ icon: string; label: string; onClick: () => void; isDark: boolean; danger?: boolean }> = ({ icon, label, onClick, isDark, danger }) => (
    <button
        onClick={onClick}
        className="flex flex-col items-center gap-0.5 px-2 py-1 rounded hover:bg-black/5 dark:hover:bg-white/10 transition group"
        title={label}
    >
        <span className="material-symbols-outlined text-lg" style={{ color: danger ? '#ef4444' : isDark ? '#d4d4d4' : '#444', fontSize: '18px' }}>{icon}</span>
        <span className="text-[10px] font-bold" style={{ color: danger ? '#ef4444' : isDark ? '#aaa' : '#666' }}>{label}</span>
    </button>
);

/* ──────────────────── Sheet Tab Sub-component ──────────────────── */
const SheetTab: React.FC<{
    label: string;
    active: boolean;
    onClick: () => void;
    isDark: boolean;
    activeBg: string;
    tabBg: string;
    borderColor: string;
}> = ({ label, active, onClick, isDark, activeBg, tabBg, borderColor }) => (
    <button
        onClick={onClick}
        className="whitespace-nowrap text-xs font-bold px-3 py-1.5 border-l border-r transition-all"
        style={{
            background: active ? activeBg : 'transparent',
            color: active ? (isDark ? '#fff' : '#217346') : (isDark ? '#aaa' : '#666'),
            borderColor: active ? borderColor : 'transparent',
            borderBottom: active ? `2px solid ${isDark ? '#fff' : '#217346'}` : '2px solid transparent',
            borderTop: active ? `2px solid #217346` : '2px solid transparent',
            marginBottom: active ? '-1px' : '0',
        }}
    >
        {label}
    </button>
);

export default OperationsGridPage;
