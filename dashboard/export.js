// ══════════════════════════════════════════════════════════════════════════════
// DIŞA AKTARMA MODÜLÜ
// Clipboard kopyalama ve Excel XML dışa aktarma.
// Bağımlılık: formatMoney (dashboard/utils.js)
// ══════════════════════════════════════════════════════════════════════════════

const ExportModule = {

    copyColumn(key) {
        chrome.storage.local.get(['sahibindenListem'], (result) => {
            const data = result.sahibindenListem || [];
            if (!data.length) return alert('Liste boş!');

            const text = data.map(item => {
                let val = item[key];
                return val ? val.toString().replace('.', ',') : "";
            }).join('\n');

            navigator.clipboard.writeText(text).then(() => {
                alert('📋 Sütun Kopyalandı!');
            });
        });
    },

    copyAllData() {
        chrome.storage.local.get(['sahibindenListem'], (result) => {
            const data = result.sahibindenListem || [];
            if (!data.length) return alert('Liste boş!');

            let text = "";
            data.forEach(s => {
                let b = (s.Baslik || "").replace(/\n/g, " ");
                const contactInfo = `${s.officeName || ''} | ${s.agentName || ''} | ${s.phones || ''}`;
                const dolulukStr = s.Doluluk ? s.Doluluk + '%' : '';
                text += `${b}\t${s.Durum || ''}\t${s.Fiyat || 0}\t${s.Brut || 0}\t${s.Net || 0}\t${dolulukStr}\t${formatMoney(s.Aidat)}\t${formatMoney(s.BirimFiyat)}\t${formatMoney(s.AidatM2)}\t${contactInfo}\t${s.Link || ''}\t${s.Not || ''}\n`;
            });

            navigator.clipboard.writeText(text).then(() => {
                alert('📋 Kopyalandı!');
            });
        });
    },

    downloadExcel() {
        chrome.storage.local.get(['sahibindenListem', 'projectNames', 'exchangeRate'], (result) => {
            const allData = result.sahibindenListem || [];
            const projects = result.projectNames || ['Varsayılan'];
            const rate = result.exchangeRate ? result.exchangeRate.rate : 0;

            if (!allData.length) return alert('Liste boş!');

            let xml = '<?xml version="1.0"?>\n';
            xml += '<?mso-application progid="Excel.Sheet"?>\n';
            xml += '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" ';
            xml += 'xmlns:o="urn:schemas-microsoft-com:office:office" ';
            xml += 'xmlns:x="urn:schemas-microsoft-com:office:excel" ';
            xml += 'xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" ';
            xml += 'xmlns:html="http://www.w3.org/TR/REC-html40">\n';

            xml += '<Styles>\n';
            xml += ' <Style ss:ID="Default" ss:Name="Normal">\n';
            xml += '  <Alignment ss:Vertical="Bottom"/>\n';
            xml += '  <Borders/>\n';
            xml += '  <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="11" ss:Color="#000000"/>\n';
            xml += '  <Interior/>\n';
            xml += '  <NumberFormat/>\n';
            xml += '  <Protection/>\n';
            xml += ' </Style>\n';
            xml += ' <Style ss:ID="Header">\n';
            xml += '  <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="11" ss:Color="#FFFFFF" ss:Bold="1"/>\n';
            xml += '  <Interior ss:Color="#007BFF" ss:Pattern="Solid"/>\n';
            xml += ' </Style>\n';
            xml += '</Styles>\n';

            const esc = (str) => {
                if (str === null || str === undefined) return '';
                return str.toString()
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&apos;');
            };

            const today = new Date().toLocaleDateString('tr-TR').replace(/\./g, '_');

            projects.forEach(projName => {
                const sheetData = allData.filter(item => (item.project || 'Varsayılan') === projName);
                if (sheetData.length === 0) return;

                xml += `<Worksheet ss:Name="${esc(projName)}">\n`;
                xml += ' <Table>\n';

                xml += '  <Column ss:Width="300"/>\n';
                xml += '  <Column ss:Width="80"/>\n';
                xml += '  <Column ss:Width="80"/>\n';
                xml += '  <Column ss:Width="80"/>\n';
                xml += '  <Column ss:Width="60"/>\n';
                xml += '  <Column ss:Width="60"/>\n';
                xml += '  <Column ss:Width="60"/>\n';
                xml += '  <Column ss:Width="80"/>\n';
                xml += '  <Column ss:Width="80"/>\n';
                xml += '  <Column ss:Width="80"/>\n';
                xml += '  <Column ss:Width="80"/>\n';
                xml += '  <Column ss:Width="80"/>\n';
                xml += '  <Column ss:Width="150"/>\n';
                xml += '  <Column ss:Width="120"/>\n';
                xml += '  <Column ss:Width="120"/>\n';
                xml += '  <Column ss:Width="300"/>\n';
                xml += '  <Column ss:Width="150"/>\n';

                xml += '  <Row>\n';
                const headers = ['Başlık', 'Durum', 'Fiyat (TL)', 'Fiyat ($)', 'Brüt m²', 'Net m²', 'Doluluk (%)', 'Aidat (TL)', 'Aidat ($)', 'Birim Fiyat (TL)', 'Birim Fiyat ($)', 'Aidat/m²', 'Ofis', 'Danışman', 'Telefon', 'Link', 'Notlar'];
                headers.forEach(h => {
                    xml += `   <Cell ss:StyleID="Header"><Data ss:Type="String">${esc(h)}</Data></Cell>\n`;
                });
                xml += '  </Row>\n';

                sheetData.forEach(item => {
                    xml += '  <Row>\n';
                    const getUsdVal = (valUSD, valTL) => {
                        if (valUSD) return valUSD;
                        if (rate > 0 && valTL > 0) return (valTL / rate).toFixed(0);
                        return '';
                    };
                    xml += `   <Cell><Data ss:Type="String">${esc(item.Baslik)}</Data></Cell>\n`;
                    xml += `   <Cell><Data ss:Type="String">${esc(item.Durum)}</Data></Cell>\n`;
                    xml += `   <Cell><Data ss:Type="String">${esc(item.Fiyat)}</Data></Cell>\n`;
                    xml += `   <Cell><Data ss:Type="String">${esc(getUsdVal(item.FiyatUSD, item.Fiyat))}</Data></Cell>\n`;
                    xml += `   <Cell><Data ss:Type="String">${esc(item.Brut)}</Data></Cell>\n`;
                    xml += `   <Cell><Data ss:Type="String">${esc(item.Net)}</Data></Cell>\n`;
                    xml += `   <Cell><Data ss:Type="String">${esc(item.Doluluk ? item.Doluluk + '%' : '')}</Data></Cell>\n`;
                    xml += `   <Cell><Data ss:Type="String">${esc(item.Aidat)}</Data></Cell>\n`;
                    xml += `   <Cell><Data ss:Type="String">${esc(getUsdVal(item.AidatUSD, item.Aidat))}</Data></Cell>\n`;
                    xml += `   <Cell><Data ss:Type="String">${esc(item.BirimFiyat)}</Data></Cell>\n`;
                    xml += `   <Cell><Data ss:Type="String">${esc(getUsdVal(item.BirimFiyatUSD, item.BirimFiyat))}</Data></Cell>\n`;
                    xml += `   <Cell><Data ss:Type="String">${esc(item.AidatM2)}</Data></Cell>\n`;
                    xml += `   <Cell><Data ss:Type="String">${esc(item.officeName)}</Data></Cell>\n`;
                    xml += `   <Cell><Data ss:Type="String">${esc(item.agentName)}</Data></Cell>\n`;
                    xml += `   <Cell><Data ss:Type="String">${esc(item.phones)}</Data></Cell>\n`;
                    xml += `   <Cell><Data ss:Type="String">${esc(item.Link)}</Data></Cell>\n`;
                    xml += `   <Cell><Data ss:Type="String">${esc(item.Not)}</Data></Cell>\n`;
                    xml += '  </Row>\n';
                });

                xml += ' </Table>\n';
                xml += '</Worksheet>\n';
            });

            xml += '</Workbook>';

            const b = new Blob([xml], { type: 'application/vnd.ms-excel' });
            const url = URL.createObjectURL(b);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Sahibinden_Projeler_${today}.xls`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        });
    }
};

// Backward compat: eski çağrılar için global alias'lar
function copyColumn(key) { ExportModule.copyColumn(key); }
function copyAllData() { ExportModule.copyAllData(); }
function downloadExcel() { ExportModule.downloadExcel(); }
