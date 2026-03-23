import JSZip from 'jszip';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { safeCompare } from '../utils';

export const generateAndDownloadArchiveZip = async (paymentDateLabel: string, restaurants: any[]) => {
    const zip = new JSZip();
    const folderName = `كشوفات_${paymentDateLabel.replace(/\s/g, '_')}`;
    const folder = zip.folder(folderName) || zip;

    // Group by branch
    const groups: { [key: string]: any[] } = {};
    restaurants.forEach(r => {
        if (!r.branch) return;
        if (!groups[r.branch]) groups[r.branch] = [];
        groups[r.branch].push(r);
    });

    const branchNames = Object.keys(groups);

    const promises = branchNames.map(async (branchName) => {
        const branchRestaurants = groups[branchName];
        const blob = await generateBranchPDFBlob(branchName, branchRestaurants, paymentDateLabel);
        if (blob) {
            folder.file(`${branchName}_${paymentDateLabel}.pdf`, blob);
        }
    });

    await Promise.all(promises);

    const content = await zip.generateAsync({ type: 'blob' });

    // Download
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = `${folderName}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};


export const generateBranchPDFBlob = async (branchName: string, restaurants: any[], paymentLabel: string, includeBranchColumn: boolean = false): Promise<Blob | null> => {
    if (!restaurants || restaurants.length === 0) return null;

    // 0. Sort by Name to ensure consistent order (fixes "incorrect sorting")
    const sortedRestaurants = [...restaurants].sort((a, b) => safeCompare(a.name, b.name));

    // 1. Setup Pagination
    const ROWS_PER_PAGE = 18; // Conservative count for A4 Landscape
    const chunks = [];
    for (let i = 0; i < sortedRestaurants.length; i += ROWS_PER_PAGE) {
        chunks.push(sortedRestaurants.slice(i, i + ROWS_PER_PAGE));
    }

    const totalBalance = sortedRestaurants.reduce((sum, r) => sum + (r.balance || 0), 0);
    const pdf = new jsPDF('l', 'pt', 'a4'); // Landscape, points, A4
    const pageWidth = 842;
    const pageHeight = 595;

    // 2. Process each chunk as a page
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '0';
    document.body.appendChild(container);

    try {
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const isLastPage = i === chunks.length - 1;

            const rowsHtml = chunk.map(r => {
                const primaryAcc = r.transferAccounts?.find((a: any) => a.isPrimary) || r.transferAccounts?.[0];
                return `<tr style="border-bottom: 1px solid #e2e8f0;">
                    ${includeBranchColumn ? `<td style="padding: 6px; font-size: 10px;">${r.branch || ''}</td>` : ''}
                    <td style="padding: 6px; font-size: 10px;">${r.name || ''}</td>
                    <td style="padding: 6px; font-size: 10px;">${r.restaurantAccountNumber || ''}</td>
                    <td style="padding: 6px; font-size: 10px;">${r.currencyType === 'new_riyal' ? 'ريال جديد' : 'ريال قديم'}</td>
                    <td style="padding: 6px; font-size: 10px; font-weight:bold">${(r.balance || 0).toLocaleString()}</td>
                    <td style="padding: 6px; font-size: 10px;">${primaryAcc?.beneficiaryName || '-'}</td>
                    <td style="padding: 6px; font-size: 10px;">${primaryAcc?.accountNumber || '-'}</td>
                    <td style="padding: 6px; font-size: 10px;">${primaryAcc?.type || '-'}</td>
                    <td style="padding: 6px; font-size: 10px;">${r.paymentPeriod === 'semi-monthly' ? 'نصف شهرية' : 'شهرية'}</td>
                </tr>`;
            }).join('');

            // Total row only on last page
            const totalRowHtml = isLastPage ? `
                <tr style="font-weight: 900; background: #f1f5f9; font-size: 12px; border-top: 2px solid #cbd5e1;">
                    <td colspan="${includeBranchColumn ? 4 : 3}" style="padding: 8px;">الإجمالي الكلي</td>
                    <td style="padding: 8px;">${totalBalance.toLocaleString()}</td>
                    <td colspan="${includeBranchColumn ? 5 : 4}" style="padding: 8px;"></td>
                </tr>
            ` : '';

            // A4 Landscape is approx 1123px width at 96dpi. We use fixed width for consistency.
            const htmlContent = `
            <div style="width: 1100px; padding: 30px; background: white; color: #1e293b; font-family: 'Segoe UI', Tahoma, sans-serif; direction: rtl; box-sizing: border-box;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; border-bottom: 2px solid #1e293b; padding-bottom: 10px;">
                    <div>
                        <h1 style="font-size: 20px; margin: 0; font-weight: 900;">${includeBranchColumn ? 'كشف سداد المطاعم - جميع الفروع' : `كشف سداد المطاعم - فرع: ${branchName}`}</h1>
                        <p style="font-size: 12px; color: #64748b; margin: 5px 0 0 0;">فترة السداد: ${paymentLabel}</p>
                    </div>
                    <div style="text-align: left;">
                        <p style="font-size: 12px; color: #64748b; margin: 0;">تاريخ الطباعة: ${new Date().toLocaleDateString('ar-SA')}</p>
                        <p style="font-size: 12px; color: #64748b; margin: 5px 0 0 0;">صفحة ${i + 1} من ${chunks.length}</p>
                    </div>
                </div>

                <table style="width: 100%; border-collapse: collapse; text-align: right;">
                    <thead>
                        <tr style="background: #1e293b; color: white;">
                            ${includeBranchColumn ? '<th style="padding: 8px 6px; font-size: 11px;">الفرع</th>' : ''}
                            <th style="padding: 8px 6px; font-size: 11px;">المطعم</th>
                            <th style="padding: 8px 6px; font-size: 11px;">رقم الحساب</th>
                            <th style="padding: 8px 6px; font-size: 11px;">العملة</th>
                            <th style="padding: 8px 6px; font-size: 11px;">الرصيد</th>
                            <th style="padding: 8px 6px; font-size: 11px;">اسم المستفيد</th>
                            <th style="padding: 8px 6px; font-size: 11px;">رقم حساب التحويل</th>
                            <th style="padding: 8px 6px; font-size: 11px;">نوع الحساب</th>
                            <th style="padding: 8px 6px; font-size: 11px;">فترة السداد</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                        ${totalRowHtml}
                    </tbody>
                </table>
            </div>`;

            container.innerHTML = htmlContent;

            const canvas = await html2canvas(container.firstElementChild as HTMLElement, {
                scale: 2,
                useCORS: true,
                logging: false
            });

            const imgData = canvas.toDataURL('image/jpeg', 0.95);
            const imgWidth = pageWidth;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;

            if (i > 0) pdf.addPage();
            pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight);
        }

        return pdf.output('blob');

    } catch (e) {
        console.error("PDF Generation Error:", e);
        alert("حدث خطأ أثناء إنشاء ملف PDF (Export Utils)");
        return null; // Return null on error
    } finally {
        document.body.removeChild(container);
    }
};

export const generateGroupedPDF = async (
    title: string,
    groups: { name: string; restaurants: any[]; total: number }[],
    paymentLabel: string
): Promise<Blob | null> => {
    if (!groups || groups.length === 0) return null;

    const pdf = new jsPDF('l', 'pt', 'a4');
    const pageWidth = 842;

    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '0';
    document.body.appendChild(container);

    try {
        // Flatten into pages manually to ensure headers don't break awkwardly
        // We will transform the groups into a flat list of "Rows" where a row can be:
        // - "GroupHeader"
        // - "DataRow"
        // - "GroupTotal"
        // Then we chunk this list.

        type RowType =
            | { type: 'header', text: string }
            | { type: 'data', data: any }
            | { type: 'total', amount: number, label: string };

        const allRows: RowType[] = [];
        let grandTotal = 0;

        groups.forEach(g => {
            allRows.push({ type: 'header', text: g.name });
            g.restaurants.forEach(r => allRows.push({ type: 'data', data: r }));
            allRows.push({ type: 'total', amount: g.total, label: `إجمالي ${g.name}` });
            grandTotal += g.total;
        });

        // Add Grand Total
        allRows.push({ type: 'total', amount: grandTotal, label: 'الإجمالي الكلي' });

        const ROWS_PER_PAGE = 16;
        const chunks = [];
        for (let i = 0; i < allRows.length; i += ROWS_PER_PAGE) {
            chunks.push(allRows.slice(i, i + ROWS_PER_PAGE));
        }

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];

            const rowsHtml = chunk.map(row => {
                if (row.type === 'header') {
                    return `
                        <tr>
                            <td colspan="9" style="background-color: #e2e8f0; font-weight: 900; padding: 10px; border: 1px solid #000; font-size: 13px; text-align: right;">
                                ${row.text}
                            </td>
                        </tr>
                    `;
                } else if (row.type === 'total') {
                    return `
                        <tr style="background-color: #f1f5f9; font-weight: 900;">
                            <td colspan="4" style="padding: 8px; border: 1px solid #000; text-align: right;">${row.label}</td>
                            <td style="padding: 8px; border: 1px solid #000; text-align: right;">${row.amount.toLocaleString()}</td>
                            <td colspan="4" style="padding: 8px; border: 1px solid #000;"></td>
                        </tr>
                    `;
                } else {
                    // Data Row
                    const r = row.data;
                    const primaryAcc = r.transferAccounts?.find((a: any) => a.isPrimary) || r.transferAccounts?.[0];
                    return `
                        <tr>
                            <td style="padding: 6px; border: 1px solid #000; font-size: 10px; width: 10%; text-align: right;">${r.branch || '-'}</td>
                            <td style="padding: 6px; border: 1px solid #000; font-size: 10px; width: 15%; text-align: right;">${r.name || ''}</td>
                            <td style="padding: 6px; border: 1px solid #000; font-size: 10px; width: 8%; text-align: right;">${r.restaurantAccountNumber || ''}</td>
                            <td style="padding: 6px; border: 1px solid #000; font-size: 10px; width: 8%; text-align: right;">${r.currencyType === 'new_riyal' ? 'جديد' : 'قديم'}</td>
                            <td style="padding: 6px; border: 1px solid #000; font-size: 10px; font-weight:bold; width: 10%; text-align: right;">${(r.balance || 0).toLocaleString()}</td>
                            <td style="padding: 6px; border: 1px solid #000; font-size: 10px; width: 15%; text-align: right;">${primaryAcc?.beneficiaryName || '-'}</td>
                            <td style="padding: 6px; border: 1px solid #000; font-size: 10px; width: 15%; text-align: right;">${primaryAcc?.accountNumber || '-'}</td>
                            <td style="padding: 6px; border: 1px solid #000; font-size: 10px; width: 10%; text-align: right;">${primaryAcc?.type || '-'}</td>
                            <td style="padding: 6px; border: 1px solid #000; font-size: 10px; width: 9%; text-align: right;">${r.paymentPeriod === 'semi-monthly' ? 'نصف' : 'شهر'}</td>
                        </tr>
                    `;
                }
            }).join('');

            const htmlContent = `
            <div style="width: 1100px; padding: 40px; background: white; color: #000; font-family: 'Segoe UI', Tahoma, sans-serif; direction: rtl; box-sizing: border-box;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; border-bottom: 3px solid #000; padding-bottom: 15px;">
                    <div>
                        <h1 style="font-size: 24px; margin: 0; font-weight: 900; color: #000;">${title}</h1>
                        <p style="font-size: 14px; font-weight: bold; margin: 5px 0 0 0;">فترة السداد: ${paymentLabel}</p>
                    </div>
                    <div style="text-align: left;">
                        <p style="font-size: 12px; margin: 0; font-weight: bold;">تاريخ الطباعة: ${new Date().toLocaleDateString('ar-SA')}</p>
                        <p style="font-size: 12px; margin: 5px 0 0 0; font-weight: bold;">صفحة ${i + 1} من ${chunks.length}</p>
                    </div>
                </div>

                <table style="width: 100%; border-collapse: collapse; text-align: right;">
                    <thead>
                        <tr style="background: #0f172a; color: white;">
                            <th style="padding: 8px; border: 1px solid #000; font-size: 11px; width: 10%;">الفرع</th>
                            <th style="padding: 8px; border: 1px solid #000; font-size: 11px; width: 15%;">المطعم</th>
                            <th style="padding: 8px; border: 1px solid #000; font-size: 11px; width: 8%;">رقم الحساب</th>
                            <th style="padding: 8px; border: 1px solid #000; font-size: 11px; width: 8%;">العملة</th>
                            <th style="padding: 8px; border: 1px solid #000; font-size: 11px; width: 10%;">الرصيد</th>
                            <th style="padding: 8px; border: 1px solid #000; font-size: 11px; width: 15%;">اسم المستفيد</th>
                            <th style="padding: 8px; border: 1px solid #000; font-size: 11px; width: 15%;">رقم حساب التحويل</th>
                            <th style="padding: 8px; border: 1px solid #000; font-size: 11px; width: 10%;">نوع البنك</th>
                            <th style="padding: 8px; border: 1px solid #000; font-size: 11px; width: 9%;">الفترة</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                </table>
            </div>`;

            container.innerHTML = htmlContent;

            const canvas = await html2canvas(container.firstElementChild as HTMLElement, {
                scale: 2,
                useCORS: true,
                logging: false
            });

            const imgData = canvas.toDataURL('image/jpeg', 0.90);
            const imgWidth = pageWidth;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;

            if (i > 0) pdf.addPage();
            pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight);
        }

        return pdf.output('blob');

    } catch (e) {
        console.error("PDF Generation Error:", e);
        alert("حدث خطأ أثناء إنشاء ملف PDF (Grouped)");
        return null;
    } finally {
        document.body.removeChild(container);
    }
};
