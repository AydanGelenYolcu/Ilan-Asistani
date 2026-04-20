// ══════════════════════════════════════════════════════════════════════════════
// WİDGETS MODÜLÜ
// Döviz çevirici ve hesap makinesi widget'larını yönetir.
// Bağımlılık: Yok (chrome.storage API direkt kullanılır)
// ══════════════════════════════════════════════════════════════════════════════

const WidgetsModule = {

    init() {
        // Currency Widget
        const amountInp = document.getElementById('curAmount');
        const baseSel = document.getElementById('curBase');
        const targetSel = document.getElementById('curTarget');

        if (amountInp && baseSel && targetSel) {
            // Load settings
            chrome.storage.local.get(['widget_curSettings'], (res) => {
                if (res.widget_curSettings) {
                    baseSel.value = res.widget_curSettings.base;
                    targetSel.value = res.widget_curSettings.target;
                }
                WidgetsModule.updateCurrencyUI();
            });

            [amountInp, baseSel, targetSel].forEach(el => {
                el.addEventListener('input', () => {
                    chrome.storage.local.set({
                        widget_curSettings: { base: baseSel.value, target: targetSel.value }
                    });
                    WidgetsModule.updateCurrencyUI();
                });
            });

            // Swap Button Logic
            const btnSwap = document.getElementById('btnSwapCur');
            if (btnSwap) {
                btnSwap.addEventListener('click', () => {
                    const temp = baseSel.value;
                    baseSel.value = targetSel.value;
                    targetSel.value = temp;
                    chrome.storage.local.set({
                        widget_curSettings: { base: baseSel.value, target: targetSel.value }
                    });
                    WidgetsModule.updateCurrencyUI();
                });
            }
        }

        // Calculator Widget
        const calcInp = document.getElementById('calcInput');
        const calcRes = document.getElementById('calcResult');

        if (calcInp && calcRes) {
            calcInp.addEventListener('input', () => {
                const val = calcInp.value;
                if (!val.trim()) {
                    calcRes.innerText = "0";
                    return;
                }
                calcRes.innerText = WidgetsModule.smartCalc(val);
            });
        }
    },

    updateCurrencyUI() {
        const amount = parseFloat(document.getElementById('curAmount').value) || 0;
        const base = document.getElementById('curBase').value;
        const target = document.getElementById('curTarget').value;
        const resEl = document.getElementById('curResult');
        const updateEl = document.getElementById('curUpdate');

        if (!resEl) return;

        chrome.storage.local.get(['exchangeRate'], (res) => {
            const rateData = res.exchangeRate;
            if (!rateData || !rateData.allRates) {
                resEl.innerText = "Yükleniyor...";
                return;
            }

            const rates = rateData.allRates;
            // Rate(Base -> Target) = R[Target] / R[Base] (Pivot is TRY)
            const baseInTry = rates[base] || (base === 'TRY' ? 1 : null);
            const targetInTry = rates[target] || (target === 'TRY' ? 1 : null);

            if (baseInTry && targetInTry) {
                const crossRate = targetInTry / baseInTry;
                const converted = (amount * crossRate).toLocaleString('tr-TR', { maximumFractionDigits: 2 });
                resEl.innerText = `${converted} ${target}`;

                if (updateEl) {
                    const date = new Date(rateData.timestamp).getHours() + ":" +
                        String(new Date(rateData.timestamp).getMinutes()).padStart(2, '0');
                    updateEl.innerText = date;
                }
            } else {
                resEl.innerText = "Hata!";
            }
        });
    },

    smartCalc(str) {
        try {
            let eq = str.replace(/,/g, '.');
            // "1000 + 10%" → "1000 * (1 + 10/100)"
            eq = eq.replace(/(\d+(?:\.\d+)?)\s*([+-])\s*(\d+(?:\.\d+)?)\s*%/g, "($1*(1 $2 ($3/100)))");
            // Genel "%" → "/100"
            eq = eq.replace(/%/g, "/100");

            const result = WidgetsModule.safeMathEval(eq);
            if (result === null || isNaN(result) || !isFinite(result)) return "Hata";
            return Number(result.toFixed(4)).toString().replace('.', ',');
        } catch (e) {
            return "Hata";
        }
    },

    safeMathEval(str) {
        let s = str.replace(/\s+/g, '');

        // Parantez dengesi kontrolü
        const openCount = (s.match(/\(/g) || []).length;
        const closeCount = (s.match(/\)/g) || []).length;
        if (openCount !== closeCount) return null;

        // Parantezleri çöz
        let lastS = "";
        while (s.includes('(') && s !== lastS) {
            lastS = s;
            s = s.replace(/\(([^()]+)\)/g, (m, g) => {
                const nested = WidgetsModule.safeMathEval(g);
                return nested !== null ? nested : "0";
            });
        }

        const solveBasic = (expr) => {
            expr = expr.replace(/\+\-/g, '-').replace(/\-\+/g, '-')
                       .replace(/\-\-/g, '+').replace(/\+\+/g, '+');

            let parts = expr.split(/(\+|-)/);
            for (let i = 0; i < parts.length; i++) {
                if (parts[i] !== '+' && parts[i] !== '-' && parts[i] !== "") {
                    let subParts = String(parts[i]).split(/(\*|\/)/);
                    let acc = parseFloat(subParts[0]);
                    for (let j = 1; j < subParts.length; j += 2) {
                        let op = subParts[j];
                        let val = parseFloat(subParts[j + 1]);
                        if (op === '*') acc *= val;
                        if (op === '/') acc /= val;
                    }
                    parts[i] = acc;
                }
            }

            let res = 0;
            let currentOp = '+';
            for (let i = 0; i < parts.length; i++) {
                if (parts[i] === '+' || parts[i] === '-') {
                    currentOp = parts[i];
                } else if (parts[i] !== "") {
                    let val = parseFloat(parts[i]);
                    if (currentOp === '+') res += val;
                    if (currentOp === '-') res -= val;
                }
            }
            return res;
        };

        try {
            return solveBasic(s);
        } catch (e) {
            return null;
        }
    }
};

// Backward compat: eski çağrılar için global alias
function initWidgets() { WidgetsModule.init(); }
