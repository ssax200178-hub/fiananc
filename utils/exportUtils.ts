import JSZip from 'jszip';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

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

    // 1. Create HTML Template
    // We add a specific class for pagination if needed, but mainly relying on A4 dimensions
    const rows = restaurants.map(r => {
        const primaryAcc = r.transferAccounts?.find((a: any) => a.isPrimary) || r.transferAccounts?.[0];
        return `<tr>
            ${includeBranchColumn ? `<td>${r.branch || ''}</td>` : ''}
            <td>${r.name || ''}</td>
            <td>${r.restaurantAccountNumber || ''}</td>
            <td>${r.currencyType === 'new_riyal' ? 'ريال جديد' : 'ريال قديم'}</td>
            <td style="font-weight:bold">${(r.balance || 0).toLocaleString()}</td>
            <td>${primaryAcc?.beneficiaryName || '-'}</td>
            <td>${primaryAcc?.accountNumber || '-'}</td>
            <td>${primaryAcc?.type || '-'}</td>
            <td>${r.paymentPeriod === 'semi-monthly' ? 'نصف شهرية' : 'شهرية'}</td>
        </tr>`;
    }).join('');

    const totalBalance = restaurants.reduce((sum, r) => sum + (r.balance || 0), 0);

    // A4 Landscape Width in px (approx at 96 DPI) is around 1123px.
    // We set container width ensuring it fits nicely.
    const htmlContent = `
    <div id="pdf-container-${branchName.replace(/\s/g, '-')}" style="width: 1100px; padding: 20px; background: white; color: #1e293b; font-family: 'Segoe UI', Tahoma, sans-serif; direction: rtl;">
        <h1 style="font-size: 22px; margin-bottom: 5px;">${includeBranchColumn ? 'كشف سداد المطاعم - جميع الفروع' : `كشف سداد المطاعم - فرع: ${branchName}`}</h1>
        <h2 style="font-size: 13px; color: #64748b; margin-bottom: 15px;">فترة السداد: ${paymentLabel} | تاريخ: ${new Date().toLocaleDateString('ar-SA')} | عدد المطاعم: ${restaurants.length}</h2>
        <table style="width: 100%; border-collapse: collapse;">
            <thead>
                <tr>
                    ${includeBranchColumn ? '<th style="background: #1e293b; color: white; padding: 8px 6px; font-size: 11px; text-align: right;">الفرع</th>' : ''}
                    <th style="background: #1e293b; color: white; padding: 8px 6px; font-size: 11px; text-align: right;">المطعم</th>
                    <th style="background: #1e293b; color: white; padding: 8px 6px; font-size: 11px; text-align: right;">رقم الحساب</th>
                    <th style="background: #1e293b; color: white; padding: 8px 6px; font-size: 11px; text-align: right;">العملة</th>
                    <th style="background: #1e293b; color: white; padding: 8px 6px; font-size: 11px; text-align: right;">الرصيد</th>
                    <th style="background: #1e293b; color: white; padding: 8px 6px; font-size: 11px; text-align: right;">اسم المستفيد</th>
                    <th style="background: #1e293b; color: white; padding: 8px 6px; font-size: 11px; text-align: right;">رقم حساب التحويل</th>
                    <th style="background: #1e293b; color: white; padding: 8px 6px; font-size: 11px; text-align: right;">نوع الحساب</th>
                    <th style="background: #1e293b; color: white; padding: 8px 6px; font-size: 11px; text-align: right;">فترة السداد</th>
                </tr>
            </thead>
            <tbody>
                ${rows}
                <tr style="font-weight: 900; background: #f1f5f9; font-size: 13px;">
                    <td colspan="${includeBranchColumn ? 4 : 3}" style="padding: 8px 6px; border-bottom: 1px solid #e2e8f0;">الإجمالي</td>
                    <td style="padding: 8px 6px; border-bottom: 1px solid #e2e8f0;">${totalBalance.toLocaleString()}</td>
                    <td colspan="${includeBranchColumn ? 5 : 4}" style="padding: 8px 6px; border-bottom: 1px solid #e2e8f0;"></td>
                </tr>
            </tbody>
        </table>
    </div>`;

    // 2. Render to invisible DOM element
    const container = document.createElement('div');
    container.innerHTML = htmlContent;
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '0';
    document.body.appendChild(container);

    try {
        // 3. Capture with html2canvas
        const canvas = await html2canvas(container.firstElementChild as HTMLElement, {
            scale: 2, // Higher scale for quality
            useCORS: true,
            logging: false
        });

        const imgData = canvas.toDataURL('image/jpeg', 0.95);

        // A4 Landscape dimensions in pt (approx)
        const pdfWidth = 842;
        const pdfHeight = 595;

        const imgWidth = pdfWidth;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        const pdf = new jsPDF('l', 'pt', 'a4'); // Landscape, points, A4

        let heightLeft = imgHeight;
        let position = 0;

        // Add first page
        pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;

        // Add subsequent pages if needed
        while (heightLeft > 0) {
            position = position - pdfHeight; // Move the image up
            pdf.addPage();
            pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
            heightLeft -= pdfHeight;
        }

        return pdf.output('blob');

    } catch (e) {
        console.error("PDF Generation Error:", e);
        return null;
    } finally {
        document.body.removeChild(container);
    }
};
