// ══════════════════════════════════════════════════════════════════════════════
// CORE MODÜLÜ
// Ana orkestratör: loadProjectsAndData ve uygulama başlangıcı.
// Bağımlılık: DashboardState, tüm diğer modüller (projects, table, stats, widgets, excel-upload)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Ana veri yükleme ve render fonksiyonu.
 * Tüm modüller re-render için bu fonksiyonu çağırır.
 * window üzerinde global olarak erişilebilir.
 */
function loadProjectsAndData() {
    chrome.storage.local.get(['sahibindenListem', 'projectNames', 'activeProject', 'exchangeRate', 'statsCurrency', 'projectNotes', 'projectHistData'], (result) => {
        const projects = result.projectNames || ['Varsayılan'];
        const targetCur = result.statsCurrency || 'USD';
        const rateData = result.exchangeRate;

        const symbols = { 'USD': '$', 'EUR': '€', 'GBP': '£', 'JPY': '¥', 'TL': '₺' };
        const activeSymbol = symbols[targetCur] || '$';

        let conversionRate = 0;
        if (rateData && rateData.allRates && rateData.allRates[targetCur]) {
            conversionRate = rateData.allRates[targetCur];
        }

        const rateElement = document.getElementById('exchangeRateDisplay');
        const rateLabel = document.getElementById('exchangeRateLabel');
        const nameMap = { 'USD': 'Dolar', 'EUR': 'Euro', 'GBP': 'Sterlin', 'JPY': 'Yen', 'TL': 'TL' };

        if (rateElement && rateLabel && rateData && rateData.allRates && rateData.allRates[targetCur]) {
            rateLabel.innerText = `${nameMap[targetCur] || targetCur} Kuru`;
            if (targetCur === 'TL') {
                rateElement.innerText = "1.00";
            } else {
                const curToTry = (1 / rateData.allRates[targetCur]).toFixed(2);
                rateElement.innerText = curToTry;
            }
            const timeEl = document.getElementById('lastRateUpdate');
            if (timeEl && rateData.timestamp) {
                const date = new Date(rateData.timestamp);
                const timeStr = date.getHours().toString().padStart(2, '0') + ":" + date.getMinutes().toString().padStart(2, '0');
                timeEl.innerText = `(${timeStr})`;
            }
        } else if (rateElement && targetCur === 'TL') {
            if (rateLabel) rateLabel.innerText = "TL Kuru";
            rateElement.innerText = "1.00";
        }

        if (result.activeProject && projects.includes(result.activeProject)) {
            DashboardState.currentProject = result.activeProject;
        } else {
            DashboardState.currentProject = 'Varsayılan';
            chrome.storage.local.set({ activeProject: 'Varsayılan' });
        }

        ProjectsModule.renderTabs(projects, DashboardState.currentProject, document.getElementById('projectSearch')?.value || '');

        // Proje notunu yükle
        const notes = result.projectNotes || {};
        const noteEl = document.getElementById('projectNote');
        if (noteEl) noteEl.value = notes[DashboardState.currentProject] || '';

        // Proje bazlı geçmiş karşılaştırma verilerini yükle
        const histData = result.projectHistData || {};
        const projectHist = histData[DashboardState.currentProject] || {};
        const histFieldIds = ['histPrice3m', 'histPrice6m', 'histPrice1y', 'histAidat3m', 'histAidat6m', 'histAidat1y'];
        histFieldIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = projectHist[id] || '';
        });
        const excelIdEl = document.getElementById('excelIdSearch');
        const namesDisplay = document.getElementById('excelNamesDisplay');
        if (excelIdEl) {
            excelIdEl.value = projectHist.excelId || '';
            if (projectHist.excelId && typeof ExcelUploadModule !== 'undefined') {
                ExcelUploadModule.lookupNamesOnly(projectHist.excelId);
            } else if (namesDisplay) {
                namesDisplay.textContent = '';
                namesDisplay.title = '';
            }
        }

        const allData = result.sahibindenListem || [];
        let filteredData = allData.filter(item => {
            const p = (item.project || 'Varsayılan').trim();
            return p === DashboardState.currentProject.trim();
        });

        filteredData = TableModule.sortData(filteredData);
        TableModule.updateSortIcons();
        TableModule.renderTable(filteredData, conversionRate, activeSymbol);
        StatsModule.calculateStats(filteredData, conversionRate, activeSymbol);
    });
}

// Backward compat alias
function loadData() { loadProjectsAndData(); }

// ── Uygulama Başlangıcı ───────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {

    // Modül sekme geçişleri
    document.querySelectorAll('.module-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.module-tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.module-tab-content').forEach(c => {
                c.style.display = 'none';
                c.classList.remove('active');
            });
            btn.classList.add('active');
            const tab = document.getElementById('tab-' + btn.dataset.module);
            if (tab) { tab.style.display = 'block'; tab.classList.add('active'); }
        });
    });

    loadProjectsAndData();

    // Buton listener'ları
    document.getElementById('refreshBtn').addEventListener('click', loadProjectsAndData);
    document.getElementById('clearAllBtn').addEventListener('click', () => DataEntryModule.clearCurrentProjectData());
    document.getElementById('resetAllBtn').addEventListener('click', () => DataEntryModule.resetAllData());
    document.getElementById('copyAllBtn').addEventListener('click', () => ExportModule.copyAllData());
    document.getElementById('downloadBtn').addEventListener('click', () => ExportModule.downloadExcel());

    document.querySelectorAll('.copy-header').forEach(span => {
        span.addEventListener('click', (e) => {
            e.stopPropagation();
            const key = e.target.getAttribute('data-key');
            ExportModule.copyColumn(key);
        });
    });

    document.getElementById('addManualBtn').addEventListener('click', () => DataEntryModule.addManualEntry());
    document.getElementById('btnOpenGuide').addEventListener('click', () => {
        window.open('guide.html', '_blank');
    });

    // Geri Al / İleri Al
    document.getElementById('undoBtn').addEventListener('click', () => DataEntryModule.undoDelete());
    document.getElementById('redoBtn').addEventListener('click', () => DataEntryModule.redoDelete());
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            DataEntryModule.undoDelete();
        }
        if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
            e.preventDefault();
            DataEntryModule.redoDelete();
        }
    });

    // Not: Kaydet
    document.getElementById('btnSaveNote').addEventListener('click', () => {
        const noteEl = document.getElementById('projectNote');
        const msg = document.getElementById('noteSavedMsg');
        if (!noteEl) return;
        chrome.storage.local.get(['projectNotes'], (res) => {
            const notes = res.projectNotes || {};
            notes[DashboardState.currentProject] = noteEl.value;
            chrome.storage.local.set({ projectNotes: notes }, () => {
                if (msg) {
                    msg.style.display = 'inline';
                    setTimeout(() => { msg.style.display = 'none'; }, 2000);
                }
            });
        });
    });

    // Geçmiş karşılaştırma alanlarını proje bazlı kaydet
    const histFieldIds = ['histPrice3m', 'histPrice6m', 'histPrice1y', 'histAidat3m', 'histAidat6m', 'histAidat1y'];
    let histSaveTimer = null;
    const saveProjectHist = () => {
        clearTimeout(histSaveTimer);
        histSaveTimer = setTimeout(() => {
            chrome.storage.local.get(['projectHistData'], (res) => {
                const histData = res.projectHistData || {};
                const current = histData[DashboardState.currentProject] || {};
                histFieldIds.forEach(id => {
                    const el = document.getElementById(id);
                    if (el) current[id] = el.value;
                });
                const excelIdEl = document.getElementById('excelIdSearch');
                if (excelIdEl) current.excelId = excelIdEl.value;
                histData[DashboardState.currentProject] = current;
                chrome.storage.local.set({ projectHistData: histData });
            });
        }, 250); // debounce
    };
    histFieldIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', saveProjectHist);
    });
    const excelIdSearchEl = document.getElementById('excelIdSearch');
    if (excelIdSearchEl) excelIdSearchEl.addEventListener('input', saveProjectHist);

    // Not: Kopyala
    document.getElementById('btnCopyNote').addEventListener('click', () => {
        const noteEl = document.getElementById('projectNote');
        if (!noteEl || !noteEl.value.trim()) return;
        navigator.clipboard.writeText(noteEl.value).then(() => {
            const btn = document.getElementById('btnCopyNote');
            const orig = btn.textContent;
            btn.textContent = '✔ Kopyalandı';
            setTimeout(() => { btn.textContent = orig; }, 1500);
        });
    });

    const pSearch = document.getElementById('projectSearch');
    if (pSearch) pSearch.addEventListener('input', () => loadProjectsAndData());

    // Resim önizleme popup
    const previewDiv = document.createElement('div');
    previewDiv.id = 'imagePreviewPopup';
    previewDiv.className = 'preview-image-container';
    document.body.appendChild(previewDiv);

    // Kur seçici
    const curSelector = document.getElementById('globalCurrencySelector');
    if (curSelector) {
        chrome.storage.local.get(['statsCurrency'], (res) => {
            if (res.statsCurrency) curSelector.value = res.statsCurrency;
        });
        curSelector.addEventListener('change', () => {
            chrome.storage.local.set({ statsCurrency: curSelector.value }, () => {
                loadProjectsAndData();
            });
        });
    }

    // Widget'ları başlat
    WidgetsModule.init();

    // Excel yükleme modülünü başlat
    ExcelUploadModule.init();

    // Sort listener'ları kur
    TableModule.setupSortListeners();

    // Storage değişikliklerini dinle (sekmeler arası senkronizasyon)
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && (changes.activeProject || changes.sahibindenListem || changes.projectNames || changes.exchangeRate)) {
            loadProjectsAndData();
        }
    });

    // Kur yenileme butonu
    document.getElementById('refreshExchangeBtn')?.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'REFRESH_EXCHANGE_RATE' });
        const display = document.getElementById('exchangeRateDisplay');
        if (display) display.innerText = "...";
    });

    // Kur tazelik kontrolü (1 saatten eski ise yenile)
    chrome.storage.local.get(['exchangeRate'], (res) => {
        const rate = res.exchangeRate;
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;
        if (!rate || (now - rate.timestamp > oneHour)) {
            chrome.runtime.sendMessage({ action: 'REFRESH_EXCHANGE_RATE' });
        }
    });
});
