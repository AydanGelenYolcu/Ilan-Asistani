1. Sayfa URL Yapısı
https://www.sahibinden.com/haritada-emlak-arama/{kategori}/{il-ilce-semt}/{site-adı}/
  ?autoViewport=3
  &address_apartmentcomplex={siteID}
  &a103651={siteSubID}
Kategori URL Slug'ları (Örnekler)
URL SlugAçıklamakiralik-rezidansKiralık Rezidanssatilik-konutSatılık Konutkiralik-konutKiralık Konutkiralik-daireKiralık Daireis-yeriİş Yeri
Filtre URL Base'i
/haritada-emlak-arama/flt/?{parametreler}
Liste Görünümü URL'si
/arama/ara?{parametreler}

2. Kritik AJAX Endpoint'leri
🔑 A) Tüm Marker'ları Çek (Ana Endpoint)
GET /ajax/mapSearch/classified/markers?{parametreler}
Desteklenen Parametreler:
ParametreAçıklamaÖrnekcategoryİç kategori ID (URL'deki değil!)3518 (kiralik-rezidans)address_cityŞehir ID6 = Ankara, 34 = İstanbuladdress_districtİlçe ID385 = Yenimahalleaddress_townBelde/bucak ID64 = Batıkentaddress_quarterMahalle ID68579 = Cumhuriyet Mh.address_apartmentcomplexSite/Apartman kompleks ID143594 = Hittownaddress_apartmentComplex(Yukarıdakinin kopyası, ikisi de gönderilmeli)143594a103651Site alt filtre değeri1139073autoViewportOtomatik viewport (genellikle 3)3north / south / east / westBounding box koordinatları39.99, 39.96 vb.pagingOffsetSayfalama (varsayılan 0, maks 1000/sayfa)0, 1000price_min / price_maxFiyat aralığı TL20000a24_min / a24_maxm² Brüt aralığı50, 100a107889_min / a107889_maxm² Net aralığı45, 90dateİlan tarihi filtresi7days, 15days, 30days
Filtre Parametre ID → Değer Mapping'i:
ParametreFiltre AdıÖrnek Değera20Oda Sayısı38473 = 1+1a812Bina Yaşı1297865 = 5 yıla811Bulunduğu Kat40596 = 5. kata810Kat Sayısı97270 = 17 kata23Isıtma1133903 = Merkezi Pay Ölçera22Banyo Sayısı38505 = 1a118798Mutfak1277781 = Kapalıa106960Balkon1202732 = Vara116769Otopark1267191 = Açık Otoparka103713Eşyalıtruea98426Kullanım Durumu1119542 = Boşa115950Tapu Durumu1256869 = Kat Mülkiyetlia27Kimden38460 = Sahibinden
Response Yapısı:
json{
  "paging": {
    "pagingOffset": 0,
    "pagingSize": 1000,
    "totalResults": 11
  },
  "classifiedMarkers": [
    {
      "formattedPrice": "26 bin",
      "id": "1297283728",
      "lat": 39.979877,
      "lon": 32.66219,
      "url": "/ilan/emlak-konut-kiralik-...-{id}/detay"
    }
  ],
  "mapData": {
    "selectedLocationBoundingBox": {
      "east": 32.692972,
      "north": 39.99941,
      "south": 39.966059,
      "west": 32.655431
    },
    "boundarySummaries": [...],
    "quarterIdsOfSelectedDistrict": [...]
  },
  "formData": { "category": ["3518"], ... },
  "categoryFacets": [...],
  "realEstateProjects": [...],
  "selectedFilters": [...]
}
```

> ⚠️ **Önemli:** `classifiedMarkers` listesinde sadece konum + fiyat gelir. Detay için aşağıdaki endpoint kullanılır. Sayfa başına maks **1000 marker** döner. `totalResults` 1000'den büyükse bbox'u bölerek (grid) ilerlemek gerekir.

---

### B) Tekil Marker Detayı
```
GET /ajax/mapSearch/classified/markers/{classifiedId}
Response (tam yapı — test edildi):
json{
  "id": "1298338463",
  "title": "SAHİBİNDEN HITTOWN SİTESİ 1+1.5 BAĞIMSIZ MUTFAK 5.KAT BALKONLU",
  "shortName": "emlak-konut-kiralik-sahibinden-hittown-sitesi-...-1298338463",
  "url": "/ilan/emlak-konut-kiralik-...-1298338463/detay",
  "price": 38000,
  "formattedPrice": "38 bin",
  "priceRange": null,
  "lat": 39.97995,
  "lon": 32.662155,
  "location": "Cumhuriyet Mh.",
  "thumbnailUrl": "https://i0.shbdn.com/photos/33/84/63/lthmb_1298338463ugz.avif",
  "attributes": {
    "Bulunduğu Kat": "5",
    "Oda Sayısı": "1+1",
    "m² (Brüt)": "70"
  },
  "projectId": null,
  "projectSummary": null,
  "storeBadgeUrl": null,
  "activePromotions": [4, 8, 1],
  "inPerFloorCategory": false,
  "hasTopListPromotion": false
}
```

---

### C) Diğer Yardımcı Endpoint'ler
```
GET /ajax/search/facets?category={id}&address_city={id}     → Detaylı arama formu HTML'i
GET /ajax/poi/category                                       → Harita katmanları (Ulaşım, Eğitim vb.)
GET /ajax/mapSearch/mapData?version={timestamp}&{params}    → Harita meta verisi
GET /ajax/boundary/{type}/{id}                               → Sınır poligon verisi (type: City/Town/District/Quarter)
GET /ajax/location/search?query={text}                       → Konum arama autocomplete
```

---

## 3. İlan Detay URL Şeması
```
/ilan/{shortName}-{id}/detay
```
Örnek: `/ilan/emlak-konut-kiralik-sahibinden-hittown-sitesi-1-plus1.5-bagimsiz-mutfak-5.kat-balkonlu-1298338463/detay`

---

## 4. Adres Hiyerarşisi ve ID Sistemi
```
address_city     → Şehir     (6 = Ankara)
address_district → İlçe      (385 = Yenimahalle)
address_town     → Belde     (64 = Batıkent)
address_quarter  → Mahalle   (68579 = Cumhuriyet Mh.)
address_apartmentcomplex → Site (143594 = Hittown)

5. Harita Modu Sabitleri (MapMode)
jsMapMode = {
  NORMAL: "NORMAL",          // Normal harita araması
  BOUNDING_BOX: "BOUNDING_BOX",  // Kuzey/Güney/Doğu/Batı ile dikdörtgen
  POLYGON: "POLYGON",         // Çizilen poligon ile arama
  POI_POLYGON: "POI_POLYGON"  // POI poligon araması
}

6. Harita Scraping Stratejisi Önerileri
Senaryo 1 — Belirli Site/Mahalle:
/ajax/mapSearch/classified/markers?category=3518&address_quarter=68579&address_apartmentcomplex=143594&...
Senaryo 2 — Bounding Box ile Alan Tarama:
/ajax/mapSearch/classified/markers?category={id}&north={n}&south={s}&east={e}&west={w}
Toplam 1000'den fazla ilan varsa bbox'u ızgara şeklinde parçalara bölüp her parça için ayrı istek at.
Senaryo 3 — İl bazında tüm ilan:
/ajax/mapSearch/classified/markers?category={id}&address_city={cityId} ile başla, bölgeyi bbox ile daralt.

7. JavaScript Kütüphaneleri & Dosyalar

https://s0.shbdn.com/assets/mapSearch:{hash}.js — Tüm harita arama mantığı
window.mapParams — Aktif sayfa için kategori, filtreler, URL
window.SahibindenCfg — Site konfigürasyonu ve AJAX base URL'leri


Özetle: harita scraping için ana GET /ajax/mapSearch/classified/markers endpoint'i merkezi nokta. Marker listesinden ID alıp, /ajax/mapSearch/classified/markers/{id} ile detay, /ilan/{slug}-{id}/detay ile tam ilan sayfasını çekebilirsiniz. Anti-bot olarak PerimeterX (PX) kullandığını da not edin.