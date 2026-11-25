/* Datele firmei pe paginile legale, dintr-un singur loc.
   Completează-le înainte de lansare (aceleași ca în aplicație, Setări → Date firmă). */
(function () {
  'use strict';
  var COMPANY = {
    name: null,      // ex. 'EuroVid SRL'
    cui: null,       // ex. 'RO12345678'
    regCom: null,    // ex. 'J29/1234/2026'
    address: null    // ex. 'Ploiești, Str. Exemplu 1, jud. Prahova'
  };
  function set(key, text) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-company="' + key + '"]'), function (el) {
      el.textContent = text;
    });
  }
  if (COMPANY.name) set('name', COMPANY.name);
  var ids = [COMPANY.cui && 'CUI ' + COMPANY.cui, COMPANY.regCom && 'Reg. Com. ' + COMPANY.regCom].filter(Boolean).join(', ');
  if (ids) set('ids', ', ' + ids);
  if (COMPANY.address) set('address', 'Sediul: ' + COMPANY.address);
})();
