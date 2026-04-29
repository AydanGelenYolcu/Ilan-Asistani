// ══════════════════════════════════════════════════════════════════════════════
// EXCEL YÜKLEME MODÜLÜ
// Geçmiş dönem Excel verisi yükleme, sütun tespiti ve ID araması.
// Bağımlılık: XLSX global (libs/xlsx.full.min.js)
// ══════════════════════════════════════════════════════════════════════════════

const ExcelUploadModule = {

    init() {
        const fileInput = document.getElementById('excelFileInput');
        const uploadBtn = document.getElementById('excelUploadBtn');
        const deleteBtn = document.getElementById('excelDeleteBtn');
        const idSearch = document.getElementById('excelIdSearch');

        if (!fileInput || !uploadBtn) return;

        uploadBtn.addEventListener('click', () => fileInput.click());

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) ExcelUploadModule.handleExcelUpload(file);
            fileInput.value = '';
        });

        if (deleteBtn) deleteBtn.addEventListener('click', () => ExcelUploadModule.deleteExcelData());

        if (idSearch) {
            idSearch.addEventListener('input', () => {
                const id = idSearch.value.trim();
                if (id) {
                    ExcelUploadModule.searchById(id);
                } else {
                    ExcelUploadModule.clearHistoricalFields();
                    const namesDisplay = document.getElementById('excelNamesDisplay');
                    if (namesDisplay) namesDisplay.textContent = '';
                }
            });
        }

        ExcelUploadModule.updateExcelUI();
    },

    /**
     * Smart column detection: ID/Name/Rent/Maintenance keyword eşleştirmesi
     */
    detectColumns(headers) {
        const mapping = { idCol: -1, nameCol: -1, rentCol: -1, maintenanceCol: -1 };

        const idKeywords = ['id', 'kod', 'numara', 'no'];
        const nameKeywords = ['name', 'isim', 'ad', 'proje', 'project'];
        const rentKeywords = ['rent', 'kira', 'fiyat', 'price', 'ucret', 'ücret', 'bedel'];
        const maintenanceKeywords = ['maintenance', 'aidat', 'bakım', 'bakim', 'gider', 'service', 'servis', 'yönetim', 'yonetim'];

        headers.forEach((header, idx) => {
            if (header === undefined || header === null) return;
            const h = header.toString().toLowerCase().trim();

            if (mapping.idCol === -1 && idKeywords.some(kw => h === kw || h.includes(kw))) mapping.idCol = idx;
            if (mapping.nameCol === -1 && nameKeywords.some(kw => h.includes(kw))) mapping.nameCol = idx;
            if (mapping.rentCol === -1 && rentKeywords.some(kw => h.includes(kw))) mapping.rentCol = idx;
            if (mapping.maintenanceCol === -1 && maintenanceKeywords.some(kw => h.includes(kw))) mapping.maintenanceCol = idx;
        });

        return mapping;
    },

    /**
     * SheetJS ile Excel dosyasını parse et ve chrome.storage'a kaydet
     */
    handleExcelUpload(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetNames = workbook.SheetNames;

                if (!sheetNames || sheetNames.length === 0) {
                    alert('Excel dosyasında sheet bulunamadı!');
                    return;
                }

                const parsedSheets = [];
                for (const sheetName of sheetNames) {
                    const worksheet = workbook.Sheets[sheetName];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                    if (!jsonData || jsonData.length < 2) continue;

                    const headers = jsonData[0];
                    const colMap = ExcelUploadModule.detectColumns(headers);

                    if (colMap.idCol === -1) {
                        console.warn(`Sheet "${sheetName}": ID sütunu bulunamadı, atlanıyor.`);
                        continue;
                    }

                    const rows = [];
                    for (let i = 1; i < jsonData.length; i++) {
                        const row = jsonData[i];
                        const id = row[colMap.idCol];
                        if (id === undefined || id === null || id.toString().trim() === '') continue;

                        rows.push({
                            id: id.toString().trim(),
                            name: colMap.nameCol >= 0 ? (row[colMap.nameCol] || '').toString().trim() : '',
                            rent: colMap.rentCol >= 0 ? parseFloat(row[colMap.rentCol]) || 0 : 0,
                            maintenance: colMap.maintenanceCol >= 0 ? parseFloat(row[colMap.maintenanceCol]) || 0 : 0
                        });
                    }

                    parsedSheets.push({
                        name: sheetName,
                        rows,
                        colMap: {
                            id: headers[colMap.idCol] || 'ID',
                            name: colMap.nameCol >= 0 ? headers[colMap.nameCol] : null,
                            rent: colMap.rentCol >= 0 ? headers[colMap.rentCol] : null,
                            maintenance: colMap.maintenanceCol >= 0 ? headers[colMap.maintenanceCol] : null
                        }
                    });
                }

                if (parsedSheets.length === 0) {
                    alert('Excel dosyasında geçerli veri bulunamadı!\nEn az bir sheet\'te ID sütunu olmalıdır.');
                    return;
                }

                const excelData = { fileName: file.name, uploadedAt: Date.now(), sheets: parsedSheets };
                chrome.storage.local.set({ excelHistData: excelData }, () => {
                    ExcelUploadModule.updateExcelUI();
                    alert(`✅ "${file.name}" başarıyla yüklendi!\n${parsedSheets.length} sheet işlendi.`);
                });

            } catch (err) {
                console.error('Excel parse error:', err);
                alert('Excel dosyası okunamadı! Lütfen geçerli bir .xlsx veya .xls dosyası yükleyin.');
            }
        };
        reader.readAsArrayBuffer(file);
    },

    deleteExcelData() {
        if (!confirm('Yüklü Excel dosyası silinecek. Emin misiniz?')) return;
        chrome.storage.local.remove('excelHistData', () => {
            ExcelUploadModule.updateExcelUI();
            ExcelUploadModule.clearHistoricalFields();
            const namesDisplay = document.getElementById('excelNamesDisplay');
            if (namesDisplay) namesDisplay.textContent = '';
            const idSearch = document.getElementById('excelIdSearch');
            if (idSearch) idSearch.value = '';
        });
    },

    /**
     * ID ile arama: ilk 3 sheet'te eşleşen satırları bulup geçmiş alanlarını doldurur.
     * Sheet[0] → 3 Ay Önce, Sheet[1] → 6 Ay Önce, Sheet[2] → 1 Yıl Önce
     */
    searchById(searchId) {
        chrome.storage.local.get(['excelHistData'], (result) => {
            const excelData = result.excelHistData;
            if (!excelData || !excelData.sheets || excelData.sheets.length === 0) return;

            const targetSheets = excelData.sheets.slice(0, 3);
            const allNames = new Set();
            const results = [];
            const normalizedSearch = searchId.toString().trim().toLowerCase();

            for (let i = 0; i < targetSheets.length; i++) {
                const sheet = targetSheets[i];
                const matchingRows = sheet.rows.filter(row =>
                    row.id.toString().trim().toLowerCase() === normalizedSearch
                );

                if (matchingRows.length > 0) {
                    matchingRows.forEach(row => { if (row.name && row.name.trim()) allNames.add(row.name.trim()); });
                    const avgRent = matchingRows.reduce((sum, r) => sum + r.rent, 0) / matchingRows.length;
                    const avgMaintenance = matchingRows.reduce((sum, r) => sum + r.maintenance, 0) / matchingRows.length;
                    results[i] = { rent: avgRent, maintenance: avgMaintenance, sheetName: sheet.name };
                } else {
                    results[i] = null;
                }
            }

            const namesDisplay = document.getElementById('excelNamesDisplay');
            if (namesDisplay) {
                if (allNames.size > 0) {
                    namesDisplay.textContent = '📋 ' + Array.from(allNames).join(' | ');
                    namesDisplay.title = Array.from(allNames).join('\n');
                } else {
                    namesDisplay.textContent = '❌ Bu ID bulunamadı';
                    namesDisplay.title = '';
                }
            }

            const priceFields = ['histPrice3m', 'histPrice6m', 'histPrice1y'];
            const aidatFields = ['histAidat3m', 'histAidat6m', 'histAidat1y'];

            const formatForHist = (val) => {
                if (!val || val <= 0) return '';
                if (Number.isInteger(val)) return val.toString();
                return val.toFixed(2).replace('.', ',');
            };

            for (let i = 0; i < 3; i++) {
                const priceEl = document.getElementById(priceFields[i]);
                const aidatEl = document.getElementById(aidatFields[i]);
                if (results[i]) {
                    if (priceEl) priceEl.value = formatForHist(results[i].rent);
                    if (aidatEl) aidatEl.value = formatForHist(results[i].maintenance);
                } else {
                    if (priceEl) priceEl.value = '';
                    if (aidatEl) aidatEl.value = '';
                }
            }

            ExcelUploadModule.triggerHistInputEvents();
        });
    },

    /**
     * Sadece "excelNamesDisplay"i günceller, hist alanlarını ezmez.
     * Proje değişiminde kayıtlı manuel girişlerin korunması için kullanılır.
     */
    lookupNamesOnly(searchId) {
        const namesDisplay = document.getElementById('excelNamesDisplay');
        if (!namesDisplay) return;
        chrome.storage.local.get(['excelHistData'], (result) => {
            const excelData = result.excelHistData;
            if (!excelData || !excelData.sheets || excelData.sheets.length === 0) {
                namesDisplay.textContent = '';
                return;
            }
            const targetSheets = excelData.sheets.slice(0, 3);
            const allNames = new Set();
            const normalized = searchId.toString().trim().toLowerCase();

            for (const sheet of targetSheets) {
                sheet.rows
                    .filter(r => r.id.toString().trim().toLowerCase() === normalized)
                    .forEach(r => { if (r.name && r.name.trim()) allNames.add(r.name.trim()); });
            }

            if (allNames.size > 0) {
                namesDisplay.textContent = '📋 ' + Array.from(allNames).join(' | ');
                namesDisplay.title = Array.from(allNames).join('\n');
            } else {
                namesDisplay.textContent = '❌ Bu ID bulunamadı';
                namesDisplay.title = '';
            }
        });
    },

    clearHistoricalFields() {
        const fields = ['histPrice3m', 'histPrice6m', 'histPrice1y', 'histAidat3m', 'histAidat6m', 'histAidat1y'];
        fields.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        ExcelUploadModule.triggerHistInputEvents();
    },

    triggerHistInputEvents() {
        const el = document.getElementById('histPrice3m');
        if (el && el.oninput) el.oninput();
    },

    updateExcelUI() {
        chrome.storage.local.get(['excelHistData'], (result) => {
            const excelData = result.excelHistData;
            const hasData = !!(excelData && excelData.sheets && excelData.sheets.length > 0);

            const deleteBtn = document.getElementById('excelDeleteBtn');
            const fileLabel = document.getElementById('excelFileLabel');
            const searchRow = document.getElementById('excelSearchRow');
            const uploadBtn = document.getElementById('excelUploadBtn');

            if (deleteBtn) deleteBtn.style.display = hasData ? 'inline-block' : 'none';

            if (fileLabel) {
                if (hasData) {
                    fileLabel.textContent = '📁 ' + excelData.fileName;
                    fileLabel.title = `${excelData.fileName} (${excelData.sheets.length} sheet)`;
                } else {
                    fileLabel.textContent = '';
                    fileLabel.title = '';
                }
            }

            if (searchRow) searchRow.style.display = hasData ? 'flex' : 'none';
            if (uploadBtn) uploadBtn.textContent = hasData ? '📤 Değiştir' : '📤 Excel Yükle';
        });
    }
};

// Backward compat: eski çağrılar için global alias'lar
function initExcelUpload() { ExcelUploadModule.init(); }
function updateExcelUI() { ExcelUploadModule.updateExcelUI(); }
function clearHistoricalFields() { ExcelUploadModule.clearHistoricalFields(); }
function triggerHistInputEvents() { ExcelUploadModule.triggerHistInputEvents(); }
