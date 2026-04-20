/**
 * ScraperFactory — Doğru scraper'ı seçen fabrika (Factory Pattern).
 *
 * Yeni site eklemek için sadece:
 *   ScraperFactory.register(new EmlakjetScraper());
 * yazmanız yeterli.
 */
const ScraperFactory = {
    /** @type {BaseScraper[]} */
    _scrapers: [],

    /**
     * Yeni bir scraper kaydeder.
     * @param {BaseScraper} scraper
     */
    register(scraper) {
        this._scrapers.push(scraper);
    },

    /**
     * Mevcut URL'ye uygun scraper'ı döndürür.
     * @returns {BaseScraper|null}
     */
    detect() {
        return this._scrapers.find(s => s.detect()) || null;
    }
};

// ─── Tüm scraper'ları kaydet ───
ScraperFactory.register(new SahibindenScraper());
ScraperFactory.register(new HepsiEmlakScraper());
