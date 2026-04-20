/**
 * CurrencyParser — Döviz kuru okuma ve dönüştürme modülü.
 * Background.js'in güncellediği kur verisini okur ve TL→Döviz çevirisi yapar.
 */
const CurrencyParser = {

    /** Para birimi simgeleri */
    symbols: { USD: '$', EUR: '€', GBP: '£', JPY: '¥', TL: '₺' },

    /**
     * Storage'dan aktif para birimi ve kur bilgisini çeker.
     * @returns {Promise<{ targetCur: string, symbol: string, rate: number }>}
     */
    async getConversionData() {
        const settings = await StorageManager.get(['statsCurrency', 'exchangeRate']);
        const targetCur = settings.statsCurrency || 'USD';
        const rateData = settings.exchangeRate;
        const allRates = rateData ? rateData.allRates : null;
        const rate = (allRates && allRates[targetCur]) ? allRates[targetCur] : 0;

        return {
            targetCur,
            symbol: this.symbols[targetCur] || '$',
            rate
        };
    },

    /**
     * TL değerini hedef dövize çevirir (tam sayı).
     * @param {number} valueTL
     * @param {number} rate
     * @returns {string} — Boş string veya dönüştürülmüş değer
     */
    convert(valueTL, rate) {
        if (!rate || rate <= 0 || !valueTL || valueTL <= 0) return '';
        return (valueTL * rate).toFixed(0);
    },

    /**
     * TL değerini hedef dövize çevirir (ondalıklı — birim fiyat için).
     * @param {number} valueTL
     * @param {number} rate
     * @returns {string}
     */
    convertDecimal(valueTL, rate) {
        if (!rate || rate <= 0 || !valueTL || valueTL <= 0) return '';
        return (valueTL * rate).toFixed(2);
    }
};
