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
    chrome.storage.local.get(['sahibindenListem', 'projectNames', 'activeProject', 'exchangeRate', 'statsCurrency'], (result) => {
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
