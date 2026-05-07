// ══════════════════════════════════════════════════════════════════════════════
// TABLO MODÜLÜ
// Tablo render, sıralama, hücre düzenleme.
// Bağımlılık: DashboardState, formatMoney (utils.js), window.loadProjectsAndData
// ══════════════════════════════════════════════════════════════════════════════

const TableModule = {

    setupSortListeners() {
        document.querySelectorAll('th.sortable').forEach(th => {
            th.addEventListener('click', () => {
                const column = th.dataset.sort;
                if (DashboardState.currentSort.column === column) {
                    DashboardState.currentSort.direction = DashboardState.currentSort.direction === 'asc' ? 'desc' : 'asc';
                } else {
                    DashboardState.currentSort.column = column;
                    DashboardState.currentSort.direction = 'asc';
                }
                loadProjectsAndData();
            });
        });
    },

    sortData(data) {
        if (!DashboardState.currentSort.column) return data;

        return data.sort((a, b) => {
            let valA = a[DashboardState.currentSort.column];
            let valB = b[DashboardState.currentSort.column];

            const clean = (v) => {
                if (typeof v === 'number') return v;
                if (!v) return 0;
                let s = v.toString().replace(/\./g, '').replace(/,/g, '.');
                return parseFloat(s) || 0;
            };

            const numericCols = ['Fiyat', 'Brut', 'Net', 'Aidat', 'BirimFiyat', 'AidatM2'];
            if (numericCols.includes(DashboardState.currentSort.column)) {
                valA = clean(valA);
                valB = clean(valB);
            } else {
                valA = (valA || '').toString().toLowerCase();
                valB = (valB || '').toString().toLowerCase();
            }

            if (valA < valB) return DashboardState.currentSort.direction === 'asc' ? -1 : 1;
            if (valA > valB) return DashboardState.currentSort.direction === 'asc' ? 1 : -1;
            return 0;
        });
    },

    updateSortIcons() {
        document.querySelectorAll('th.sortable').forEach(th => {
            th.classList.remove('sort-asc', 'sort-desc');
            const icon = th.querySelector('.sort-icon');
            if (icon) icon.innerText = '';

            if (th.dataset.sort === DashboardState.currentSort.column) {
                th.classList.add(DashboardState.currentSort.direction === 'asc' ? 'sort-asc' : 'sort-desc');
                if (icon) icon.innerText = DashboardState.currentSort.direction === 'asc' ? ' ▲' : ' ▼';
            }
        });
    },

    renderTable(data, currentRate, globalSymbol) {
        const tbody = document.getElementById('tableBody');
        tbody.innerHTML = '';

        data.forEach((item) => {
            const row = document.createElement('tr');

            const linkHtml = item.Link
                ? `<a href="${item.Link}" target="_blank" style="color:#007bff; text-decoration:none; font-size:12px;">${item.Link}</a>`
                : '';

            const safeLink = (item.Link || "").replace(/'/g, "\\'");
            const safeTitle = (item.Baslik || "").replace(/'/g, "\\'");

            const getMergedCell = (valTL, valLegacyUSD, valConverted, itemSymbol, decimals = 0) => {
                const tlStr = formatMoney(valTL);
                let curStr = '-';
                let symbol = globalSymbol;
                let isEst = false;

                if (currentRate > 0 && valTL > 0) {
                    curStr = symbol + formatMoney((valTL * currentRate).toFixed(decimals));
                    isEst = true;
                } else if (itemSymbol && valConverted !== undefined && valConverted !== "") {
                    symbol = itemSymbol;
                    curStr = symbol + formatMoney(valConverted);
                } else if (valLegacyUSD) {
                    symbol = '$';
                    curStr = symbol + formatMoney(valLegacyUSD);
                }

                if (curStr === '-') return `<div style="font-weight:bold;">${tlStr}</div>`;

                const color = isEst ? '#28a745' : '#999';
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
                <td class="editable" data-field="BirimFiyat">${getMergedCell(item.BirimFiyat, item.BirimFiyatUSD, item.BirimFiyatConverted, item.CurrencySymbol, 2)}</td>
                <td class="editable" data-field="AidatM2">${getMergedCell(item.AidatM2, undefined, undefined, undefined, 2)}</td>
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

            // Resim Önizleme
            const titleDiv = row.querySelector('.title-with-preview');
            const previewPopup = document.getElementById('imagePreviewPopup');

            if (titleDiv && item.ImageUrl) {
                titleDiv.addEventListener('mouseenter', () => {
                    previewPopup.innerHTML = `<img src="${item.ImageUrl}" alt="Preview" onerror="this.src='placeholder.png';">`;
                    previewPopup.style.display = 'block';
                });
                titleDiv.addEventListener('mousemove', (e) => {
                    const margin = 20;
                    let top = e.clientY + margin;
                    let left = e.clientX + margin;
                    const pWidth = previewPopup.offsetWidth || 320;
                    const pHeight = previewPopup.offsetHeight || 240;
                    if (left + pWidth > window.innerWidth) left = e.clientX - pWidth - margin;
                    if (top + pHeight > window.innerHeight) top = e.clientY - pHeight - margin;
                    previewPopup.style.top = top + 'px';
                    previewPopup.style.left = left + 'px';
                });
                titleDiv.addEventListener('mouseleave', () => {
                    previewPopup.style.display = 'none';
                    previewPopup.innerHTML = '';
                });
            }

            // Düzenleme Listener'ları
            row.querySelectorAll('.editable').forEach(cell => {
                cell.addEventListener('dblclick', () => {
                    TableModule.editCell(cell, item, cell.dataset.field);
                });
            });

            // Sürükle-Bırak
            row.setAttribute('draggable', true);
            row.style.cursor = 'grab';
            row.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', item.Link);
                row.style.opacity = '0.5';
            });
            row.addEventListener('dragend', () => { row.style.opacity = '1'; });

            // Sil Butonu
            const deleteBtn = row.querySelector('.btn-danger');
            deleteBtn.addEventListener('click', () => deleteOne(item.Link));

            tbody.appendChild(row);
        });
    },

    editCell(td, item, field) {
        const originalValue = item[field];
        const isNumeric = ['Fiyat', 'Brut', 'Net', 'Aidat', 'Doluluk', 'BirimFiyat', 'AidatM2'].includes(field);

        const input = document.createElement('input');
        input.type = 'text';
        // Sayısal alanlar için ham sayıyı TR formatında göster (43000 → "43.000")
        if (isNumeric && originalValue !== undefined && originalValue !== '' && originalValue !== 0) {
            const num = parseFloat(String(originalValue).replace(/\./g, '').replace(/,/g, '.')) || 0;
            input.value = num > 0 ? formatMoney(num) : (originalValue || '');
        } else {
            input.value = originalValue !== undefined ? originalValue : td.innerText;
        }
        input.style.width = '100%';
        input.style.boxSizing = 'border-box';
        input.classList.add('edit-input');

        td.innerText = '';
        td.appendChild(input);
        input.focus();
        input.select();

        let saved = false;

        const cancel = () => {
            if (saved) return;
            saved = true;
            loadProjectsAndData(); // hücreyi orijinal hâline döndür
        };

        const save = () => {
            if (saved) return;
            saved = true;

            let newValue = input.value.trim();

            // Boş bırakıldıysa veya değişmediyse kaydetme
            if (newValue === '' || newValue === input.defaultValue) {
                loadProjectsAndData();
                return;
            }

            if (isNumeric) {
                // Akıllı TR/EN format tespiti:
                // - Son ayraç virgülse ve arkasında ≤2 hane varsa → ondalık virgül (TR: "1.500,50" veya "43,5")
                // - Son ayraç noktaysa ve arkasında ≤2 hane varsa → ondalık nokta (EN: "1,500.50" veya "43.5")
                // - Aksi hâlde binlik ayraç, temizle
                let v = newValue.replace(/%/g, '');
                const lastComma = v.lastIndexOf(',');
                const lastDot   = v.lastIndexOf('.');
                if (lastComma > lastDot) {
                    // Virgül en sonda → TR ondalık: nokta = binlik ayraç
                    const afterComma = v.slice(lastComma + 1);
                    if (afterComma.length <= 2) {
                        v = v.replace(/\./g, '').replace(',', '.');
                    } else {
                        // Virgül binlik ayraç (örn. "1,500,000")
                        v = v.replace(/,/g, '');
                    }
                } else if (lastDot > lastComma) {
                    // Nokta en sonda → EN ondalık: virgül = binlik ayraç
                    const afterDot = v.slice(lastDot + 1);
                    if (afterDot.length <= 2) {
                        v = v.replace(/,/g, '');
                    } else {
                        // Nokta binlik ayraç (TR: "43.000")
                        v = v.replace(/\./g, '');
                    }
                }
                newValue = parseFloat(v) || 0;
            }

            item[field] = newValue;

            const title = item.Baslik || "";
            const isCommercial = /mağaza|dükkan/i.test(title);
            const durum = item.Durum || "";
            const brut = parseFloat(item.Brut) || 0;

            if (['Fiyat', 'Brut', 'Aidat'].includes(field)) {
                const price = parseFloat(item.Fiyat) || 0;
                const aidat = parseFloat(item.Aidat) || 0;
                if (!isCommercial && durum !== 'Satılık' && price > 0 && brut > 0) {
                    item.BirimFiyat = (price / brut).toFixed(2);
                } else {
                    item.BirimFiyat = 0;
                }
                if (!isCommercial && aidat > 0 && brut > 0) {
                    item.AidatM2 = (aidat / brut).toFixed(2);
                } else {
                    item.AidatM2 = 0;
                }
            } else if (field === 'BirimFiyat' && !isCommercial && durum !== 'Satılık' && brut > 0) {
                item.Fiyat = Math.round(newValue * brut);
            } else if (field === 'AidatM2' && !isCommercial && brut > 0) {
                item.Aidat = Math.round(newValue * brut);
            }

            chrome.storage.local.get(['sahibindenListem'], (result) => {
                let data = result.sahibindenListem || [];
                const idx = data.findIndex(i =>
                    i.Link === item.Link && (i.project || 'Varsayılan') === (item.project || 'Varsayılan')
                );
                if (idx !== -1) {
                    data[idx] = item;
                    chrome.storage.local.set({ sahibindenListem: data }, () => {
                        loadProjectsAndData();
                    });
                }
            });
        };

        input.onblur = save;
        input.onkeydown = (e) => {
            if (e.key === 'Enter') { input.blur(); }
            if (e.key === 'Escape') { saved = false; cancel(); }
        };
    }
};

// Backward compat: eski çağrılar için global alias'lar
function setupSortListeners() { TableModule.setupSortListeners(); }
function sortData(data) { return TableModule.sortData(data); }
function updateSortIcons() { TableModule.updateSortIcons(); }
function renderTable(data, currentRate, globalSymbol) { TableModule.renderTable(data, currentRate, globalSymbol); }
function editCell(td, item, field) { TableModule.editCell(td, item, field); }

// editCell'i global olarak da açık et (onclick attribute için)
window.editCell = TableModule.editCell.bind(TableModule);
