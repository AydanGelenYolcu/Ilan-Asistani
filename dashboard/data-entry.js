// ══════════════════════════════════════════════════════════════════════════════
// VERİ GİRİŞİ MODÜLÜ
// Manuel ilan ekleme, silme ve sıfırlama işlemleri.
// Bağımlılık: DashboardState, window.loadProjectsAndData
// ══════════════════════════════════════════════════════════════════════════════

const DataEntryModule = {

    addManualEntry() {
        const title = document.getElementById('manualTitle').value.trim() || "Manuel Giriş";
        const durum = document.getElementById('manualDurum').value;

        const cleanFn = (val) => {
            if (!val) return 0;
            let v = val.toString().replace(/\./g, '').replace(/,/g, '.');
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

        const isCommercial = /(?:ma[ğg]aza|d[üu]kkan|depo|at[öo]lye)/i.test(title);
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
            project: DashboardState.currentProject
        };

        chrome.storage.local.get(['sahibindenListem'], (result) => {
            const list = result.sahibindenListem || [];
            list.push(newItem);
            chrome.storage.local.set({ sahibindenListem: list }, () => {
                loadProjectsAndData();
                document.getElementById('manualTitle').value = '';
                document.getElementById('manualPrice').value = '';
                document.getElementById('manualBrut').value = '';
                document.getElementById('manualNet').value = '';
                document.getElementById('manualAidat').value = '';
                document.getElementById('manualDoluluk').value = '';
            });
        });
    },

    deleteOne(itemLink) {
        chrome.storage.local.get(['sahibindenListem'], (result) => {
            let data = result.sahibindenListem || [];
            const idx = data.findIndex(i =>
                i.Link === itemLink && (i.project || 'Varsayılan') === DashboardState.currentProject
            );
            if (idx !== -1) {
                data.splice(idx, 1);
                chrome.storage.local.set({ sahibindenListem: data }, () => {
                    loadProjectsAndData();
                });
            }
        });
    },

    clearCurrentProjectData() {
        if (confirm(`'${DashboardState.currentProject}' projesindeki TÜM ilanlar silinecek. Emin misiniz?`)) {
            chrome.storage.local.get(['sahibindenListem'], (result) => {
                const allData = result.sahibindenListem || [];
                const filteredData = allData.filter(item =>
                    (item.project || 'Varsayılan') !== DashboardState.currentProject
                );
                chrome.storage.local.set({ sahibindenListem: filteredData }, () => {
                    loadProjectsAndData();
                });
            });
        }
    },

    resetAllData() {
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
};

// Backward compat: eski çağrılar için global alias'lar
function addManualEntry() { DataEntryModule.addManualEntry(); }
function deleteOne(itemLink) { DataEntryModule.deleteOne(itemLink); }
function clearCurrentProjectData() { DataEntryModule.clearCurrentProjectData(); }
function resetAllData() { DataEntryModule.resetAllData(); }
