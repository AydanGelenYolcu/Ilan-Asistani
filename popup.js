document.addEventListener('DOMContentLoaded', () => {
  const scrapeBtn = document.getElementById('scrapeBtn');
  const dashboardBtn = document.getElementById('dashboardBtn');
  const statusDiv = document.getElementById('status');
  const projSelect = document.getElementById('popupProjectSelect');
  const newProjBtn = document.getElementById('popupNewProjectBtn');

  // --- PROJECT LOGIC ---
  function loadProjects() {
    chrome.storage.local.get(['projectNames', 'activeProject'], (result) => {
      const list = result.projectNames || ['Varsayılan'];
      const active = result.activeProject || 'Varsayılan';

      projSelect.innerHTML = '';
      list.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p;
        opt.innerText = p;
        if (p === active) opt.selected = true;
        projSelect.appendChild(opt);
      });
    });
  }
  loadProjects();

  projSelect.addEventListener('change', () => {
    chrome.storage.local.set({ activeProject: projSelect.value });
  });

  newProjBtn.addEventListener('click', () => {
    // Popup prompt might be blocked or ugly, let's try standard prompt
    // Chrome Extension popups support window.prompt? Yes usually.
    const name = prompt('Yeni Proje Adı:');
    if (!name) return;

    chrome.storage.local.get(['projectNames'], (res) => {
      const list = res.projectNames || ['Varsayılan'];
      if (!list.includes(name)) {
        list.push(name);
        chrome.storage.local.set({ projectNames: list, activeProject: name }, () => {
          loadProjects();
        });
      }
    });
  });
  // --- END PROJECT LOGIC ---

  function showStatus(message, type = 'success') {
    statusDiv.textContent = message;
    statusDiv.className = type === 'success' ? 'status-success' : 'status-error';
    statusDiv.style.display = 'block';
    setTimeout(() => {
      statusDiv.style.display = 'none';
    }, 3000);
  }

  // Veri Çek Butonu
  scrapeBtn.addEventListener('click', async () => {
    // Aktif sekmeyi bul
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    const supportedSites = ['sahibinden.com', 'hepsiemlak.com'];
    const isSupported = supportedSites.some(site => tab.url.includes(site));

    if (!isSupported) {
      showStatus('Lütfen Sahibinden veya HepsiEmlak ilanında olun.', 'error');
      return;
    }

    // Content script'e mesaj gönder
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'SCRAPE_LISTING' });

      if (response && response.success) {
        showStatus(response.message, 'success');
      } else if (response && !response.success) {
        showStatus(response.message, 'error');
      }
    } catch (error) {
      showStatus('Hata: Sayfa yenilenmeli veya uygun değil.', 'error');
      console.error(error);
    }
  });

  // Dashboard Butonu
  dashboardBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'dashboard.html' });
  });

  // Hızlı Ekle Butonu
  const quickAddBtn = document.getElementById('quickAddBtn');
  if (quickAddBtn) {
    quickAddBtn.addEventListener('click', async () => {
      const brut = document.getElementById('quickBrut').value;
      const doluluk = document.getElementById('quickDoluluk').value;
      const aidat = document.getElementById('quickAidat').value;
      const kira = document.getElementById('quickKira').value;

      // Hafızada tut
      if (doluluk) chrome.storage.local.set({ lastOccupancyRate: doluluk });

      const clean = (val) => {
        if (!val) return 0;
        let v = val.toString();
        v = v.replace(/\./g, '').replace(/,/g, '.');
        return parseFloat(v) || 0;
      };

      const brutVal = clean(brut);
      const aidatVal = clean(aidat);
      const kiraVal = clean(kira);

      if (brutVal === 0 && aidatVal === 0 && kiraVal === 0) {
        showStatus('En az bir değer giriniz.', 'error');
        return;
      }

      const currentProject = projSelect.value || 'Varsayılan';

      const newItem = {
        Baslik: "Hızlı Ekleme (Popup)",
        Durum: "Manuel",
        Fiyat: kiraVal,
        Brut: brutVal,
        Net: (brutVal / 1.2).toFixed(0),
        Aidat: aidatVal === 0 ? "" : aidatVal,
        BirimFiyat: "",
        AidatM2: "",
        Link: "",
        Not: "Popup Eklemesi",
        Doluluk: doluluk,
        project: currentProject
      };

      if (brutVal > 0 && kiraVal > 0) newItem.BirimFiyat = (kiraVal / brutVal).toFixed(2);
      if (brutVal > 0 && aidatVal > 0) newItem.AidatM2 = (aidatVal / brutVal).toFixed(2);

      chrome.storage.local.get(['sahibindenListem'], (result) => {
        const list = result.sahibindenListem || [];
        list.push(newItem);
        chrome.storage.local.set({ sahibindenListem: list }, () => {
          showStatus('✅ Eklendi!', 'success');
          // Clear
          document.getElementById('quickBrut').value = '';
          document.getElementById('quickDoluluk').value = doluluk; // Keep for convenience
          document.getElementById('quickAidat').value = '';
          document.getElementById('quickKira').value = '';
        });
      });
    });
  }

  // Son doluluk oranını yükle
  chrome.storage.local.get(['lastOccupancyRate'], (res) => {
    const input = document.getElementById('quickDoluluk');
    if (input && res.lastOccupancyRate) {
      input.value = res.lastOccupancyRate;
    }
  });
});
