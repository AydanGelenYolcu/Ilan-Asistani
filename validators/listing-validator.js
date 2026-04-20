/**
 * ListingValidator — Veri doğrulama katmanı.
 * Guard Clause mantığıyla verileri kontrol eder,
 * hataları ve uyarıları raporlar, gerekirse otomatik düzeltme yapar.
 */
const ListingValidator = {

    /**
     * Ham scrape verisini doğrular.
     * @param {object} data — { title, price, brut, net, aidat, ... }
     * @returns {{ isValid: boolean, errors: string[], warnings: string[], data: object }}
     */
    validate(data) {
        const errors = [];
        const warnings = [];

        // Guard: Başlık zorunlu
        if (!data.title) {
            errors.push('Başlık bulunamadı');
        }

        // Guard: Bireysel İlan Engelleme (Yeni Talep)
        if (data.isIndividual) {
            errors.push('Sadece emlak ofisi ilanları kaydedilebilir');
        }

        // Guard: Fiyat kontrolleri
        if (data.price < 0) {
            errors.push('Fiyat negatif olamaz');
            data.price = 0;
        }
        if (data.price > 1_000_000_000) {
            warnings.push('Fiyat çok yüksek (>1 Milyar TL), kontrol edin');
        }

        // Guard: Alan kontrolleri
        if (data.brut < 0) {
            errors.push('Brüt m² negatif olamaz');
            data.brut = 0;
        }
        if (data.net < 0) {
            errors.push('Net m² negatif olamaz');
            data.net = 0;
        }
        if (data.brut > 10000) {
            warnings.push('Brüt m² 10.000\'den büyük, olağandışı');
        }

        // Guard: Fizik kuralı — Net asla Brüt'ten büyük olamaz
        if (data.net > 0 && data.brut > 0 && data.net > data.brut) {
            warnings.push('Net > Brüt tespit edildi, otomatik düzeltildi');
            [data.brut, data.net] = [data.net, data.brut];
        }

        // Guard: Aidat kontrolleri
        if (data.aidat < 0) {
            errors.push('Aidat negatif olamaz');
            data.aidat = 0;
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings,
            data
        };
    }
};
