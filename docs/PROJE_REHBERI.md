# Sahibinden İlan Asistanı - Proje Rehberi ve Mimari Dokümantasyon

Bu belge, "Sahibinden İlan Asistanı" projesinin dosya yapısını, hangi dosyanın ne işe yaradığını ve sistemin nasıl çalıştığını teknik ama anlaşılır bir dille açıklar.

## 📂 Genel Klasör Yapısı

Proje, sürdürülebilirlik ve kolay geliştirilebilirlik için **Modüler Mikro-Mimari (Separation of Concerns)** prensibiyle tasarlanmıştır.

### 1. `scrapers/` (Veri Toplama Katmanı)
Bu klasör, hedef web sayfalarından ham verilerin çekilmesini yönetir.
- **`base-scraper.js`**: Tüm scraper'lar için ortak fonksiyonları içeren temel sınıf.
- **`sahibinden-scraper.js`**: Sahibinden.com'a özel tekniklerin (breadcrump analizi, ilan detayı okuma) bulunduğu scraper.
- **`hepsiemlak-scraper.js`**: hepsiemlak.com'a özel scraper. `Brüt / Net M2` alanını `m[²2]?` regex'iyle ayrıştırır — hem `m²` (süperskript) hem `m2` (rakam) formatını destekler. Aidat tablodan okunamıyorsa açıklama metninde fallback arama yapar.
- **`scraper-factory.js`**: Sayfaya göre hangi scraper'ın kullanılacağına karar veren "Fabrika" mekanizması.

### 2. `parsers/` (Veri Ayrıştırma Katmanı)
Web'den gelen "kirli" metinleri temiz matematiksel verilere dönüştürür.
- **`area-parser.js`**: Metin içindeki m² bilgilerini (Net/Brüt) bulan ve Regex ile temizleyen motor.
- **`currency-parser.js`**: Fiyat ve kur bilgilerini standardize eden algoritma.

### 3. `validators/` (Kalite ve Güvenlik Katmanı)
Verilerin doğruluğunu ve güvenliğini denetleyen emniyet kilitleridir.
- **`listing-validator.js`**: **Guard Clause** yapısıyla verileri kontrol eder:
    - **Fizik Denetimi**: Net m²'nin Brüt'ten büyük olması durumunda otomatik düzeltme yapar.
    - **Uç Değer (Outlier) Tespiti**: Fiyat > 1 Milyar TL veya Alan > 10.000 m² gibi anormal durumlarda uyarı verir.
    - **Kaynak Filtresi**: Sadece emlak ofisi ilanlarını kabul eder, bireysel ilanları (isteğe bağlı) engeller.
    - **Mükerrer Kayıt**: Aynı ilanın tekrar kaydedilmesini önler.

### 4. `utils/` (Yardımcı Araçlar)
Sistemin genelinde kullanılan, tekrar eden işleri kolaylaştıran yardımcı modüllerdir.
- **`dom-helpers.js`**: Sayfa üzerindeki tüm görsel etkileşimleri yönetir. Dashboard butonu, tabloların satırları ve popup pencerelerinin arayüzleri bu yardımcı ile oluşturulur. Ayrıca **URL Normalization** (link temizleme) işlemi burada yapılır.
- **`storage-manager.js`**: Verilerin **chrome.storage.local** üzerinde kalıcı ve güvenli saklanmasını sağlar. Mükerrer kayıt kontrolünü temizlenmiş (normalized) URL'ler üzerinden yaparak veri bütünlüğünü korur.

### 5. `map/` (Coğrafi Analiz Katmanı)
Harita tabanlı işlemlerden sorumludur.
- **`map-scraper.js`**: Harita sayfasındaki ilanların detaylarını çeker. En güncel sürümde **Meta Tag (og:price:amount)** analizini önceliklendirerek en kararlı fiyat verisine ulaşır.
- **`map-drag-handler.js`**: Harita sürüklendiğinde veya büyütüldüğünde yeni ilanların otomatik olarak taranmasını ve panele sürüklenebilir olmasını sağlar.

---

## 📄 Temel Dosyalar (Kök Dizin)

- **`manifest.json`**: Uzantının kimlik kartıdır. İzinleri ve projenin başlangıç noktalarını tanımlar. v4.0 itibarıyla `tabs`, `scripting`, `offscreen` izinleri ve `sim.csb.gov.tr` host izni eklenmiştir.
- **`background.js`**: Tarayıcı arkasında çalışan servis worker. Sekmeler arası iletişimi yönetir; döviz kuru güncellemelerinin yanı sıra hava kalitesi modülünden gelen mesajları (`HAVA_PROGRESS`, `HAVA_DONE`, `HAVA_RETRY_START` vb.) dashboard sekmesine ileten köprü görevi görür. `HAVA_TYPES` dizisine yeni mesaj tipleri eklenerek genişletilebilir.
- **`content.js`**: Doğrudan web sayfalarına (Sahibinden) enjekte olan ve kullanıcı arayüzünü (Dashboard butonunu) ekleyen kodlar.
- **`dashboard.html` & `dashboard.js`**: İki modüllü profesyonel yönetim paneli. **İlan Asistanı** sekmesinde ilan analizi ve Excel aktarımı; **Hava Kalitesi Analizi** sekmesinde hava kalitesi parametresi (PM10, SO2 vb.) veri çekimi, ilerleme takibi ve şehir bazlı raporlama yapılır.
- **`popup.html` & `popup.js`**: Uzantı ikonuna tıklandığında açılan hızlı ayarlar penceresi.
- **`styles.css`**: Tüm arayüzlerin görsel tasarımını sağlayan stil dosyası. Modül sekmeleri, progress bar ve log kutusu stilleri v4.0'da eklenmiştir.
- **`guide.html`**: Kullanıcıların uzantıyı nasıl kullanacağını anlatan interaktif rehber.

---

## 🌫️ Hava Kalitesi Modülü Dosyaları

Manifest V3'te content scriptleri doğrudan extension sayfalarına mesaj gönderemez. Bu kısıtı aşmak için özel bir **üç katmanlı köprü mimarisi** kullanılmaktadır.

### `hava_content.js`
- `dashboard.js` tarafından `chrome.scripting.executeScript` ile **MAIN world**'e inject edilir.
- MAIN world'de çalıştığı için sayfanın jQuery (`$`) ve Kendo UI widget'larına doğrudan erişebilir.
- sim.csb.gov.tr formundaki işlemleri otomatikleştirir:
    1. İstasyon grubunu (radio), şehri (Kendo MultiSelect) ve istasyonu (Kendo DropDownList) seçer.
    2. Veri periyodunu ve tarih aralığını (Kendo DateTimePicker) ayarlar.
    3. Seçilen parametreler için sorgu çalıştırır ve "Sorgula" butonuna basar.
    4. Kendo Grid'in 2. tablosunun **`dataBound` event'ini** dinleyerek veri hazır olduğu anda okur — yükleme maskesi polling'i yerine event-driven yaklaşım kullanılır (5 sn timeout, 7 sn poll fallback).
    5. Her istasyon sonucunu `window.postMessage` ile `hava_bridge.js`'e iletir.
- **Çift enjeksiyon koruması** (`window._havaScraperInitialized`) vardır.
- 9 Türkiye bölgesi (Akdeniz, Ege, Marmara, Doğu/Güney/Kuzey/Güney İç Anadolu, Karadeniz, Diğer) kapsamlı şekilde taranır.
- **NaN Retry Mekanizması**: Ana tarama döngüsü tamamlandıktan sonra tüm satırları `noData: true` dönen istasyonlar `_failedStations` dizisinde tutulur ve otomatik olarak yeniden sorgulanır. `HAVA_RETRY_START` mesajıyla dashboard bilgilendirilir.
- **Tab Freeze Önleme**: Chrome/Brave'in arka sekmeleri askıya almasını engellemek için üç katmanlı mekanizma kullanılır:
    1. **Exclusive Web Lock** (4 dakika yenilenen): `navigator.locks.request('hava-scraper-lock', {mode:'exclusive'}, ...)` — tarayıcı, aktif lock tutan sekmeyi uyutamaz.
    2. **`autoDiscardable: false`**: `chrome.tabs.update(tab.id, {autoDiscardable: false})` ile sekme bellek baskısında bile kapatılmaz.
    3. **Dashboard Ping**: `dashboard.js` açık sekmeye saniyede bir `HAVA_PING` mesajı gönderir; bu, background script'i uyanık tutar ve mesaj kanalını aktif kılar.

### `hava_bridge.js`
- **ISOLATED world**'e inject edilir (Manifest V3 varsayılan dünyası).
- `chrome.runtime` API'sine erişimi olan tek taraf budur — MAIN world'de `chrome.runtime` yoktur.
- İki yönlü köprü görevi görür:
    - **MAIN → chrome.runtime**: `hava_content.js`'in `window.postMessage({__havaFromMain: true, payload})` mesajlarını yakalayıp `chrome.runtime.sendMessage`'a çevirir.
    - **chrome.runtime → MAIN**: `dashboard.js`'in `chrome.tabs.sendMessage` ile gönderdiği `START_SCRAPING` / `STOP_SCRAPING` / `PAUSE_SCRAPING` / `RESUME_SCRAPING` komutlarını `window.postMessage({__havaToMain: true, payload})` ile MAIN world'e iletir.

### `dashboard/hava.js`
- Dashboard'daki Hava Kalitesi sekmesinin tüm UI mantığını içerir.
- **`_havaStartTabPing(tabId)` / `_havaStopTabPing()`**: Scraper sekmesine saniyede bir ping atar; freeze önleme zincirinin dashboard tarafıdır.
- **Retry görüntüleme**: `HAVA_RETRY_START` mesajı geldiğinde log'a bilgi yazar ve progress bar sıfırlanır. Retry satırları `findIndex` ile mevcut verinin üzerine yazılır (push yerine replace).
- **Log kutusu**: Tarama bittiğinde sadece progress bar ve `havaProgressText` gizlenir; `havaLogBox` ve section wrapper görünür kalır — kullanıcı tüm log kayıtlarını okuyabilir. Yeni analiz başladığında bar ve text yeniden gösterilir, log temizlenir.
- **Excel dinamik parametre**: `activeParam` fonksiyon başında alınır; dosya adı `hava_kalitesi_{param}_{tarih}.xlsx` formatında dinamik oluşturulur. Satırlarda parametre adı fallback olarak `r.ParameterText || r.paramName || activeParam` zinciri kullanılır.

### Mesaj Akışı

```
dashboard.js
  └─► chrome.tabs.sendMessage(START_SCRAPING)
        └─► hava_bridge.js (ISOLATED) ─► window.postMessage(__havaToMain)
              └─► hava_content.js (MAIN) ─► sorgu çalıştır
                    └─► window.postMessage(__havaFromMain, HAVA_PROGRESS / HAVA_RETRY_START / HAVA_DONE)
                          └─► hava_bridge.js (ISOLATED) ─► chrome.runtime.sendMessage
                                └─► background.js ─► chrome.tabs.sendMessage(dashboard)
                                      └─► dashboard.js ─► ilerleme güncelle / kaydet
```

---

## 🔄 İlan Asistanı Veri Akış Süreci
1. **Yakalama**: `content.js` sayfada bir ilan bulur.
2. **Toplama**: `scrapers/` katmanı veriyi çeker.
3. **Temizleme**: `parsers/` katmanı veriyi sayısal hale getirir.
4. **Denetim**: `validators/` katmanı hatasız olduğunu onaylar.
5. **Kayıt**: `storage-manager.js` veriyi bilgisayara kaydeder.
6. **Analiz**: `dashboard.js` verileri tablo ve istatistiklerle sunar.

## 🔄 Hava Kalitesi Veri Akış Süreci
1. **Başlatma**: Kullanıcı periyot ve tarih aralığı seçip "Analizi Başlat"a basar.
2. **Sekme Açma**: `dashboard.js`, `chrome.tabs.create` ile sim.csb.gov.tr'yi arka planda açar; `autoDiscardable: false` ve saniyede bir ping ile freeze önleme başlar.
3. **Script Enjeksiyonu**: Sayfa yüklenince önce `hava_bridge.js` (ISOLATED), ardından `hava_content.js` (MAIN) inject edilir.
4. **İstasyon Listesi**: `chrome.scripting.executeScript` ile Kendo widget'larından şehir ve istasyon listesi çekilir.
5. **Sorgulama**: Her istasyon için form doldurulur, seçilen parametre(ler) seçilir, `dataBound` event'i beklenerek sonuç okunur.
6. **Retry**: Ana döngü bitince NaN gelen istasyonlar otomatik yeniden sorgulanır (`HAVA_RETRY_START` → dashboard güncellenir).
7. **Mesaj Köprüsü**: Sonuçlar `postMessage → chrome.runtime → background → dashboard` zinciriyle iletilir.
8. **Kayıt & Rapor**: Tüm veriler `chrome.storage.local`'a yazılır; şehir tablosu ve parametre adı dinamik Excel oluşturulabilir.

**Bu yapı sayesinde sistem hem ilan analizi hem de çevre verisi toplamasını tek bir uzantıda, birbirinden bağımsız modüller olarak yönetebilmektedir.**
