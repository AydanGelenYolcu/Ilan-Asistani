<p align="center">
  <h1 align="center">🏠 İlan Asistanı</h1>
  <p align="center">Sahibinden & Hepsiemlak için güçlü Chrome/Brave eklentisi</p>
  <p align="center">Emlak ilanlarını toplayın, analiz edin ve Excel'e aktarın · CSB hava kalitesi verilerini takip edin</p>
</p>

---

## ✨ Özellikler

- 🔍 **Otomatik İlan Toplama** — Sahibinden.com ve Hepsiemlak üzerindeki emlak ilanlarını tek tıkla toplar
- 📊 **Dashboard & Analiz** — Toplanan ilanları tablo halinde görüntüler, filtreler ve karşılaştırır
- 💱 **Döviz Dönüşümü** — TL, USD ve EUR fiyatlarını anlık kurlarla otomatik hesaplar
- 🗺️ **Harita Entegrasyonu** — OpenStreetMap ile ilanları harita üzerinde görselleştirir
- 🌫️ **CSB Hava Kalitesi** — Çevre Şehircilik Bakanlığı (sim.csb.gov.tr) üzerinden hava kalitesi verisi çeker
- 📁 **Excel Export** — Tüm verileri tek tıkla Excel dosyasına aktarır
- ✅ **Akıllı Doğrulama** — Eksik veya hatalı ilanları otomatik filtreler

---

## 🚀 Kurulum

### 1. Repoyu Klonla veya İndir

```bash
git clone https://github.com/AydanGelenYolcu/Ilan-Asistani.git
```

### 2. Chrome/Brave'e Yükle

1. Tarayıcında `chrome://extensions` adresini aç
2. Sağ üstten **Geliştirici modu**nu aç
3. **Paketlenmemiş uzantı yükle** butonuna tıkla
4. İndirdiğin klasörü seç

### 3. Kullanmaya Başla

Sahibinden.com veya Hepsiemlak'a git, uzantı ikonu otomatik aktif olacak! 🎉

---

## 📂 Proje Yapısı

```
Ilan-Asistani/
├── manifest.json          # Uzantı tanımlaması (Manifest v3)
├── background.js          # Servis worker — arka plan işlemleri
├── content.js             # Ana içerik scripti
├── popup.html / popup.js  # Uzantı popup arayüzü
├── dashboard.html/.js     # İlan analiz paneli
├── styles.css             # Arayüz stilleri
├── guide.html             # Kullanım kılavuzu
├── hava_bridge.js         # CSB hava kalitesi köprüsü
├── hava_content.js        # CSB içerik scripti
├── parsers/               # Alan ve döviz ayrıştırıcıları
├── scrapers/              # Sahibinden & Hepsiemlak scraper'ları
├── validators/            # İlan doğrulama modülleri
├── map/                   # Harita entegrasyonu
├── utils/                 # Yardımcı fonksiyonlar
├── libs/                  # Harici kütüphaneler
├── dashboard/             # Dashboard bileşenleri
└── docs/                  # Belgeler
```

---

## 🌐 Desteklenen Siteler

| Site | Durum |
|------|-------|
| [Sahibinden.com](https://www.sahibinden.com) | ✅ Destekleniyor |
| [Hepsiemlak.com](https://www.hepsiemlak.com) | ✅ Destekleniyor |
| [CSB Hava Kalitesi](https://sim.csb.gov.tr) | ✅ Destekleniyor |

---

## 🛠️ Teknolojiler

- **Manifest V3** — Modern Chrome uzantı mimarisi
- **Vanilla JavaScript** — Framework bağımsız
- **OpenStreetMap / Nominatim** — Harita ve geocoding
- **ExchangeRate API** — Anlık döviz kurları
- **CSB SIM API** — Hava kalitesi verileri

---

## 📋 İzinler

| İzin | Neden |
|------|-------|
| `activeTab` | Aktif sayfadaki ilanları okumak için |
| `storage` | Toplanan ilanları kaydetmek için |
| `tabs` | Sekme yönetimi için |
| `scripting` | Sayfa üzerinde script çalıştırmak için |
| `alarms` | Zamanlanmış görevler için |

---

## 👤 Geliştirici

**AydanGelenYolcu** — [@AydanGelenYolcu](https://github.com/AydanGelenYolcu)

---

## 📄 Lisans

Bu proje kişisel kullanım amaçlı geliştirilmiştir.
