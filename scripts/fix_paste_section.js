const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'components', 'SettingsPage.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Find the start and end of PasteExtractorSection
const startMarker = '// Helper: parse number from Arabic/English string';
const endMarker = '\nconst SettingsPage = () => {';

const startIdx = content.indexOf(startMarker);
const endIdx = content.indexOf(endMarker);

if (startIdx === -1 || endIdx === -1) {
    console.error('Markers not found!', { startIdx, endIdx });
    process.exit(1);
}

const newSection = `// Helper: parse number from Arabic/English string
const parseNum = (t: string): number => {
    if (!t || t.trim() === '-' || t.trim() === '\u2014' || t.trim() === '') return 0;
    let c = t.trim().replace(/,/g, '').replace(/\u066C/g, '').replace(/ /g, '');
    if (c.startsWith('(') && c.endsWith(')')) c = '-' + c.slice(1, -1);
    return parseFloat(c) || 0;
};

// Known Arabic column headers for tawseel.app tables
const HEADER_PATTERNS: Record<string, string[]> = {
    accountName: ['\u0627\u0633\u0645 \u0627\u0644\u062D\u0633\u0627\u0628', '\u0627\u0644\u0627\u0633\u0645', '\u0627\u0633\u0645'],
    accountNumber: ['\u0631\u0642\u0645 \u0627\u0644\u062D\u0633\u0627\u0628', '\u0631\u0642\u0645', '\u0627\u0644\u0631\u0642\u0645'],
    branch: ['\u0627\u0644\u0641\u0631\u0639', '\u0641\u0631\u0639'],
    currency: ['\u0627\u0644\u0639\u0645\u0644\u0629', '\u0639\u0645\u0644\u0629', '\u0639\u0645\u0644\u0629 \u0627\u0644\u062D\u0633\u0627\u0628'],
    debit: ['\u0645\u062F\u064A\u0646', '\u0627\u0644\u0645\u062F\u064A\u0646'],
    credit: ['\u062F\u0627\u0626\u0646', '\u0627\u0644\u062F\u0627\u0626\u0646'],
    balance: ['\u0627\u0644\u0631\u0635\u064A\u062F', '\u0631\u0635\u064A\u062F'],
    financialStatement: ['\u0627\u0644\u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0645\u0627\u0644\u064A\u0629', '\u0627\u0644\u0642\u0627\u0626\u0645\u0629'],
    main1: ['\u0631\u0626\u064A\u0633\u064A1', '\u0631\u0626\u064A\u0633\u064A 1'],
    main2: ['\u0631\u0626\u064A\u0633\u064A2', '\u0631\u0626\u064A\u0633\u064A 2'],
    main4: ['\u0631\u0626\u064A\u0633\u064A4', '\u0631\u0626\u064A\u0633\u064A 4'],
    costCenter: ['\u0645\u0631\u0643\u0632 \u0627\u0644\u062A\u0643\u0644\u0641\u0629', '\u0645\u0631\u0643\u0632'],
    difference: ['\u0627\u0644\u0641\u0627\u0631\u0642', '\u0641\u0627\u0631\u0642'],
};

// Detect column mapping from header row
const detectColumnMap = (headerCols: string[]): Record<string, number> => {
    const map: Record<string, number> = {};
    headerCols.forEach((col, idx) => {
        const cleaned = col.trim();
        if (!cleaned || cleaned === '#') return;
        for (const [key, patterns] of Object.entries(HEADER_PATTERNS)) {
            if (patterns.some(p => cleaned.includes(p))) {
                if (!(key in map)) map[key] = idx;
                break;
            }
        }
    });
    return map;
};

// Component: Paste data extractor for tawseel.app tables
const PasteExtractorSection = ({ onSaved, syncMetadata: syncMeta }: { onSaved: () => void, syncMetadata: any }) => {
    const [pasteType, setPasteType] = useState<'bank' | 'restaurant'>('bank');
    const [pasteText, setPasteText] = useState('');
    const [parsedData, setParsedData] = useState<any[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [saveResult, setSaveResult] = useState('');
    const [detectedCols, setDetectedCols] = useState('');

    const handleParse = () => {
        setSaveResult('');
        setDetectedCols('');
        const parsed: any[] = [];
        
        // Try HTML table parsing first
        if (pasteText.includes('<table') || pasteText.includes('<tr')) {
            const parser = new DOMParser();
            const htmlDoc = parser.parseFromString(\`<div>\${pasteText}</div>\`, 'text/html');
            const rows = htmlDoc.querySelectorAll('tr');
            
            let colMap: Record<string, number> = {};
            const thRow = htmlDoc.querySelector('tr');
            if (thRow) {
                const ths = thRow.querySelectorAll('th, td');
                const headerTexts = Array.from(ths).map(th => th.textContent?.trim() || '');
                colMap = detectColumnMap(headerTexts);
            }
            
            rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length < 5) return;
                
                const accountName = colMap.accountName !== undefined ? (cells[colMap.accountName]?.textContent?.trim() || '') : (cells[1]?.textContent?.trim() || '');
                const accountNumber = colMap.accountNumber !== undefined ? (cells[colMap.accountNumber]?.textContent?.trim() || '') : (cells[2]?.textContent?.trim() || '');
                const branch = colMap.branch !== undefined ? (cells[colMap.branch]?.textContent?.trim() || '') : '';
                const currency = colMap.currency !== undefined ? (cells[colMap.currency]?.textContent?.trim() || '') : '';
                const debit = parseNum(colMap.debit !== undefined ? (cells[colMap.debit]?.textContent || '0') : '0');
                const credit = parseNum(colMap.credit !== undefined ? (cells[colMap.credit]?.textContent || '0') : '0');
                const balance = parseNum(colMap.balance !== undefined ? (cells[colMap.balance]?.textContent || '0') : '0');
                
                if (accountNumber && !/^(#|\u0631\u0642\u0645|\u0631\u0642\u0645 \u0627\u0644\u062D\u0633\u0627\u0628)$/.test(accountNumber) && !\u0627accountName.includes('\u0625\u062C\u0645\u0627\u0644\u064A') && !accountName.includes('\u0627\u0644\u0625\u062C\u0645\u0627\u0644\u064A')) {
                    parsed.push({ accountNumber, accountName, name: accountName, branch, currency, debit, credit, balance, difference: debit - credit, type: pasteType, lastUpdated: new Date().toISOString() });
                }
            });
        }
        
        // Fallback: Tab-separated text parsing with header detection
        if (parsed.length === 0) {
            const lines = pasteText.split('\\n').filter(l => l.trim());
            if (lines.length < 2) {
                setParsedData([]);
                setSaveResult('\u26A0\uFE0F \u0644\u0645 \u064A\u062A\u0645 \u0627\u0644\u0639\u062B\u0648\u0631 \u0639\u0644\u0649 \u0628\u064A\u0627\u0646\u0627\u062A \u0643\u0627\u0641\u064A\u0629.');
                return;
            }
            
            let colMap: Record<string, number> = {};
            let dataStartIdx = 0;
            
            for (let i = 0; i < Math.min(3, lines.length); i++) {
                const cols = lines[i].split('\\t');
                const testMap = detectColumnMap(cols);
                if (Object.keys(testMap).length >= 2) {
                    colMap = testMap;
                    dataStartIdx = i + 1;
                    const colNames: Record<string, string> = { accountName: '\u0627\u0633\u0645 \u0627\u0644\u062D\u0633\u0627\u0628', accountNumber: '\u0631\u0642\u0645 \u0627\u0644\u062D\u0633\u0627\u0628', branch: '\u0627\u0644\u0641\u0631\u0639', currency: '\u0627\u0644\u0639\u0645\u0644\u0629', debit: '\u0645\u062F\u064A\u0646', credit: '\u062F\u0627\u0626\u0646', balance: '\u0627\u0644\u0631\u0635\u064A\u062F' };
                    const detected = Object.entries(testMap).filter(([k]) => k in colNames).map(([k, v]) => \`\${colNames[k]}: \u0639\u0645\u0648\u062F \${v + 1}\`).join(' | ');
                    setDetectedCols(\`\u2705 \u062A\u0645 \u0627\u0643\u062A\u0634\u0627\u0641 \u0627\u0644\u0623\u0639\u0645\u062F\u0629: \${detected}\`);
                    break;
                }
            }
            
            for (let i = dataStartIdx; i < lines.length; i++) {
                const cols = lines[i].split('\\t');
                if (cols.length < 3) continue;
                
                let accountName = '';
                let accountNumber = '';
                let branch = '';
                let currency = '';
                let debit = 0;
                let credit = 0;
                let balance = 0;
                
                if (Object.keys(colMap).length >= 2) {
                    accountName = colMap.accountName !== undefined ? (cols[colMap.accountName]?.trim() || '') : '';
                    accountNumber = colMap.accountNumber !== undefined ? (cols[colMap.accountNumber]?.trim() || '') : '';
                    branch = colMap.branch !== undefined ? (cols[colMap.branch]?.trim() || '') : '';
                    currency = colMap.currency !== undefined ? (cols[colMap.currency]?.trim() || '') : '';
                    debit = colMap.debit !== undefined ? parseNum(cols[colMap.debit] || '0') : 0;
                    credit = colMap.credit !== undefined ? parseNum(cols[colMap.credit] || '0') : 0;
                    balance = colMap.balance !== undefined ? parseNum(cols[colMap.balance] || '0') : (debit - credit);
                } else {
                    const numCol = cols.findIndex(c => /^\\d{3,6}$/.test(c.trim()));
                    if (numCol < 0) continue;
                    accountNumber = cols[numCol].trim();
                    const textCols = cols.map((c: string, idx: number) => ({ text: c.trim(), idx })).filter((x: any) => x.text.length > 2 && !/^[\\d,.\\-()]+$/.test(x.text) && x.idx !== numCol);
                    accountName = textCols.length > 0 ? textCols[0].text : '';
                    if (textCols.length > 1) branch = textCols[1].text;
                    const numericCols = cols.map((c: string, idx: number) => ({ val: parseNum(c), idx })).filter((x: any) => x.idx > numCol && (x.val !== 0 || /^0(\\.0+)?$/.test(cols[x.idx]?.trim())));
                    debit = numericCols[0]?.val || 0;
                    credit = numericCols[1]?.val || 0;
                    balance = numericCols[2]?.val || (debit - credit);
                }
                
                if (!accountNumber || /^(#|\u0631\u0642\u0645|\u0631\u0642\u0645 \u0627\u0644\u062D\u0633\u0627\u0628)$/.test(accountNumber)) continue;
                if (accountName.includes('\u0625\u062C\u0645\u0627\u0644\u064A') || accountName.includes('\u0627\u0644\u0625\u062C\u0645\u0627\u0644\u064A')) continue;
                
                parsed.push({ accountNumber, accountName, name: accountName, branch, currency, debit, credit, balance, difference: debit - credit, type: pasteType, lastUpdated: new Date().toISOString() });
            }
        }
        
        setParsedData(parsed);
        if (parsed.length === 0) {
            setSaveResult('\u26A0\uFE0F \u0644\u0645 \u064A\u062A\u0645 \u0627\u0644\u0639\u062B\u0648\u0631 \u0639\u0644\u0649 \u0628\u064A\u0627\u0646\u0627\u062A. \u062A\u0623\u0643\u062F \u0645\u0646 \u0646\u0633\u062E \u0627\u0644\u062C\u062F\u0648\u0644 \u0628\u0627\u0644\u0643\u0627\u0645\u0644.');
        } else {
            setSaveResult(\`\u2705 \u062A\u0645 \u0627\u0633\u062A\u062E\u0631\u0627\u062C \${parsed.length} \u062D\u0633\u0627\u0628. \u0631\u0627\u062C\u0639 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u062B\u0645 \u0627\u0636\u063A\u0637 \u062D\u0641\u0638.\`);
        }
    };

    const handleSave = async () => {
        if (parsedData.length === 0) return;
        setIsSaving(true);
        setSaveResult('\u23F3 \u062C\u0627\u0631\u064A \u0627\u0644\u062D\u0641\u0638...');
        try {
            const count = await settingsService.saveSystemBalancesBatch(parsedData);
            const bankCount = parsedData.filter(d => d.type === 'bank').length;
            const restCount = parsedData.filter(d => d.type === 'restaurant').length;
            await settingsService.updateSyncMetadata({
                lastSync: new Date().toISOString(),
                status: 'success',
                bankCount: (syncMeta?.bankCount || 0) + (pasteType === 'bank' ? bankCount : 0),
                restaurantCount: (syncMeta?.restaurantCount || 0) + (pasteType === 'restaurant' ? restCount : 0),
            });
            setSaveResult(\`\u2705 \u062A\u0645 \u062D\u0641\u0638 \${count} \u062D\u0633\u0627\u0628 \u0628\u0646\u062C\u0627\u062D!\`);
            setPasteText('');
            setParsedData([]);
            onSaved();
        } catch (e: any) {
            setSaveResult(\`\u274C \u0641\u0634\u0644 \u0627\u0644\u062D\u0641\u0638: \${e.message}\`);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20">
                <h2 className="text-xl font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                    <span className="material-symbols-outlined text-blue-600 dark:text-blue-400">content_paste</span>
                    \u0627\u0633\u062A\u062E\u0631\u0627\u062C \u0627\u0644\u0623\u0631\u0635\u062F\u0629 \u0645\u0646 tawseel.app
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">\u0627\u0641\u062A\u062D \u0635\u0641\u062D\u0629 \u0627\u0644\u062A\u0642\u0631\u064A\u0631 \u0641\u064A tawseel.app \u2190 \u062D\u062F\u062F \u0627\u0644\u062C\u062F\u0648\u0644 (Ctrl+A) \u2190 \u0627\u0646\u0633\u062E (Ctrl+C) \u2190 \u0627\u0644\u0635\u0642 \u0647\u0646\u0627</p>
            </div>
            <div className="p-6 space-y-4">
                <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                        <span className="material-symbols-outlined text-blue-500 mt-0.5">info</span>
                        <div className="text-sm text-blue-800 dark:text-blue-300 space-y-1">
                            <p className="font-bold">\u0637\u0631\u064A\u0642\u0629 \u0627\u0644\u0627\u0633\u062A\u062E\u062F\u0627\u0645:</p>
                            <ol className="list-decimal mr-5 space-y-1">
                                <li>\u0627\u0641\u062A\u062D \u0635\u0641\u062D\u0629 \u0627\u0644\u062A\u0642\u0631\u064A\u0631 \u0641\u064A <a href="https://tawseel.app/admin/accounting/report/monthly?branch%5B%5D=tenant.*&accounting_types=0&financial_statement=0&currency=-1&clause=-1&entry_type=-1&account=6000&all_branch=0&cost_center=-1" target="_blank" className="underline font-bold hover:text-blue-600">tawseel.app (\u0628\u0646\u0648\u0643)</a> \u0623\u0648 <a href="https://tawseel.app/admin/accounting/report/monthly?branch%5B%5D=tenant.*&accounting_types=0&financial_statement=0&currency=-1&clause=-1&entry_type=-1&account=2000&all_branch=0&cost_center=-1" target="_blank" className="underline font-bold hover:text-blue-600">tawseel.app (\u0645\u0637\u0627\u0639\u0645)</a></li>
                                <li>\u062D\u062F\u062F \u0643\u0644 \u0627\u0644\u062C\u062F\u0648\u0644 \u0628\u0627\u0644\u0645\u0627\u0648\u0633 \u0623\u0648 Ctrl+A \u062B\u0645 Ctrl+C</li>
                                <li>\u0627\u062E\u062A\u0631 \u0627\u0644\u0646\u0648\u0639 (\u0628\u0646\u0648\u0643/\u0645\u0637\u0627\u0639\u0645) \u0648\u0627\u0644\u0635\u0642 \u0628\u0627\u0644\u0623\u0633\u0641\u0644</li>
                            </ol>
                        </div>
                    </div>
                </div>

                <div className="flex gap-3 items-center">
                    <label className="text-sm font-bold text-slate-600 dark:text-slate-300">\u0646\u0648\u0639 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A:</label>
                    <div className="flex gap-2">
                        <button onClick={() => setPasteType('bank')} className={\`px-4 py-2 rounded-lg text-sm font-bold transition-all \${pasteType === 'bank' ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200'}\`}>
                            \uD83C\uDFE6 \u0628\u0646\u0648\u0643 (6000)
                        </button>
                        <button onClick={() => setPasteType('restaurant')} className={\`px-4 py-2 rounded-lg text-sm font-bold transition-all \${pasteType === 'restaurant' ? 'bg-amber-600 text-white shadow-lg' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200'}\`}>
                            \uD83C\uDF7D\uFE0F \u0645\u0637\u0627\u0639\u0645 (2000)
                        </button>
                    </div>
                </div>

                <textarea
                    value={pasteText}
                    onChange={e => { setPasteText(e.target.value); setParsedData([]); setSaveResult(''); setDetectedCols(''); }}
                    placeholder="\u0627\u0644\u0635\u0642 \u0627\u0644\u062C\u062F\u0648\u0644 \u0647\u0646\u0627 (Ctrl+V)..."
                    className="w-full h-40 p-4 bg-slate-50 dark:bg-slate-800 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl text-sm font-mono outline-none focus:border-blue-500 resize-y transition-all"
                    dir="ltr"
                />

                <div className="flex gap-3 flex-wrap">
                    <button onClick={handleParse} disabled={!pasteText.trim()} className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all flex items-center gap-2 shadow-lg">
                        <span className="material-symbols-outlined">search</span>
                        \u062A\u062D\u0644\u064A\u0644 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A
                    </button>
                    {parsedData.length > 0 && (
                        <button onClick={handleSave} disabled={isSaving} className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl transition-all flex items-center gap-2 shadow-lg">
                            <span className="material-symbols-outlined">{isSaving ? 'hourglass_empty' : 'cloud_upload'}</span>
                            {isSaving ? '\u062C\u0627\u0631\u064A \u0627\u0644\u062D\u0641\u0638...' : \`\u062D\u0641\u0638 \${parsedData.length} \u062D\u0633\u0627\u0628 \u0641\u064A Firestore\`}
                        </button>
                    )}
                </div>

                {detectedCols && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-bold bg-slate-50 dark:bg-slate-800 p-2 rounded-lg">{detectedCols}</p>
                )}

                {saveResult && (
                    <p className={\`text-sm font-bold p-3 rounded-lg \${saveResult.includes('\u274C') ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400' : saveResult.includes('\u2705') ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400' : 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400'}\`}>{saveResult}</p>
                )}

                {parsedData.length > 0 && (
                    <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-xl">
                        <table className="w-full text-right text-sm">
                            <thead className="bg-slate-100 dark:bg-slate-800 text-slate-500 text-xs font-bold">
                                <tr>
                                    <th className="px-3 py-2">#</th>
                                    <th className="px-3 py-2">\u0627\u0633\u0645 \u0627\u0644\u062D\u0633\u0627\u0628</th>
                                    <th className="px-3 py-2">\u0631\u0642\u0645 \u0627\u0644\u062D\u0633\u0627\u0628</th>
                                    <th className="px-3 py-2">\u0627\u0644\u0641\u0631\u0639</th>
                                    <th className="px-3 py-2">\u0645\u062F\u064A\u0646</th>
                                    <th className="px-3 py-2">\u062F\u0627\u0626\u0646</th>
                                    <th className="px-3 py-2">\u0627\u0644\u0631\u0635\u064A\u062F</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                {parsedData.map((d, i) => (
                                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                        <td className="px-3 py-2 text-slate-400 text-xs">{i + 1}</td>
                                        <td className="px-3 py-2 font-bold text-slate-800 dark:text-white">{d.accountName}</td>
                                        <td className="px-3 py-2 font-mono text-slate-500">{d.accountNumber}</td>
                                        <td className="px-3 py-2 text-slate-500">{d.branch || '\u2014'}</td>
                                        <td className="px-3 py-2 font-mono">{d.debit.toLocaleString()}</td>
                                        <td className="px-3 py-2 font-mono">{d.credit.toLocaleString()}</td>
                                        <td className="px-3 py-2 font-mono font-bold text-emerald-600">{d.balance.toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};
`;

content = content.substring(0, startIdx) + newSection + content.substring(endIdx);
fs.writeFileSync(filePath, content, 'utf8');
console.log('OK - PasteExtractorSection replaced successfully');
