# Plan: HepsiEmlak Entegrasyonu

## Context

İlan Asistanı v3, şu an yalnızca sahibinden.com'u destekliyor. Kullanıcı hepsiemlak.com ilanlarını da aynı extension üzerinden çekebilmek istiyor. Proje zaten Factory + Strategy Pattern kullandığından yeni platform eklemek minimum kod değişikliği gerektiriyor.

---

## Değiştirilecek / Oluşturulacak Dosyalar

| Dosya                            | İşlem                                           |
| -------------------------------- | ----------------------------------------------- |
| `scrapers/hepsiemlak-scraper.js` | YENİ — tüm kazıma mantığı burada                |
| `scrapers/scraper-factory.js`    | +1 satır: `register(new HepsiEmlakScraper())`   |
| `manifest.json`                  | host_permissions + content_scripts güncellemesi |

---

## HepsiEmlak Sayfa Yapısı (Araştırma Sonucu)

### Detay Sayfası URL Formatı

```
hepsiemlak.com/istanbul-esenyurt-yesilkent-satilik/daire/111753-1907
                                                          └── /\d+-\d+$/ ile tespil edilir
```

### CSS Seçicileri

| Alan            | Seçici                                      | Notlar                                     |
| --------------- | ------------------------------------------- | ------------------------------------------ |
| Başlık          | `h1.fontRB`                                 |                                            |
| Fiyat           | `.fz24-text.price`                          | "1.200.000 TL" → `DOMHelpers.clean()`      |
| Açıklama        | `.tab-content.det-block`                    |                                            |
| Özellik tablosu | `.adv-info-list .spec-item`                 | `th.txt` = anahtar, `td` = değer           |
| Danışman adı    | `.firm-card-detail .detail-sub:first-child` | "Mesleki Yeterlilik..." stringini çıkar    |
| Ofis adı        | `.firm-name`                                |                                            |
| Telefon         | `.owner-phone-numbers-list`                 |                                            |
| Fotoğraf        | `meta[property="og:image"]`                 | `DOMHelpers.getImageUrl()` generic çalışır |
| Widget hedefi   | `.detail-price-wrap`                        |                                            |

### Özellik Tablosundan Çekilen Alanlar

```
İlan Durumu  → "Satılık" / "Kiralık"
Konut Tipi   → "Daire", "Villa", ...
Brüt / Net M2 → "110 m2 \n / 100 m2"   ← regex ile ayrıştır
Eşya Durumu  → "Eşyalı" / "Eşyalı Değil"
```

---

## Uygulama Adımları

### 1. `scrapers/hepsiemlak-scraper.js` (YENİ DOSYA)

```
class HepsiEmlakScraper extends BaseScraper {
  constructor() {
    super({
      name: 'hepsiemlak',
      selectors: {
        title:        'h1.fontRB',
        description:  '.tab-content.det-block',
        price:        '.fz24-text.price',
        injectTarget: '.detail-price-wrap'
      }
    })
  }

  detect() {
    // Sadece detay sayfasında aktifleş (liste sayfasında değil)
    return window.location.hostname.includes('hepsiemlak.com')
        && /\/\d+-\d+$/.test(window.location.pathname);
  }

  async scrape() {
    // 1. Spec HashMap oluştur: th.txt → td
    const specMap = _buildSpecMap()   // private helper

    // 2. Temel alanlar
    title    = this.getTitle()
    price    = DOMHelpers.clean(this.getPrice())
    descText = this.getDescription()

    // 3. Alan (m²)
    // "110 m2 / 100 m2" → regex: /(\d+)\s*m²?\s*\/\s*(\d+)/i
    const brutNet = specMap['Brüt / Net M2'] || ''
    brut, net → ayrı regex gruplarıyla

    // AdvancedAreaParser fallback (sahibinden ile aynı mantık)

    // 4. Aidat
    // Spec'te yoksa description'dan _parseAidatFromDesc() ile (sahibinden'den miras)

    // 5. Durum
    const durumRaw = specMap['İlan Durumu'] || ''   // "Satılık"
    const tip      = specMap['Konut Tipi']  || ''   // "Daire"
    durum = `${durumRaw} ${tip}`.trim()              // "Satılık Daire"
    isSatilik / isKiralik → this.detectStatus()

    // 6. Eşyalı
    // Önce spec: "Eşyalı" → true, "Eşyalı Değil" → false
    // Sonra this.checkFurnished() fallback

    // 7. İletişim
    agentName  = .firm-card-detail .detail-sub:first-child (Mesleki... strip)
    officeName = .firm-name
    phones     = .owner-phone-numbers-list

    // 8. Corporate check
    isCorporate = !!document.querySelector('.firm-card')

    // 9. Dönüş — sahibinden ile aynı schema
    return { source:'', title, durum, price, brut, net, aidat,
             unitPrice, aidatM2, isTahmin, isSatilik, isFurnished,
             officeName, agentName, phones, isIndividual: !isCorporate,
             imageUrl: this.getImageUrl(),
             link: DOMHelpers.normalizeUrl(window.location.href) }
  }
}
```

### 2. `scrapers/scraper-factory.js`

Son satıra tek satır eklenir:

```js
ScraperFactory.register(new HepsiEmlakScraper());
```

### 3. `manifest.json`

**host_permissions** dizisine ekle:

```json
"*://www.hepsiemlak.com/*"
```

**content_scripts** — Mevcut bloğu düzenle, `matches` dizisine ekle:

```json
"*://www.hepsiemlak.com/*"
```

Ve JS dizisine sahibinden-scraper'dan önce hepsiemlak-scraper.js dosyasını ekle:

```json
"scrapers/hepsiemlak-scraper.js"
```

---

## Dikkat Edilecek Noktalar

- `Brüt / Net M2` field'ının değerinde **boşluk + `/`** var, regex temizliği gerekiyor.
- Telefon alanı `.owner-phone-numbers-list` içinde birden fazla numara olabilir; tüm metin alınıp trim edilecek.
- Aidat bu listede yoktu — açıklamadan parse edilecek (`_parseAidatFromDesc` sahibinden'deki gibi).
- `DOMHelpers.getImageUrl()` zaten `og:image` meta etiketini kullanıyor, hepsiemlak için özel bir şey yazmaya gerek yok.
- `map-scraper.js` şimdilik dokunulmayacak; sahibinden'e özel. HepsiEmlak harita desteği ayrı bir iş.

---

## Doğrulama

1. Extension'ı `chrome://extensions/` → "Yeniden Yükle"
2. Bir hepsiemlak ilan sayfasına git (ör. `...satilik/daire/111753-1907`)
3. "Veri Çek" butonunun görüntülendiğini doğrula
4. Butona bas → başlık, fiyat, brüt/net m², danışman adı, ofis adı, telefon alanlarının dolduğunu kontrol et
5. Dashboard'da yeni ilanın göründüğünü teyit et
