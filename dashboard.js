// ══════════════════════════════════════════════════════════════════════════════
// ⚠️ BU DOSYA ARTIK KULLANILMIYOR
// Tüm kod dashboard/ klasörüne taşındı:
//   dashboard/state.js       → Paylaşılan state
//   dashboard/utils.js       → Yardımcı fonksiyonlar
//   dashboard/projects.js    → Proje yönetimi
//   dashboard/table.js       → Tablo render & sıralama
//   dashboard/stats.js       → İstatistik hesaplama
//   dashboard/data-entry.js  → Manuel giriş & silme
//   dashboard/export.js      → Excel & clipboard dışa aktarma
//   dashboard/widgets.js     → Kur çevirici & hesap makinesi
//   dashboard/excel-upload.js → Geçmiş Excel yükleme
//   dashboard/core.js        → Ana orkestratör
//   dashboard/hava.js        → Hava Kalitesi modülü
//
// Bu dosyayı silebilirsiniz. dashboard.html artık yüklemez.
// ══════════════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {

    // ── MODÜL SEKMELERİ ──────────────────────────────────────────────────────
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

    // Event Listeners
    document.getElementById('refreshBtn').addEventListener('click', loadProjectsAndData);
    document.getElementById('clearAllBtn').addEventListener('click', clearCurrentProjectData);
    document.getElementById('resetAllBtn').addEventListener('click', resetAllData);
    document.getElementById('copyAllBtn').addEventListener('click', copyAllData);
    document.getElementById('downloadBtn').addEventListener('click', downloadExcel);

    // Column Copy Listeners
    document.querySelectorAll('.copy-header').forEach(span => {
        span.addEventListener('click', (e) => {
            e.stopPropagation();
            const key = e.target.getAttribute('data-key');
            copyColumn(key);
        });
    });
    document.getElementById('addManualBtn').addEventListener('click', addManualEntry);
    document.getElementById('btnOpenGuide').addEventListener('click', () => {
        window.open('guide.html', '_blank');
    });

    const pSearch = document.getElementById('projectSearch');
    if (pSearch) {
        pSearch.addEventListener('input', () => {
            loadProjectsAndData();
        });
    }

    // Image Preview Global Element
    const previewDiv = document.createElement('div');
    previewDiv.id = 'imagePreviewPopup';
    previewDiv.className = 'preview-image-container';
    document.body.appendChild(previewDiv);

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

    // New Project Button Logic (Will be injected or static? Let's add listener if exists, or delegate)

    initWidgets();

    // --- Excel Upload Feature ---
    initExcelUpload();

    // Listen for storage changes (keep tabs/data in sync)
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && (changes.activeProject || changes.sahibindenListem || changes.projectNames || changes.exchangeRate)) {
            loadProjectsAndData();
        }
    });

    // Manual Refresh Button for Exchange Rate
    document.getElementById('refreshExchangeBtn')?.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'REFRESH_EXCHANGE_RATE' });
        const display = document.getElementById('exchangeRateDisplay');
        if (display) display.innerText = "...";
    });

    // Freshness Check: If exchangeRate is older than 1 hour, trigger a refresh
    chrome.storage.local.get(['exchangeRate'], (res) => {
        const rate = res.exchangeRate;
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;
        if (!rate || (now - rate.timestamp > oneHour)) {
            chrome.runtime.sendMessage({ action: 'REFRESH_EXCHANGE_RATE' });
        }
    });
});

// DashboardState.currentProject ve DashboardState.currentSort → DashboardState nesnesine taşındı (dashboard/state.js)

function setupSortListeners() {
    document.querySelectorAll('th.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const column = th.dataset.sort;
            if (DashboardState.currentSort.column === column) {
                // Toggle direction
                DashboardState.currentSort.direction = DashboardState.currentSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                DashboardState.currentSort.column = column;
                DashboardState.currentSort.direction = 'asc'; // Default new sort to asc? Or desc for numbers?
                // Usually prices/numbers are better desc first (highest to lowest)? 
                // Let's stick to asc default, user can click again.
            }
            loadProjectsAndData();
        });
    });
}
// Call once on init (assuming this script runs at end of body or DOMContentLoaded is handled elsewhere?
// dashboard.js seems to be included in head? No, usually end of body.
// We can check if document is ready.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupSortListeners);
} else {
    setupSortListeners();
}

function sortData(data) {
    if (!DashboardState.currentSort.column) return data;

    return data.sort((a, b) => {
        let valA = a[DashboardState.currentSort.column];
        let valB = b[DashboardState.currentSort.column];

        // Numerical cleaning
        const clean = (v) => {
            if (typeof v === 'number') return v;
            if (!v) return 0;
            // Remove dots, replace comma with dot
            let s = v.toString().replace(/\./g, '').replace(/,/g, '.');
            return parseFloat(s) || 0;
        };

        // Check if column is numeric
        const numericCols = ['Fiyat', 'Brut', 'Net', 'Aidat', 'BirimFiyat', 'AidatM2'];
        if (numericCols.includes(DashboardState.currentSort.column)) {
            valA = clean(valA);
            valB = clean(valB);
        } else {
            // String comparison
            valA = (valA || '').toString().toLowerCase();
            valB = (valB || '').toString().toLowerCase();
        }

        if (valA < valB) return DashboardState.currentSort.direction === 'asc' ? -1 : 1;
        if (valA > valB) return DashboardState.currentSort.direction === 'asc' ? 1 : -1;
        return 0;
    });
}

function updateSortIcons() {
    document.querySelectorAll('th.sortable').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
        const icon = th.querySelector('.sort-icon');
        if (icon) icon.innerText = '';

        if (th.dataset.sort === DashboardState.currentSort.column) {
            th.classList.add(DashboardState.currentSort.direction === 'asc' ? 'sort-asc' : 'sort-desc');
            if (icon) icon.innerText = DashboardState.currentSort.direction === 'asc' ? ' ▲' : ' ▼';
        }
    });
}

function loadProjectsAndData() {
    chrome.storage.local.get(['sahibindenListem', 'projectNames', 'activeProject', 'exchangeRate', 'statsCurrency'], (result) => {
        const projects = result.projectNames || ['Varsayılan'];
        const targetCur = result.statsCurrency || 'USD';
        const rateData = result.exchangeRate;

        // Symbols Map
        const symbols = { 'USD': '$', 'EUR': '€', 'GBP': '£', 'JPY': '¥', 'TL': '₺' };
        const activeSymbol = symbols[targetCur] || '$';

        // Calculate rate for stats: priceTL * conversionRate = CUR
        let conversionRate = 0;
        if (rateData && rateData.allRates && rateData.allRates[targetCur]) {
            conversionRate = rateData.allRates[targetCur];
        }

        // Display Selected Rate (Global Header)
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

            // Display Last Update Time
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

        // Default active project logic
        if (result.activeProject && projects.includes(result.activeProject)) {
            DashboardState.currentProject = result.activeProject;
        } else {
            DashboardState.currentProject = 'Varsayılan';
            chrome.storage.local.set({ activeProject: 'Varsayılan' });
        }

        renderTabs(projects, DashboardState.currentProject, document.getElementById('projectSearch')?.value || '');

        const allData = result.sahibindenListem || [];
        // Filter data for current project
        let filteredData = allData.filter(item => {
            const p = (item.project || 'Varsayılan').trim();
            return p === DashboardState.currentProject.trim();
        });

        // Apply Sort
        filteredData = sortData(filteredData);
        updateSortIcons();

        renderTable(filteredData, conversionRate, activeSymbol);
        calculateStats(filteredData, conversionRate, activeSymbol);
    });
}

function addManualEntry() {
    const title = document.getElementById('manualTitle').value.trim() || "Manuel Giriş";
    const durum = document.getElementById('manualDurum').value;
    // Clean input helper for manual entry (handle 100.000 format)
    const cleanFn = (val) => {
        if (!val) return 0;
        let v = val.toString();
        v = v.replace(/\./g, ''); // Remove dots
        v = v.replace(/,/g, '.'); // Swap comma
        return parseFloat(v) || 0;
    };

    const price = cleanFn(document.getElementById('manualPrice').value);
    const brut = cleanFn(document.getElementById('manualBrut').value);
    const net = cleanFn(document.getElementById('manualNet').value);
    const aidat = cleanFn(document.getElementById('manualAidat').value);
    const doluluk = document.getElementById('manualDoluluk').value.trim();

    if (price <= 0 && brut <= 0) {
        alert('Lütfen en azından Fiyat ve Brüt m² giriniz.');
        return;
    }

    // Calculations
    // Check for commercial keywords (robust regex)
    const isCommercial = /(?:ma[ğg]aza|d[üu]kkan|depo|at[öo]lye)/i.test(title);

    // Only calculate unit price for non-Satılık (e.g. Kiralık) or if not specified
    // AND exclude commercial properties
    const unitPrice = (!isCommercial && durum !== 'Satılık' && price > 0 && brut > 0) ? (price / brut).toFixed(2) : 0;
    const aidatM2 = (!isCommercial && aidat > 0 && brut > 0) ? (aidat / brut).toFixed(2) : 0;

    const newItem = {
        Baslik: `[MANUEL] ${title}`,
        Durum: durum,
        Fiyat: price,
        Brut: brut,
        Net: net,
        Aidat: aidat,
        BirimFiyat: unitPrice,
        AidatM2: aidatM2,
        Link: "",
        Not: "Elle eklendi",
        Doluluk: doluluk,
        project: DashboardState.currentProject // Add current project tag
    };

    chrome.storage.local.get(['sahibindenListem'], (result) => {
        const list = result.sahibindenListem || [];
        list.push(newItem);
        chrome.storage.local.set({ sahibindenListem: list }, () => {
            loadProjectsAndData();
            // Clear inputs
            document.getElementById('manualTitle').value = '';
            document.getElementById('manualPrice').value = '';
            document.getElementById('manualBrut').value = '';
            document.getElementById('manualNet').value = '';
            document.getElementById('manualAidat').value = '';
            document.getElementById('manualDoluluk').value = '';
            document.getElementById('manualDoluluk').value = '';
        });
    });
}

function copyColumn(key) {
    chrome.storage.local.get(['sahibindenListem'], (result) => {
        const data = result.sahibindenListem || [];
        if (!data.length) return alert('Liste boş!');

        // Extract column data, replace null/undefined with empty string, handle numbers
        const text = data.map(item => {
            let val = item[key];
            return val ? val.toString().replace('.', ',') : "";
        }).join('\n');

        navigator.clipboard.writeText(text).then(() => {
            alert('📋 Sütun Kopyalandı!');
        });
    });
}

function renderTabs(projects, active, filter = '') {
    const container = document.getElementById('projectTabs');
    if (!container) return;

    const f = filter.toLocaleLowerCase('tr-TR');
    container.innerHTML = '';

    projects.forEach(p => {
        if (f && !p.toLocaleLowerCase('tr-TR').includes(f)) return;
        const btn = document.createElement('div'); // Changed to div to contain text + del button
        btn.className = `tab-btn ${p === active ? 'active' : ''}`;
        btn.style.display = 'inline-flex';
        btn.style.alignItems = 'center';
        btn.style.gap = '8px';

        btn.onclick = () => {
            chrome.storage.local.set({ activeProject: p }, () => {
                loadProjectsAndData();
            });
        };

        // Project Name Span
        const span = document.createElement('span');
        span.innerText = p;
        btn.appendChild(span);

        // Delete Button (only if not 'Varsayılan')
        if (p !== 'Varsayılan') {
            const del = document.createElement('span');
            del.innerText = '✕'; // Simpler X
            del.className = 'del-btn'; // Use CSS class
            del.title = 'Projeyi Sil';
            del.onclick = (e) => {
                e.stopPropagation();
                if (confirm(`'${p}' projesi ve tüm verileri silinecek. Emin misiniz?`)) {
                    deleteProject(p);
                }
            };
            btn.appendChild(del);
        }

        // Drag & Drop Support
        btn.ondragover = (e) => {
            e.preventDefault();
            btn.classList.add('drag-over');
        };
        btn.ondragleave = (e) => {
            btn.classList.remove('drag-over');
        };
        btn.ondrop = (e) => {
            e.preventDefault();
            btn.classList.remove('drag-over');
            const link = e.dataTransfer.getData('text/plain');
            if (link && p !== DashboardState.currentProject) {
                if (confirm(`İlanı '${p}' projesine taşımak istiyor musunuz?`)) {
                    moveItem(link, p);
                }
            }
        };

        container.appendChild(btn);
    });

    // Add "+" button
    const addBtn = document.createElement('button');
    addBtn.innerText = '+';
    addBtn.className = 'tab-btn new-project-btn';
    addBtn.onclick = createNewProject;
    container.appendChild(addBtn);
}

function deleteProject(projectName) {
    chrome.storage.local.get(['projectNames', 'sahibindenListem', 'activeProject'], (result) => {
        let projects = result.projectNames || ['Varsayılan'];
        let data = result.sahibindenListem || [];
        let active = result.activeProject || 'Varsayılan';

        // 1. Remove from projects list
        projects = projects.filter(p => p !== projectName);

        // 2. Remove associated data
        data = data.filter(item => (item.project || 'Varsayılan') !== projectName);

        // 3. Switch active project if current was deleted
        if (active === projectName) {
            active = 'Varsayılan';
        }

        chrome.storage.local.set({
            projectNames: projects,
            sahibindenListem: data,
            activeProject: active
        }, () => {
            loadProjectsAndData();
        });
    });
}

function createNewProject() {
    const name = prompt('Yeni Proje Adı:');
    if (!name) return;

    chrome.storage.local.get(['projectNames'], (result) => {
        const list = result.projectNames || ['Varsayılan'];
        if (list.includes(name)) {
            alert('Bu isimde proje zaten var!');
            return;
        }
        list.push(name);
        chrome.storage.local.set({ projectNames: list, activeProject: name }, () => {
            loadProjectsAndData();
        });
    });
}

function loadData() {
    loadProjectsAndData(); // Backward compatibility if called internally
}

function renderTable(data, currentRate, globalSymbol) {
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = '';

    data.forEach((item, index) => {
        const row = document.createElement('tr');

        // Format link - Full view asked by user
        const linkHtml = item.Link ? `<a href="${item.Link}" target="_blank" style="color:#007bff; text-decoration:none; font-size:12px;">${item.Link}</a>` : '';

        // Escape quotes for onclick
        const safeLink = (item.Link || "").replace(/'/g, "\\'");
        const safeTitle = (item.Baslik || "").replace(/'/g, "\\'");

        // Helper for Merged (TL + Currency) Cell
        const getMergedCell = (valTL, valLegacyUSD, valConverted, itemSymbol, decimals = 0) => {
            const tlStr = formatMoney(valTL);

            let curStr = '-';
            let symbol = globalSymbol;
            let isEst = false;

            // Priority:
            // 1. If Global Currency is selected (currentRate > 0) -> Show value in Global Currency (Dynamic)
            // 2. Else -> Show captured/legacy value

            if (currentRate > 0 && valTL > 0) {
                // Dynamic Conversion to match Header Stats
                curStr = symbol + formatMoney((valTL * currentRate).toFixed(decimals));
                isEst = true;
                // Only mark as estimate if it differs significantly from captured? 
                // Using live rate is better for comparison.
            } else if (itemSymbol && valConverted !== undefined && valConverted !== "") {
                symbol = itemSymbol;
                curStr = symbol + formatMoney(valConverted);
                isEst = false;
            } else if (valLegacyUSD) {
                symbol = '$';
                curStr = symbol + formatMoney(valLegacyUSD);
                isEst = false;
            }

            if (curStr === '-') return `<div style="font-weight:bold;">${tlStr}</div>`;

            // User Request: Green = Today (Live), Grey = Historical
            const color = isEst ? '#28a745' : '#999';
            // Also user might want historical to be distinct (maybe italic?)
            // Let's keep italic for grey (Historical)
            const style = isEst ? '' : 'font-style:italic;';

            return `
                <div style="font-weight:bold;">${tlStr} <small style="color:#666; font-weight:normal;">TL</small></div>
                <div style="font-size:11px; color:${color}; ${style}">${curStr}</div>
            `;
        };

        row.innerHTML = `
            <td class="editable" data-field="Baslik">
                <div class="title-with-preview" title="${item.Baslik}" data-img="${item.ImageUrl || ''}">
                    ${item.ImageUrl ? '<span class="preview-icon">🖼️</span>' : ''}
                    <div style="max-width:280px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                        ${item.Baslik}
                    </div>
                </div>
            </td>
            <td>${item.Durum || '-'}</td>
            <td class="editable" data-field="Fiyat">${getMergedCell(item.Fiyat, item.FiyatUSD, item.FiyatConverted, item.CurrencySymbol)}</td>
            <td class="editable" data-field="Brut">${item.Brut || '-'}</td>
            <td class="editable" data-field="Net">${item.Net || '-'}</td>
            <td class="editable" data-field="Doluluk">${item.Doluluk ? item.Doluluk + '%' : '-'}</td>
            <td class="editable" data-field="Aidat">${getMergedCell(item.Aidat, item.AidatUSD, item.AidatConverted, item.CurrencySymbol, 0)}</td>
            <td>${getMergedCell(item.BirimFiyat, item.BirimFiyatUSD, item.BirimFiyatConverted, item.CurrencySymbol, 2)}</td>
            <td>${getMergedCell(item.AidatM2, undefined, undefined, undefined, 2)}</td>
            <td>${linkHtml}</td>
            <td style="font-size:12px; line-height:1.4;">
                ${item.officeName ? `<div style="font-weight:bold; color:#d35400;">${item.officeName}</div>` : ''}
                ${item.agentName ? `<div>👤 ${item.agentName}</div>` : ''}
                ${item.phones ? `<div style="color:#2980b9;">📞 ${item.phones}</div>` : ''}
                ${(!item.officeName && !item.agentName && !item.phones) ? '<span style="color:#999;">-</span>' : ''}
            </td>
            <td class="actions-cell">
                <button class="btn-danger btn-sm">Sil</button>
            </td>
        `;

        // Attach Image Preview Listeners
        const titleDiv = row.querySelector('.title-with-preview');
        const previewPopup = document.getElementById('imagePreviewPopup');

        if (titleDiv && item.ImageUrl) {
            titleDiv.addEventListener('mouseenter', (e) => {
                previewPopup.innerHTML = `<img src="${item.ImageUrl}" alt="Preview" onerror="this.src='placeholder.png';">`;
                previewPopup.style.display = 'block';
            });

            titleDiv.addEventListener('mousemove', (e) => {
                const margin = 20;
                let top = e.clientY + margin;
                let left = e.clientX + margin;

                // Viewport boundaries
                const pWidth = previewPopup.offsetWidth || 320;
                const pHeight = previewPopup.offsetHeight || 240;

                if (left + pWidth > window.innerWidth) {
                    left = e.clientX - pWidth - margin;
                }
                if (top + pHeight > window.innerHeight) {
                    top = e.clientY - pHeight - margin;
                }

                previewPopup.style.top = top + 'px';
                previewPopup.style.left = left + 'px';
            });

            titleDiv.addEventListener('mouseleave', () => {
                previewPopup.style.display = 'none';
                previewPopup.innerHTML = '';
            });
        }

        // Attach Edit Listeners
        row.querySelectorAll('.editable').forEach(cell => {
            cell.addEventListener('dblclick', (e) => {
                editCell(cell, item, cell.dataset.field);
            });
        });

        // Make Draggable
        row.setAttribute('draggable', true);
        row.style.cursor = 'grab';
        row.addEventListener('dragstart', (e) => {
            // Store the item link AND project to identify unique item if duplicate links allowed across projects
            // For now link is enough as per moveItem implementation
            e.dataTransfer.setData('text/plain', item.Link);
            row.style.opacity = '0.5';
        });
        row.addEventListener('dragend', (e) => {
            row.style.opacity = '1';
        });

        // Add event listener for delete button to avoid inline JS issues
        const deleteBtn = row.querySelector('.btn-danger');
        deleteBtn.addEventListener('click', () => deleteOne(item.Link, item.Baslik));

        tbody.appendChild(row);
    });
}

// Stats Modülü → dashboard/stats.js dosyasına taşındı
// calculateStats, updateComparison, updateIntervals, setupHistListeners
// global alias'ları stats.js'de tanımlıdır


function deleteOne(itemLink) {
    chrome.storage.local.get(['sahibindenListem'], (result) => {
        let data = result.sahibindenListem || [];
        // Find index of item with this link (and ideally current project to be safe, but link is unique mostly)
        // If we strictly enforce link uniqueness globally, just link is enough.
        // But if we allow same link in different projects, we need to check project too.
        // For now, let's assume we want to delete the specific item shown.
        // Since we don't pass project to deleteOne, let's find matching item.

        const idx = data.findIndex(i => i.Link === itemLink && (i.project || 'Varsayılan') === DashboardState.currentProject);

        if (idx !== -1) {
            data.splice(idx, 1);
            chrome.storage.local.set({ sahibindenListem: data }, () => {
                loadProjectsAndData();
            });
        }
    });
}

function clearCurrentProjectData() {
    if (confirm(`'${DashboardState.currentProject}' projesindeki TÜM ilanlar silinecek. Emin misiniz?`)) {
        chrome.storage.local.get(['sahibindenListem'], (result) => {
            const allData = result.sahibindenListem || [];
            const filteredData = allData.filter(item => (item.project || 'Varsayılan') !== DashboardState.currentProject);
            chrome.storage.local.set({ sahibindenListem: filteredData }, () => {
                loadProjectsAndData();
            });
        });
    }
}

function resetAllData() {
    const code = Math.floor(1000 + Math.random() * 9000);
    const userInput = prompt(`⚠️ DİKKAT: TÜM projeler ve TÜM ilanlar KALICI olarak silinecek!\n\nDevam etmek için şu kodu yazın: ${code}`);

    if (userInput === code.toString()) {
        chrome.storage.local.set({
            sahibindenListem: [],
            projectNames: ['Varsayılan'],
            activeProject: 'Varsayılan'
        }, () => {
            alert('Sistem tamamen sıfırlandı.');
            loadProjectsAndData();
        });
    } else if (userInput !== null) {
        alert('Kod hatalı. İşlem iptal edildi.');
    }
}

function copyAllData() {
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
}

function downloadExcel() {
    chrome.storage.local.get(['sahibindenListem', 'projectNames', 'exchangeRate'], (result) => {
        const allData = result.sahibindenListem || [];
        const projects = result.projectNames || ['Varsayılan'];
        const rate = result.exchangeRate ? result.exchangeRate.rate : 0;

        if (!allData.length) return alert('Liste boş!');

        // XML Header
        let xml = '<?xml version="1.0"?>\n';
        xml += '<?mso-application progid="Excel.Sheet"?>\n';
        xml += '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" ';
        xml += 'xmlns:o="urn:schemas-microsoft-com:office:office" ';
        xml += 'xmlns:x="urn:schemas-microsoft-com:office:excel" ';
        xml += 'xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" ';
        xml += 'xmlns:html="http://www.w3.org/TR/REC-html40">\n';

        // Styles
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

        // Helper to escape XML characters
        const esc = (str) => {
            if (str === null || str === undefined) return '';
            return str.toString()
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&apos;');
        };

        // Date format for filename
        const today = new Date().toLocaleDateString('tr-TR').replace(/\./g, '_');

        // Loop through projects and create sheets
        projects.forEach(projName => {
            // Filter data for this project
            // Legacy items belong to 'Varsayılan'
            const sheetData = allData.filter(item => {
                const p = item.project || 'Varsayılan';
                return p === projName;
            });

            if (sheetData.length === 0) return; // Skip empty sheets? Or create empty? user preference. Let's skip to keep clean.

            xml += `<Worksheet ss:Name="${esc(projName)}">\n`;
            xml += ' <Table>\n';

            // Colors and Widths
            xml += '  <Column ss:Width="300"/>\n'; // Baslik
            xml += '  <Column ss:Width="80"/>\n';  // Durum
            xml += '  <Column ss:Width="80"/>\n';  // Fiyat
            xml += '  <Column ss:Width="80"/>\n';  // Fiyat USD
            xml += '  <Column ss:Width="60"/>\n';  // Brut
            xml += '  <Column ss:Width="60"/>\n';  // Net
            xml += '  <Column ss:Width="60"/>\n';  // Doluluk
            xml += '  <Column ss:Width="80"/>\n';  // Aidat
            xml += '  <Column ss:Width="80"/>\n';  // Aidat USD
            xml += '  <Column ss:Width="80"/>\n';  // Birim Fiyat
            xml += '  <Column ss:Width="80"/>\n';  // Birim Fiyat USD
            xml += '  <Column ss:Width="80"/>\n';  // Aidat/m2
            xml += '  <Column ss:Width="150"/>\n'; // Ofis
            xml += '  <Column ss:Width="120"/>\n'; // Danışman
            xml += '  <Column ss:Width="120"/>\n'; // Telefon
            xml += '  <Column ss:Width="300"/>\n'; // Link
            xml += '  <Column ss:Width="150"/>\n'; // Not

            // Header Row
            xml += '  <Row>\n';
            const headers = ['Başlık', 'Durum', 'Fiyat (TL)', 'Fiyat ($)', 'Brüt m²', 'Net m²', 'Doluluk (%)', 'Aidat (TL)', 'Aidat ($)', 'Birim Fiyat (TL)', 'Birim Fiyat ($)', 'Aidat/m²', 'Ofis', 'Danışman', 'Telefon', 'Link', 'Notlar'];
            headers.forEach(h => {
                xml += `   <Cell ss:StyleID="Header"><Data ss:Type="String">${esc(h)}</Data></Cell>\n`;
            });
            xml += '  </Row>\n';

            // Data Rows
            sheetData.forEach(item => {
                xml += '  <Row>\n';
                xml += `   <Cell><Data ss:Type="String">${esc(item.Baslik)}</Data></Cell>\n`;
                xml += `   <Cell><Data ss:Type="String">${esc(item.Durum)}</Data></Cell>\n`;
                // Numbers can be specific type if properly formatted, but String is safest for "10.000 TL" mixed content
                // If we cleaned them, we could use Number.
                // Let's use String for fidelity to view.
                // Calc USD if missing for Excel
                const getUsdVal = (valUSD, valTL) => {
                    if (valUSD) return valUSD;
                    if (rate > 0 && valTL > 0) return (valTL / rate).toFixed(0);
                    return '';
                };

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

// Helpers
function formatMoney(val) {
    if (!val) return '0';
    return val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}



// --- Move Item Feature ---
// DashboardState.currentMoveLink ve DashboardState.currentMoveTitle → DashboardState nesnesine taşındı (dashboard/state.js)

document.addEventListener('DOMContentLoaded', () => {
    // Other listeners are at the top, let's add these
    // Drag and Drop is handled in render logic
});

/*
function openMoveModal(link, title) {
    DashboardState.currentMoveLink = link;
    DashboardState.currentMoveTitle = title;

    // Populate select
    chrome.storage.local.get(['projectNames'], (result) => {
        const projects = result.projectNames || ['Varsayılan'];
        const select = document.getElementById('moveTargetSelect');
        select.innerHTML = '';

        projects.forEach(p => {
            if (p !== DashboardState.currentProject) { // Don't show current project
                const opt = document.createElement('option');
                opt.value = p;
                opt.innerText = p;
                select.appendChild(opt);
            }
        });

        if (select.options.length === 0) {
            alert('Taşınacak başka proje yok! Lütfen önce yeni bir proje oluşturun.');
            return;
        }

        document.getElementById('moveModal').style.display = 'flex';
    });
}

function closeMoveModal() {
    document.getElementById('moveModal').style.display = 'none';
    DashboardState.currentMoveLink = null;
    DashboardState.currentMoveTitle = null;
}

function confirmMove() {
    const select = document.getElementById('moveTargetSelect');
    const targetProject = select.value;

    if (!targetProject) return;
    if (!DashboardState.currentMoveLink) return;

    moveItem(DashboardState.currentMoveLink, targetProject);
    closeMoveModal();
}
*/
function moveItem(link, targetProject) {
    chrome.storage.local.get(['sahibindenListem'], (result) => {
        let data = result.sahibindenListem || [];

        // Find item in current project
        const index = data.findIndex(item => item.Link === link && (item.project || 'Varsayılan') === DashboardState.currentProject);

        if (index !== -1) {
            // Update project
            data[index].project = targetProject;

            chrome.storage.local.set({ sahibindenListem: data }, () => {
                // Refresh to show it's gone
                loadProjectsAndData();
            });
        }
    });
}

// Make editCell globally available for inline onclick
window.editCell = editCell;

// --- Editable Cell Logic ---
function editCell(td, item, field) {
    const originalValue = item[field];
    const currentText = td.innerText;

    // Create input
    const input = document.createElement('input');
    input.type = 'text';
    input.value = originalValue !== undefined ? originalValue : currentText;
    input.style.width = '100%';
    input.style.boxSizing = 'border-box';
    input.classList.add('edit-input'); // For styling

    // Replace content
    td.innerText = '';
    td.appendChild(input);
    input.focus();

    // Save on Blur or Enter
    const save = () => {
        let newValue = input.value;

        // Basic Clean for numbers
        if (['Fiyat', 'Brut', 'Net', 'Aidat', 'Doluluk'].includes(field)) {
            // Remove % if entered, 10.000 -> 10000 | 10,5 -> 10.5
            let v = newValue.replace(/%/g, '').replace(/\./g, '').replace(/,/g, '.');
            newValue = parseFloat(v) || 0;
        }

        // Update Item
        item[field] = newValue;

        // Recalculate Dependents
        if (['Fiyat', 'Brut', 'Aidat'].includes(field)) {
            // Re-apply Commercial Logic if needed
            // But item.Baslik might not be edited here, so usage is safe?
            const title = item.Baslik || "";
            const isCommercial = /mağaza|dükkan/i.test(title);
            const durum = item.Durum || "";

            const price = parseFloat(item.Fiyat) || 0;
            const brut = parseFloat(item.Brut) || 0;
            const aidat = parseFloat(item.Aidat) || 0;

            // Calc Unit Price
            if (!isCommercial && durum !== 'Satılık' && price > 0 && brut > 0) {
                item.BirimFiyat = (price / brut).toFixed(2);
            } else {
                item.BirimFiyat = 0; // or maintain existing if manual override? No, auto-recalc asked.
            }

            // Calc Aidat/m2
            if (!isCommercial && aidat > 0 && brut > 0) {
                item.AidatM2 = (aidat / brut).toFixed(2);
            } else {
                item.AidatM2 = 0;
            }
        }

        // Save to Storage
        chrome.storage.local.get(['sahibindenListem'], (result) => {
            let data = result.sahibindenListem || [];
            // Find item to update (by Link and Project)
            const idx = data.findIndex(i => i.Link === item.Link && (i.project || 'Varsayılan') === (item.project || 'Varsayılan'));
            if (idx !== -1) {
                data[idx] = item;
                chrome.storage.local.set({ sahibindenListem: data }, () => {
                    loadProjectsAndData(); // Re-render
                });
            }
        });
    };

    input.onblur = save;
    input.onkeydown = (e) => {
        if (e.key === 'Enter') {
            input.blur(); // Triggers save
        }
    };
}

// Widgets Modülü → dashboard/widgets.js dosyasına taşındı
// initWidgets() global alias olarak widgets.js'de tanımlıdır

// =============================================================
// --- EXCEL UPLOAD & HISTORICAL AUTO-FILL FEATURE ---
// Excel Upload Modulu -> dashboard/excel-upload.js dosyasina tasindi


// Hava Kalitesi Modülü → dashboard/hava.js dosyasına taşındı

