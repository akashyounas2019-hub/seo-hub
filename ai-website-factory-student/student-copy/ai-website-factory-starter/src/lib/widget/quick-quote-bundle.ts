/**
 * Quick-Quote widget — vanilla JS bundle served from your deployment.
 *
 * This file exports a single string `QUICK_QUOTE_BUNDLE_JS` containing the
 * full IIFE for the customer-facing booking widget. It is served by the
 * Next.js route at /widget/v1/quick-quote.js (Cache-Control: 60s).
 *
 * Embedded on every customer WordPress site via a thin plugin loader that
 * places `<div data-gyl-mount="quick-quote" data-site-slug=".." data-plugin-rest=".." />`
 * and then requests this script. The widget mounts in-place, fetches its
 * brand/copy/chips config from the platform, and wires up the booking flow.
 *
 * Design goals:
 *   - NO build step, NO npm deps, NO frameworks. Pure browser JS.
 *   - Self-contained. Inlines its own CSS and i18n strings.
 *   - Defensive. Network failures fall back to sane English defaults.
 *   - Accessible. ARIA labels, keyboard nav, RTL for Arabic.
 *   - Small enough to live on the critical path (~50–60KB unminified).
 *
 * Maintained as a TypeScript string so we can serve it from a Next.js route
 * without managing a separate build artifact. Do not put unescaped backticks
 * inside the template — escape with \\` if needed.
 */

export const QUICK_QUOTE_BUNDLE_JS = String.raw`
(function () {
  'use strict';

  // ===========================================================================
  // Constants & defaults
  // ===========================================================================

  // Marker so we don't double-mount on the same node if the script runs twice.
  var MOUNTED_KEY = '__gylQqMounted';
  // Where the global stylesheet lives. We inject once per document.
  var STYLE_ID = 'gyl-qq-styles';
  // Default platform base if the embed div doesn't override it.
  var DEFAULT_PLATFORM_BASE = 'http://localhost:3001';
  // Request timeouts (ms). Keep these tight — we never want to block UX.
  var CONFIG_TIMEOUT = 4000;
  var PARSE_TIMEOUT = 5000;
  var SUBMIT_TIMEOUT = 15000;

  // -------- Default brand tokens. Overridden per-site by remote config. ------
  var DEFAULT_BRAND = {
    primary: '#1A1A1A',
    primaryFg: '#FBBF24',
    accent: '#FBBF24',
    surface: '#FEF8E7',
    text: '#1A1A1A',
    muted: '#4A4A4A',
    border: 'rgba(0,0,0,0.12)',
    radius: 14
  };

  // -------- Default chips. Legacy field names (pickup/dropoff) preserved for
  // schema compatibility; values encode common Dubai property + service pairs
  // so the widget makes sense on a cleaning-vertical site. Overridden per-site.
  var DEFAULT_CHIPS = [
    { label: 'Villa deep clean — Palm Jumeirah', pickup: 'Palm Jumeirah villa', dropoff: 'Deep clean' },
    { label: 'Apartment maintenance — Dubai Marina', pickup: 'Dubai Marina apartment', dropoff: 'Standard clean' },
    { label: 'Move-out clean — Downtown Dubai', pickup: 'Downtown Dubai apartment', dropoff: 'Move-out clean' },
    { label: 'Sofa & carpet — Emirates Hills', pickup: 'Emirates Hills villa', dropoff: 'Sofa + carpet clean' }
  ];

  // ===========================================================================
  // i18n string tables. ~12 strings per language * 10 languages.
  // These are inlined so a config fetch failure still renders correctly
  // in the user's preferred language. Keys mirror the config.copy shape.
  // ===========================================================================
  var I18N = {
    en: {
      available_now: 'AVAILABLE NOW',
      tagline: 'Same-day quotes',
      headline: 'Book in 30 seconds',
      subhead: "Speak it in plain English. We'll fill out the form for you.",
      placeholder: 'e.g. 3-bedroom villa in Palm Jumeirah, deep clean on May 28 at 9am',
      try_one: 'TRY ONE:',
      cta_continue: 'Continue',
      cta_submit: 'Get my quote',
      voice_booking: 'Voice Booking',
      footer: 'You may type or speak your request in plain English. We will complete the booking form for you.',
      fields: {
        pickup: 'Pickup location',
        dropoff: 'Drop-off location',
        datetime: 'Pickup date & time',
        passengers: 'Passengers',
        vehicle: 'Vehicle type',
        notes: 'Trip notes',
        name: 'Your name',
        phone: 'Mobile number',
        email: 'Email (optional)'
      },
      success_title: 'Quote received',
      success_body: "We'll text you a price within 5 minutes.",
      error_title: "Couldn't send",
      error_body: 'Please try again or call us.',
      your_request: 'Your request',
      listening: 'Listening...',
      try_again: 'Try again',
      reference: 'Reference'
    },

    fr: {
      available_now: 'DISPONIBLE MAINTENANT',
      tagline: 'Devis le jour même',
      headline: 'Réservez en 30 secondes',
      subhead: "Décrivez votre course en français simple. Nous remplissons le formulaire pour vous.",
      placeholder: 'ex. Villa 3 chambres à Palm Jumeirah, nettoyage en profondeur le 28 mai à 9h',
      try_one: 'ESSAYEZ :',
      cta_continue: 'Continuer',
      cta_submit: 'Obtenir mon prix',
      voice_booking: 'Réservation vocale',
      footer: 'Vous pouvez taper ou dicter votre demande en langage naturel. Nous remplirons le formulaire pour vous.',
      fields: {
        pickup: 'Lieu de prise en charge',
        dropoff: 'Lieu de dépose',
        datetime: 'Date et heure',
        passengers: 'Passagers',
        vehicle: 'Type de véhicule',
        notes: 'Notes',
        name: 'Votre nom',
        phone: 'Numéro de mobile',
        email: 'Courriel (facultatif)'
      },
      success_title: 'Demande reçue',
      success_body: 'Nous vous enverrons un prix par SMS dans les 5 minutes.',
      error_title: "Envoi impossible",
      error_body: 'Veuillez réessayer ou nous appeler.',
      your_request: 'Votre demande',
      listening: 'Écoute en cours...',
      try_again: 'Réessayer',
      reference: 'Référence'
    },

    pa: {
      available_now: 'ਹੁਣੇ ਉਪਲਬਧ',
      tagline: 'ਉਸੇ ਦਿਨ ਕੋਟਸ',
      headline: '30 ਸਕਿੰਟਾਂ ਵਿੱਚ ਬੁਕ ਕਰੋ',
      subhead: 'ਆਪਣੀ ਭਾਸ਼ਾ ਵਿੱਚ ਦੱਸੋ। ਅਸੀਂ ਤੁਹਾਡੇ ਲਈ ਫਾਰਮ ਭਰ ਦੇਵਾਂਗੇ।',
      placeholder: 'ਉਦਾਹਰਨ ਲਈਂ ਡਾਉਨਟਾਉਨ ਟੋਰਾਂਟੋ ਤੋਂ ਪੀਅਰਸਨ 28 ਮਈ 5 ਵਜੇ, 3 ਲੋਕ',
      try_one: 'ਇਹ ਅਜ੍ਮਾਓ:',
      cta_continue: 'ਅਗਲਾ ਕਦਮ',
      cta_submit: 'ਮੇਰਾ ਕੋਟ ਪ੍ਰਾਪਤ ਕਰੋ',
      voice_booking: 'ਆਵਾਜ ਬੁਕਿੰਗ',
      footer: 'ਆਪਣੀ ਬੇਨਤੀ ਆਪ ਲਿਖ ਜਾਂ ਬੋਲ ਸਕਦੇ ਹੋ। ਅਸੀਂ ਬੁਕਿੰਗ ਫਾਰਮ ਪੂਰਾ ਕਰਾਂਗੇ।',
      fields: {
        pickup: 'ਪਿਕਅੱਪ ਟਿਕਾਣਾ',
        dropoff: 'ਉਤਾਰਨ ਵਾਲਾ ਟਿਕਾਣਾ',
        datetime: 'ਤਾਰੀਖ ਤੇ ਸਮਾਂ',
        passengers: 'ਯਾਤਰੀ',
        vehicle: 'ਵਾਹਨ ਦਾ ਕਿਸਮ',
        notes: 'ਨੋਟਸ',
        name: 'ਤੁਹਾਡਾ ਨਾਂ',
        phone: 'ਮੋਬਾਈਲ ਨੰਬਰ',
        email: 'ਈਮੇਲ (ਵਿਕਲਪਿਕ)'
      },
      success_title: 'ਬੇਨਤੀ ਪ੍ਰਾਪਤ',
      success_body: 'ਅਸੀਂ 5 ਮਿੰਟਾਂ ਵਿੱਚ ਤੁਹਾਨੂੰ ਕੀਮਤ ਦਾ SMS ਭੇਜਾਂਗੇ।',
      error_title: 'ਭੇਜਣ ਵਿੱਚ ਅਸਫਲਤਾ',
      error_body: 'ਕਿਰਪਾ ਕਰਕੇ ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼ ਕਰੋ ਜਾਂ ਸਾਨੂੰ ਕਾਲ ਕਰੋ।',
      your_request: 'ਤੁਹਾਡੀ ਬੇਨਤੀ',
      listening: 'ਸੁਣ ਰਹੇ ਹਾਂ...',
      try_again: 'ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼ ਕਰੋ',
      reference: 'ਹਵਾਲਾ ਨੰਬਰ'
    },

    zh: {
      available_now: '现在可预约',
      tagline: '当日报价',
      headline: '30 秒完成预订',
      subhead: '用中文说出你的需求，我们会自动填写表单。',
      placeholder: '例：5月28日下午5点从多伦多市中心到皮尔逊机场，3 人',
      try_one: '试试：',
      cta_continue: '继续',
      cta_submit: '获取报价',
      voice_booking: '语音预订',
      footer: '您可以输入或说出需求，我们会为您填写预订表单。',
      fields: {
        pickup: '上车地点',
        dropoff: '下车地点',
        datetime: '上车时间',
        passengers: '乘客人数',
        vehicle: '车辆类型',
        notes: '备注',
        name: '姓名',
        phone: '手机号码',
        email: '邮箱（可选）'
      },
      success_title: '预订已接收',
      success_body: '我们会在 5 分钟内发送报价短信。',
      error_title: '发送失败',
      error_body: '请重试或致电我们。',
      your_request: '您的需求',
      listening: '正在聘听...',
      try_again: '重试',
      reference: '参考号'
    },

    yue: {
      available_now: '現在可預約',
      tagline: '當日報價',
      headline: '30 秒完成預訂',
      subhead: '用廣東話講出你的需要，我哋幫你填表。',
      placeholder: '例：5月28號下晝 5 點多倫多市中心到皮爾遜機場，3 人',
      try_one: '試下：',
      cta_continue: '繼續',
      cta_submit: '拿報價',
      voice_booking: '語音預訂',
      footer: '您可以輸入或講出需要，我哋幫您填寫預訂表格。',
      fields: {
        pickup: '上車地點',
        dropoff: '下車地點',
        datetime: '上車時間',
        passengers: '乘客人數',
        vehicle: '車型',
        notes: '備註',
        name: '名字',
        phone: '手提電話',
        email: '電郵（可選）'
      },
      success_title: '已收到預訂',
      success_body: '我哋會在5分鐘內發報價 SMS 給你。',
      error_title: '送不到',
      error_body: '請再試或打電話來。',
      your_request: '你的需要',
      listening: '聆緊中...',
      try_again: '再試',
      reference: '參考號'
    },

    ar: {
      available_now: 'متاح الآن',
      tagline: 'عرض أسعار في نفس اليوم',
      headline: 'احجز خلال 30 ثانية',
      subhead: 'اكتب طلبك باللغة العربية البسيطة، وسنملأ النموذج لك.',
      placeholder: 'مثال، من وسط تورونتو إلى مطار بيرسون يوم 28 مايو الساعة 5 مساء، 3 ركاب',
      try_one: 'جرب واحدا:',
      cta_continue: 'متابعة',
      cta_submit: 'احصل على السعر',
      voice_booking: 'حجز صوتي',
      footer: 'يمكنك كتابة أو قول طلبك باللغة العربية. سنكمل الحجز عنك.',
      fields: {
        pickup: 'موقع الركوب',
        dropoff: 'موقع الوصول',
        datetime: 'تاريخ ووقت الركوب',
        passengers: 'الركاب',
        vehicle: 'نوع السيارة',
        notes: 'ملاحظات',
        name: 'الاسم',
        phone: 'رقم الجوال',
        email: 'البريد الإلكتروني (اختياري)'
      },
      success_title: 'تم استلام الطلب',
      success_body: 'سنرسل لك السعر عبر رسالة خلال 5 دقائق.',
      error_title: 'تعذّر الإرسال',
      error_body: 'يرجى المحاولة مرة أخرى أو الاتصال بنا.',
      your_request: 'طلبك',
      listening: 'جاري الاستماع...',
      try_again: 'إعادة المحاولة',
      reference: 'المرجع'
    },

    es: {
      available_now: 'DISPONIBLE AHORA',
      tagline: 'Cotización en el día',
      headline: 'Reserva en 30 segundos',
      subhead: 'Cuéntanoslo en español natural. Rellenaremos el formulario por ti.',
      placeholder: 'ej. Villa 3 dormitorios en Palm Jumeirah, limpieza a fondo el 28 de mayo a las 9am',
      try_one: 'PRUEBA:',
      cta_continue: 'Continuar',
      cta_submit: 'Obtener mi precio',
      voice_booking: 'Reserva por voz',
      footer: 'Puedes escribir o decir tu solicitud en lenguaje natural. Completaremos la reserva por ti.',
      fields: {
        pickup: 'Lugar de recogida',
        dropoff: 'Lugar de destino',
        datetime: 'Fecha y hora',
        passengers: 'Pasajeros',
        vehicle: 'Tipo de vehículo',
        notes: 'Notas',
        name: 'Tu nombre',
        phone: 'Móvil',
        email: 'Correo (opcional)'
      },
      success_title: 'Solicitud recibida',
      success_body: 'Te enviaremos el precio por SMS en menos de 5 minutos.',
      error_title: 'No se pudo enviar',
      error_body: 'Vuelve a intentarlo o llámanos.',
      your_request: 'Tu solicitud',
      listening: 'Escuchando...',
      try_again: 'Reintentar',
      reference: 'Referencia'
    },

    tl: {
      available_now: 'BUKAS NGAYON',
      tagline: 'Presyo sa parehong araw',
      headline: 'Mag-book sa loob ng 30 segundo',
      subhead: 'Sabihin sa simpleng salita. Pupunan namin ang form para sa’yo.',
      placeholder: 'hal. 3-kwartong villa sa Palm Jumeirah, malalim na paglilinis sa May 28 ng 9am',
      try_one: 'SUBUKAN:',
      cta_continue: 'Magpatuloy',
      cta_submit: 'Kunin ang presyo',
      voice_booking: 'Voice Booking',
      footer: 'Maaari kang mag-type o magsalita sa Tagalog. Kami ang gagawa ng booking form.',
      fields: {
        pickup: 'Pickup na lokasyon',
        dropoff: 'Drop-off na lokasyon',
        datetime: 'Petsa at oras',
        passengers: 'Pasahero',
        vehicle: 'Uri ng sasakyan',
        notes: 'Mga tala',
        name: 'Pangalan',
        phone: 'Mobile number',
        email: 'Email (opsyonal)'
      },
      success_title: 'Natanggap ang booking',
      success_body: 'I-te-text namin ang presyo sa loob ng 5 minuto.',
      error_title: 'Hindi naipadala',
      error_body: 'Subukan ulit o tawagan kami.',
      your_request: 'Iyong kahilingan',
      listening: 'Nakikinig...',
      try_again: 'Subukan ulit',
      reference: 'Reference'
    },

    it: {
      available_now: 'DISPONIBILE ORA',
      tagline: 'Preventivo in giornata',
      headline: 'Prenota in 30 secondi',
      subhead: "Dillo in italiano semplice. Compileremo noi il modulo per te.",
      placeholder: 'es. Villa 3 camere a Palm Jumeirah, pulizia profonda il 28 maggio alle 9',
      try_one: 'PROVA:',
      cta_continue: 'Continua',
      cta_submit: 'Ottieni il preventivo',
      voice_booking: 'Prenotazione vocale',
      footer: 'Puoi digitare o dettare la tua richiesta in italiano. Compileremo il modulo per te.',
      fields: {
        pickup: 'Punto di partenza',
        dropoff: 'Destinazione',
        datetime: 'Data e ora',
        passengers: 'Passeggeri',
        vehicle: 'Tipo di veicolo',
        notes: 'Note',
        name: 'Il tuo nome',
        phone: 'Numero di cellulare',
        email: 'Email (opzionale)'
      },
      success_title: 'Richiesta ricevuta',
      success_body: 'Ti invieremo il prezzo via SMS entro 5 minuti.',
      error_title: 'Invio non riuscito',
      error_body: 'Riprova o chiamaci.',
      your_request: 'La tua richiesta',
      listening: 'In ascolto...',
      try_again: 'Riprova',
      reference: 'Riferimento'
    },

    pt: {
      available_now: 'DISPONÍVEL AGORA',
      tagline: 'Orçamento no mesmo dia',
      headline: 'Reserve em 30 segundos',
      subhead: 'Fale em português simples. Nós preenchemos o formulário para você.',
      placeholder: 'ex. Villa de 3 quartos em Palm Jumeirah, limpeza profunda em 28 de maio às 9h',
      try_one: 'EXPERIMENTE:',
      cta_continue: 'Continuar',
      cta_submit: 'Receber orçamento',
      voice_booking: 'Reserva por voz',
      footer: 'Você pode digitar ou falar seu pedido em português. Nós preenchemos a reserva para você.',
      fields: {
        pickup: 'Local de partida',
        dropoff: 'Local de destino',
        datetime: 'Data e hora',
        passengers: 'Passageiros',
        vehicle: 'Tipo de veículo',
        notes: 'Observações',
        name: 'Seu nome',
        phone: 'Celular',
        email: 'E-mail (opcional)'
      },
      success_title: 'Pedido recebido',
      success_body: 'Enviaremos o preço por SMS em até 5 minutos.',
      error_title: 'Não foi possível enviar',
      error_body: 'Tente novamente ou ligue para nós.',
      your_request: 'Seu pedido',
      listening: 'Ouvindo...',
      try_again: 'Tentar de novo',
      reference: 'Referência'
    }
  };

  // Languages that need dir="rtl" on the widget root.
  var RTL_LANGS = { ar: true };

  // ===========================================================================
  // Tiny utility helpers
  // ===========================================================================

  // Build a DOM element with attrs and children. Keeps render code readable.
  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
        var v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'html') el.innerHTML = v;
        else if (k.indexOf('on') === 0 && typeof v === 'function') {
          el.addEventListener(k.slice(2).toLowerCase(), v);
        } else if (k === 'dataset' && typeof v === 'object') {
          for (var d in v) { el.dataset[d] = v[d]; }
        } else {
          el.setAttribute(k, v);
        }
      }
    }
    if (children) {
      var list = Array.isArray(children) ? children : [children];
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (c == null || c === false) continue;
        el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      }
    }
    return el;
  }

  // Deep-merge minimal: overlay onto base, returning base (mutates).
  // Used to layer remote config over local defaults.
  function mergeInto(base, overlay) {
    if (!overlay || typeof overlay !== 'object') return base;
    for (var k in overlay) {
      if (!Object.prototype.hasOwnProperty.call(overlay, k)) continue;
      var ov = overlay[k];
      if (ov && typeof ov === 'object' && !Array.isArray(ov) &&
          base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
        mergeInto(base[k], ov);
      } else if (ov !== undefined) {
        base[k] = ov;
      }
    }
    return base;
  }

  // Fetch with timeout via AbortController. Returns parsed JSON or throws.
  function fetchJson(url, opts, timeoutMs) {
    opts = opts || {};
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    if (ctrl) opts.signal = ctrl.signal;
    var t = setTimeout(function () { if (ctrl) ctrl.abort(); }, timeoutMs);
    return fetch(url, opts).then(function (r) {
      clearTimeout(t);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }, function (err) {
      clearTimeout(t);
      throw err;
    });
  }

  // Pick the best language for a widget: explicit > <html lang> > 'en'.
  function pickLanguage(configLang) {
    var available = Object.keys(I18N);
    function norm(l) {
      if (!l) return null;
      l = String(l).toLowerCase();
      if (I18N[l]) return l;
      var two = l.split('-')[0];
      if (I18N[two]) return two;
      // zh-HK -> yue (best-effort)
      if (l === 'zh-hk' || l === 'zh-tw' || l === 'zh-yue') return 'yue';
      if (two === 'zh') return 'zh';
      return null;
    }
    return norm(configLang) || norm(document.documentElement.lang) ||
           norm(navigator.language) || 'en';
  }

  // Generate a short reference code for the success state (fallback if
  // backend didn't return one). Not cryptographically meaningful.
  function shortRef() {
    return 'GYL-' + Math.random().toString(36).slice(2, 7).toUpperCase();
  }

  // ===========================================================================
  // CSS injection. Scoped under .gyl-qq to avoid leaking into themes.
  // ===========================================================================

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css = [
      '.gyl-qq { ',
      '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; ',
      '  color: var(--gyl-qq-text, #1A1A1A); ',
      '  background: var(--gyl-qq-surface, #FEF8E7); ',
      '  border-radius: var(--gyl-qq-radius, 14px); ',
      '  padding: 24px; ',
      '  box-shadow: 0 8px 32px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04); ',
      '  position: relative; ',
      '  box-sizing: border-box; ',
      '  width: 100%; ',
      '  max-width: 560px; ',
      '  margin: 0 auto; ',
      '  line-height: 1.5; ',
      '} ',
      '.gyl-qq *, .gyl-qq *::before, .gyl-qq *::after { box-sizing: border-box; } ',
      '.gyl-qq__topbar { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 8px; } ',
      '.gyl-qq__tagline { font-style: italic; font-size: 16px; color: var(--gyl-qq-accent, #FBBF24); margin: 0; } ',
      '.gyl-qq__avail { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; color: var(--gyl-qq-muted, #4A4A4A); white-space: nowrap; } ',
      '.gyl-qq__avail::before { content: ""; display: inline-block; width: 8px; height: 8px; background: #16a34a; border-radius: 999px; box-shadow: 0 0 0 3px rgba(22,163,74,0.18); } ',
      '.gyl-qq__h1 { font-size: 30px; line-height: 1.15; font-weight: 500; margin: 8px 0 6px; letter-spacing: -0.01em; } ',
      '.gyl-qq__sub { font-size: 14px; color: var(--gyl-qq-muted, #4A4A4A); margin: 0 0 18px; } ',
      '.gyl-qq__inputWrap { position: relative; display: flex; align-items: stretch; background: #fff; border: 1px solid var(--gyl-qq-border, rgba(0,0,0,0.12)); border-radius: 12px; transition: box-shadow 200ms ease, border-color 200ms ease; } ',
      '.gyl-qq__inputWrap:focus-within { border-color: var(--gyl-qq-accent, #FBBF24); box-shadow: 0 0 0 4px color-mix(in srgb, var(--gyl-qq-accent, #FBBF24) 25%, transparent); } ',
      '.gyl-qq__input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; padding: 14px 14px; font-size: 16px; font-family: inherit; color: inherit; } ',
      '.gyl-qq__mic { flex: 0 0 auto; width: 48px; border: 0; background: transparent; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; color: var(--gyl-qq-muted, #4A4A4A); transition: color 200ms ease, background 200ms ease; border-radius: 0 12px 12px 0; } ',
      '.gyl-qq[dir="rtl"] .gyl-qq__mic { border-radius: 12px 0 0 12px; } ',
      '.gyl-qq__mic:hover { color: var(--gyl-qq-text, #1A1A1A); background: rgba(0,0,0,0.03); } ',
      '.gyl-qq__mic[aria-pressed="true"] { color: #fff; background: #dc2626; animation: gyl-qq-pulse 1.2s ease-in-out infinite; } ',
      '@keyframes gyl-qq-pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(220,38,38,0.45); } 50% { box-shadow: 0 0 0 10px rgba(220,38,38,0); } } ',
      '.gyl-qq__tryLabel { font-size: 11px; letter-spacing: 0.1em; color: var(--gyl-qq-muted, #4A4A4A); font-weight: 600; margin: 16px 0 8px; } ',
      '.gyl-qq__chips { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 18px; } ',
      '.gyl-qq__chip { padding: 10px 12px; border-radius: 999px; border: 1px solid var(--gyl-qq-border, rgba(0,0,0,0.12)); background: #fff; cursor: pointer; font-size: 13px; font-family: inherit; color: inherit; text-align: left; transition: transform 200ms ease, box-shadow 200ms ease, border-color 200ms ease; } ',
      '.gyl-qq__chip:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.06); border-color: var(--gyl-qq-accent, #FBBF24); } ',
      '.gyl-qq__chip:focus-visible { outline: 2px solid var(--gyl-qq-accent, #FBBF24); outline-offset: 2px; } ',
      '.gyl-qq__cta { width: 100%; min-height: 48px; padding: 12px 16px; border: 0; border-radius: 12px; background: var(--gyl-qq-primary, #1A1A1A); color: var(--gyl-qq-primary-fg, #FBBF24); font-size: 16px; font-weight: 600; font-family: inherit; cursor: pointer; transition: transform 200ms ease, opacity 200ms ease, filter 200ms ease; display: inline-flex; align-items: center; justify-content: center; gap: 8px; } ',
      '.gyl-qq__cta:hover:not(:disabled) { filter: brightness(1.08); } ',
      '.gyl-qq__cta:active:not(:disabled) { transform: translateY(1px); } ',
      '.gyl-qq__cta:disabled { opacity: 0.6; cursor: progress; } ',
      '.gyl-qq__voice { display: inline-flex; align-items: center; gap: 6px; margin-top: 12px; font-size: 14px; color: var(--gyl-qq-accent, #FBBF24); background: transparent; border: 0; cursor: pointer; padding: 6px 0; font-family: inherit; } ',
      '.gyl-qq__voice:hover { text-decoration: underline; } ',
      '.gyl-qq__footer { font-size: 12px; color: var(--gyl-qq-muted, #4A4A4A); margin-top: 14px; } ',
      '.gyl-qq__spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid currentColor; border-right-color: transparent; border-radius: 999px; animation: gyl-qq-spin 0.8s linear infinite; } ',
      '@keyframes gyl-qq-spin { to { transform: rotate(360deg); } } ',
      '.gyl-qq__yourReq { margin: 4px 0 14px; padding: 10px 12px; background: rgba(0,0,0,0.04); border-radius: 10px; font-size: 13px; color: var(--gyl-qq-muted, #4A4A4A); } ',
      '.gyl-qq__yourReq strong { color: var(--gyl-qq-text, #1A1A1A); font-weight: 600; } ',
      '.gyl-qq__grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; } ',
      '@media (max-width: 600px) { .gyl-qq__grid { grid-template-columns: 1fr; } } ',
      '.gyl-qq__field { display: flex; flex-direction: column; gap: 4px; } ',
      '.gyl-qq__field--full { grid-column: 1 / -1; } ',
      '.gyl-qq__label { font-size: 12px; font-weight: 600; color: var(--gyl-qq-muted, #4A4A4A); } ',
      '.gyl-qq__tf { padding: 10px 12px; border-radius: 10px; border: 1px solid var(--gyl-qq-border, rgba(0,0,0,0.12)); background: #fff; font-size: 16px; font-family: inherit; color: inherit; transition: border-color 200ms ease, box-shadow 200ms ease; } ',
      '.gyl-qq__tf:focus { outline: 0; border-color: var(--gyl-qq-accent, #FBBF24); box-shadow: 0 0 0 4px color-mix(in srgb, var(--gyl-qq-accent, #FBBF24) 25%, transparent); } ',
      '.gyl-qq__success, .gyl-qq__error { padding: 16px; border-radius: 12px; margin-top: 8px; } ',
      '.gyl-qq__success { background: rgba(22,163,74,0.08); border: 1px solid rgba(22,163,74,0.25); } ',
      '.gyl-qq__error { background: rgba(220,38,38,0.06); border: 1px solid rgba(220,38,38,0.25); } ',
      '.gyl-qq__success h3, .gyl-qq__error h3 { margin: 0 0 6px; font-size: 18px; } ',
      '.gyl-qq__error h3 { color: #b91c1c; } ',
      '.gyl-qq__ref { display: inline-block; margin-top: 8px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; background: rgba(0,0,0,0.06); padding: 4px 8px; border-radius: 6px; } ',
      '.gyl-qq[dir="rtl"] { text-align: right; } ',
      '.gyl-qq[dir="rtl"] .gyl-qq__chip { text-align: right; } ',
      '@media (max-width: 600px) { .gyl-qq__h1 { font-size: 26px; } .gyl-qq__chips { grid-template-columns: 1fr; } } '
    ].join('');
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }

  // Per-site CSS overrides delivered via the widget config endpoint. This is
  // how we ship page-specific tweaks (e.g. "make the hero image a background
  // and hide the legacy form") without needing the WordPress editor or a
  // plugin reupload. The CSS is appended as a separate <style> tag scoped
  // to the site by id so a single page can host multiple widgets safely.
  function injectSiteCss(siteSlug, css) {
    if (!css || typeof css !== 'string') return;
    var id = 'gyl-qq-site-css-' + (siteSlug || 'default');
    var existing = document.getElementById(id);
    if (existing) {
      // Idempotent — replace contents on re-init.
      existing.textContent = css;
      return;
    }
    var style = document.createElement('style');
    style.id = id;
    style.setAttribute('data-gyl-site', siteSlug || 'default');
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }

  // ===========================================================================
  // SVG icons (inline so we don't need an icon font or extra request).
  // ===========================================================================

  function micIconSvg() {
    return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
           '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10a7 7 0 0 1-14 0"/><line x1="12" y1="19" x2="12" y2="22"/>' +
           '</svg>';
  }

  function arrowIconSvg() {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
           '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>' +
           '</svg>';
  }

  function chatIconSvg() {
    return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
           '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>' +
           '</svg>';
  }

  // ===========================================================================
  // The Widget class. One instance per mount div.
  // ===========================================================================

  function Widget(mount) {
    this.mount = mount;
    this.siteSlug = mount.getAttribute('data-site-slug') || '';
    this.platformBase = (mount.getAttribute('data-platform-base') || DEFAULT_PLATFORM_BASE).replace(/\/+$/, '');
    this.pluginRest = (mount.getAttribute('data-plugin-rest') || '').replace(/\/+$/, '');
    // Initial config falls back to English defaults until remote config loads.
    this.config = {
      siteSlug: this.siteSlug,
      brand: mergeInto({}, DEFAULT_BRAND),
      copy: mergeInto({}, I18N.en),
      chips: DEFAULT_CHIPS.slice(),
      language: 'en'
    };
    // Mutable state machine state.
    this.state = 'INITIAL';
    // Holds whatever the user typed/spoke in state A.
    this.rawText = '';
    // Holds structured fields once we move to state B.
    this.fields = { pickup: '', dropoff: '', datetime: '', passengers: '', vehicle: '', notes: '', name: '', phone: '', email: '' };
    // Cached SpeechRecognition instance, if available.
    this.recognition = null;
    this.listening = false;
    // For aborting in-flight submit on unmount.
    this._inflight = null;
  }

  // Kick off: fetch config, then render. Network failures still render.
  Widget.prototype.start = function () {
    var self = this;
    if (this.mount[MOUNTED_KEY]) return;
    this.mount[MOUNTED_KEY] = true;

    injectStyles();

    var url = this.platformBase + '/api/widget/v1/config/' + encodeURIComponent(this.siteSlug);
    fetchJson(url, { headers: { 'Accept': 'application/json' } }, CONFIG_TIMEOUT).then(function (cfg) {
      self._applyConfig(cfg);
      // Per-site CSS injection — used for things like hero background images
      // that can't reasonably be expressed via the brand-match palette.
      if (cfg && cfg.customCss) {
        injectSiteCss(self.siteSlug, cfg.customCss);
      }
      self.render();
    }, function () {
      // Fall back to defaults already in self.config — just render.
      self.render();
    });
  };

  // Merge remote config over our defaults and pick the right i18n table
  // (so any keys missing from remote are filled from the language pack).
  Widget.prototype._applyConfig = function (cfg) {
    if (!cfg || typeof cfg !== 'object') return;
    var lang = pickLanguage(cfg.language);
    var baseCopy = mergeInto({}, I18N[lang] || I18N.en);
    var merged = {
      siteSlug: cfg.siteSlug || this.siteSlug,
      brand: mergeInto(mergeInto({}, DEFAULT_BRAND), cfg.brand || {}),
      copy: mergeInto(baseCopy, cfg.copy || {}),
      chips: (cfg.chips && cfg.chips.length) ? cfg.chips : DEFAULT_CHIPS.slice(),
      language: lang,
      availableLanguages: cfg.availableLanguages || ['en']
    };
    this.config = merged;
  };

  // Apply brand tokens as CSS custom properties on the widget root.
  Widget.prototype._applyBrandVars = function (root) {
    var b = this.config.brand;
    root.style.setProperty('--gyl-qq-primary', b.primary);
    root.style.setProperty('--gyl-qq-primary-fg', b.primaryFg);
    root.style.setProperty('--gyl-qq-accent', b.accent);
    root.style.setProperty('--gyl-qq-surface', b.surface);
    root.style.setProperty('--gyl-qq-text', b.text);
    root.style.setProperty('--gyl-qq-muted', b.muted);
    root.style.setProperty('--gyl-qq-border', b.border);
    root.style.setProperty('--gyl-qq-radius', (typeof b.radius === 'number' ? b.radius + 'px' : b.radius));
  };

  // Master render: replaces mount contents with whatever state we're in.
  // Clearing and rebuilding from scratch is fine — this widget is small.
  Widget.prototype.render = function () {
    var root = h('div', {
      class: 'gyl-qq',
      role: 'region',
      'aria-label': 'Booking quote form',
      dir: RTL_LANGS[this.config.language] ? 'rtl' : 'ltr',
      lang: this.config.language
    });
    this._applyBrandVars(root);

    if (this.state === 'INITIAL') this._renderInitial(root);
    else if (this.state === 'EXPANDED' || this.state === 'SUBMITTING') this._renderExpanded(root);
    else if (this.state === 'SUCCESS') this._renderSuccess(root);
    else if (this.state === 'ERROR') this._renderError(root);

    // Replace mount contents (any server-rendered fallback) with this tree.
    this.mount.innerHTML = '';
    this.mount.appendChild(root);
    this.root = root;
  };

  // -------------------- State A: INITIAL ------------------------------------
  Widget.prototype._renderInitial = function (root) {
    var self = this;
    var c = this.config.copy;

    // Top bar: tagline (left) + availability pill (right).
    root.appendChild(h('div', { class: 'gyl-qq__topbar' }, [
      h('p', { class: 'gyl-qq__tagline' }, c.tagline),
      h('span', { class: 'gyl-qq__avail', 'aria-label': c.available_now }, c.available_now)
    ]));

    // Headline + subhead.
    root.appendChild(h('h1', { class: 'gyl-qq__h1' }, c.headline));
    root.appendChild(h('p', { class: 'gyl-qq__sub' }, c.subhead));

    // Smart input + mic.
    var input = h('input', {
      class: 'gyl-qq__input',
      type: 'text',
      placeholder: c.placeholder,
      'aria-label': c.placeholder,
      autocomplete: 'off',
      value: this.rawText || ''
    });
    input.addEventListener('input', function () { self.rawText = input.value; });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        self._onContinue();
      }
    });

    var micBtn = h('button', {
      class: 'gyl-qq__mic',
      type: 'button',
      'aria-label': c.voice_booking,
      'aria-pressed': 'false',
      html: micIconSvg()
    });

    // Hide mic if SpeechRecognition not supported.
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      micBtn.style.display = 'none';
    } else {
      micBtn.addEventListener('click', function () { self._toggleMic(input, micBtn); });
    }

    var inputWrap = h('div', { class: 'gyl-qq__inputWrap' }, [input, micBtn]);
    root.appendChild(inputWrap);

    // Try-one chips.
    root.appendChild(h('div', { class: 'gyl-qq__tryLabel' }, c.try_one));
    var chipsWrap = h('div', { class: 'gyl-qq__chips' });
    (this.config.chips || []).slice(0, 4).forEach(function (chip) {
      var btn = h('button', {
        class: 'gyl-qq__chip',
        type: 'button',
        'aria-label': chip.label
      }, '✨ ' + chip.label);
      btn.addEventListener('click', function () { self._onChip(chip); });
      chipsWrap.appendChild(btn);
    });
    root.appendChild(chipsWrap);

    // CONTINUE button.
    var ctaText = (c.cta_continue || 'Continue').toUpperCase();
    var cta = h('button', {
      class: 'gyl-qq__cta',
      type: 'button',
      'aria-label': ctaText
    });
    cta.appendChild(document.createTextNode(ctaText + '  '));
    var arrow = document.createElement('span');
    arrow.innerHTML = arrowIconSvg();
    cta.appendChild(arrow);
    cta.addEventListener('click', function () { self._onContinue(); });
    root.appendChild(cta);

    // Voice booking link.
    if (SR) {
      var voiceBtn = h('button', { class: 'gyl-qq__voice', type: 'button' });
      var icon = document.createElement('span');
      icon.innerHTML = chatIconSvg();
      voiceBtn.appendChild(icon);
      voiceBtn.appendChild(document.createTextNode(' ' + c.voice_booking));
      voiceBtn.addEventListener('click', function () { self._toggleMic(input, micBtn); input.focus(); });
      root.appendChild(voiceBtn);
    }

    // Footer note.
    root.appendChild(h('p', { class: 'gyl-qq__footer' }, c.footer));
  };

  // -------------------- State B: EXPANDED -----------------------------------
  Widget.prototype._renderExpanded = function (root) {
    var self = this;
    var c = this.config.copy;
    var f = c.fields || I18N.en.fields;

    root.appendChild(h('h2', { class: 'gyl-qq__h1', style: 'font-size:22px;margin-top:0;' }, c.headline));

    // Echo back the natural-language request if any.
    if (this.rawText) {
      var yr = h('div', { class: 'gyl-qq__yourReq' });
      yr.appendChild(h('strong', null, c.your_request + ': '));
      yr.appendChild(document.createTextNode(this.rawText));
      root.appendChild(yr);
    }

    // Helper to build a labelled input row.
    function field(name, label, type, full, value) {
      var inp = h('input', {
        class: 'gyl-qq__tf',
        type: type || 'text',
        id: 'gyl-qq-' + name,
        name: name,
        'aria-label': label,
        value: value || ''
      });
      inp.addEventListener('input', function () { self.fields[name] = inp.value; });
      return h('div', { class: 'gyl-qq__field' + (full ? ' gyl-qq__field--full' : '') }, [
        h('label', { class: 'gyl-qq__label', for: 'gyl-qq-' + name }, label),
        inp
      ]);
    }

    var grid = h('div', { class: 'gyl-qq__grid' }, [
      field('pickup', f.pickup, 'text', false, this.fields.pickup),
      field('dropoff', f.dropoff, 'text', false, this.fields.dropoff),
      field('datetime', f.datetime, 'text', false, this.fields.datetime),
      field('passengers', f.passengers, 'text', false, this.fields.passengers),
      field('vehicle', f.vehicle, 'text', true, this.fields.vehicle),
      field('name', f.name, 'text', false, this.fields.name),
      field('phone', f.phone, 'tel', false, this.fields.phone),
      field('email', f.email, 'email', true, this.fields.email),
      field('notes', f.notes, 'text', true, this.fields.notes)
    ]);
    root.appendChild(grid);

    var submitting = (this.state === 'SUBMITTING');
    var ctaText = (c.cta_submit || 'Get my quote');
    var cta = h('button', {
      class: 'gyl-qq__cta',
      type: 'button',
      disabled: submitting ? 'disabled' : null,
      'aria-label': ctaText
    });
    if (submitting) {
      var sp = document.createElement('span');
      sp.className = 'gyl-qq__spinner';
      cta.appendChild(sp);
      cta.appendChild(document.createTextNode(' ' + ctaText));
    } else {
      cta.appendChild(document.createTextNode(ctaText));
    }
    cta.addEventListener('click', function () { if (!submitting) self._onSubmit(); });
    root.appendChild(cta);

    root.appendChild(h('p', { class: 'gyl-qq__footer' }, c.footer));
  };

  // -------------------- State D: SUCCESS ------------------------------------
  Widget.prototype._renderSuccess = function (root) {
    var c = this.config.copy;
    var box = h('div', { class: 'gyl-qq__success', role: 'status', 'aria-live': 'polite' });
    box.appendChild(h('h3', null, '✓ ' + c.success_title));
    box.appendChild(h('p', null, c.success_body));
    if (this.lastRef) {
      var ref = h('div');
      ref.appendChild(document.createTextNode(c.reference + ': '));
      ref.appendChild(h('span', { class: 'gyl-qq__ref' }, this.lastRef));
      box.appendChild(ref);
    }
    root.appendChild(box);
  };

  // -------------------- State E: ERROR --------------------------------------
  Widget.prototype._renderError = function (root) {
    var self = this;
    var c = this.config.copy;
    var box = h('div', { class: 'gyl-qq__error', role: 'alert' });
    box.appendChild(h('h3', null, '⚠ ' + c.error_title));
    box.appendChild(h('p', null, this.lastError || c.error_body));
    var retry = h('button', { class: 'gyl-qq__cta', type: 'button', style: 'margin-top:10px;' }, c.try_again);
    retry.addEventListener('click', function () {
      self.state = 'EXPANDED';
      self.render();
    });
    box.appendChild(retry);
    root.appendChild(box);
  };

  // ===========================================================================
  // Event handlers / state transitions
  // ===========================================================================

  // Chip click: pre-fill pickup/dropoff and jump to expanded view.
  Widget.prototype._onChip = function (chip) {
    this.rawText = chip.label;
    this.fields.pickup = chip.pickup || '';
    this.fields.dropoff = chip.dropoff || '';
    this.state = 'EXPANDED';
    this.render();
  };

  // Continue from initial state. If there's text, try AI parse; otherwise
  // just expand with empty fields.
  Widget.prototype._onContinue = function () {
    var self = this;
    var text = (this.rawText || '').trim();
    if (!text) {
      this.state = 'EXPANDED';
      this.render();
      return;
    }
    // Call the WP plugin's /parse-quote endpoint — the plugin HMAC-signs the
    // request and forwards it to the platform's /api/public/parse-quote.
    // Calling the platform directly would fail because the platform requires
    // signed requests and the secret never leaves the WP host.
    var parseUrl = this.pluginRest + '/parse-quote';
    fetchJson(parseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ text: text, lang: this.config.language })
    }, PARSE_TIMEOUT).then(function (resp) {
      // Platform parse-quote returns { ok, parsed: { pickup_location, dropoff_location,
      // pickup_at_iso, passengers, vehicle_type, ... }, provider } — map the long
      // field names to the widget's short keys.
      if (resp && resp.ok && resp.parsed) {
        var p = resp.parsed;
        var mapped = {
          pickup: p.pickup_location || '',
          dropoff: p.dropoff_location || '',
          datetime: p.pickup_at_iso ? toLocalDateTimeInput(p.pickup_at_iso) : '',
          passengers: p.passengers != null ? String(p.passengers) : '',
          vehicle: p.vehicle_type || '',
          notes: p.message || '',
          name: p.customer_name || '',
          phone: p.customer_phone || '',
          email: p.customer_email || ''
        };
        // Only merge non-empty values so we don't overwrite existing fields.
        Object.keys(mapped).forEach(function (k) {
          if (mapped[k]) self.fields[k] = mapped[k];
        });
      }
      self.state = 'EXPANDED';
      self.render();
    }, function () {
      // Network/timeout/parse error — still expand so user can fill manually.
      self.state = 'EXPANDED';
      self.render();
    });
  };

  // Convert ISO-8601 ("2026-05-30T20:00:00.000Z") to a value the
  // <input type="datetime-local"> friendly format the user sees in fields
  // (YYYY-MM-DD HH:MM, no seconds, no timezone).
  function toLocalDateTimeInput(iso) {
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return '';
      var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
        ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    } catch (e) { return ''; }
  }

  // Submit from expanded view: POST to plugin REST, which signs+forwards.
  Widget.prototype._onSubmit = function () {
    var self = this;
    if (!this.pluginRest) {
      this.lastError = 'Plugin REST endpoint missing';
      this.state = 'ERROR';
      this.render();
      return;
    }
    this.state = 'SUBMITTING';
    this.render();

    // Plugin REST handler expects a flat trip payload (matches the legacy
    // shortcode form's submission shape). See:
    // wp-plugin/gyl-bookings/includes/class-rest.php#build_trip_payload
    // — pickup_location, dropoff_location, pickup_at etc. must be top-level.
    // Note: this.fields uses short keys (pickup, dropoff, datetime, name,
    // phone, email, notes, vehicle, passengers) — map to plugin field names.
    var f = this.fields || {};
    var combinedNotes = [this.rawText, f.notes].filter(Boolean).join(' — ');
    var payload = {
      trip_type: 'one_way',
      pickup_location: f.pickup || '',
      dropoff_location: f.dropoff || '',
      pickup_at: f.datetime || '',
      passengers: f.passengers ? parseInt(f.passengers, 10) || 1 : 1,
      luggage: 0,
      vehicle_type: f.vehicle || '',
      customer_name: f.name || '',
      customer_email: f.email || '',
      customer_phone: f.phone || '',
      message: combinedNotes,
      page_url: typeof window !== 'undefined' ? window.location.href : '',
      lang: this.config.language || 'en'
    };
    // Strip empty optional strings so the platform's zod .optional() doesn't reject
    Object.keys(payload).forEach(function (k) {
      if (payload[k] === '' || payload[k] === undefined || payload[k] === null) {
        delete payload[k];
      }
    });
    var url = this.pluginRest + '/quote';
    fetchJson(url, {
      method: 'POST',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload)
    }, SUBMIT_TIMEOUT).then(function (resp) {
      if (resp && resp.ok) {
        self.lastRef = resp.reference || shortRef();
        self.state = 'SUCCESS';
      } else {
        self.lastError = (resp && resp.message) ? resp.message : null;
        self.state = 'ERROR';
      }
      self.render();
    }, function (err) {
      self.lastError = (err && err.message) ? err.message : null;
      self.state = 'ERROR';
      self.render();
    });
  };

  // Speech recognition toggle. Safe no-op if API not supported.
  Widget.prototype._toggleMic = function (input, micBtn) {
    var self = this;
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    // If already listening, stop.
    if (this.listening && this.recognition) {
      try { this.recognition.stop(); } catch (e) { /* ignore */ }
      return;
    }

    var rec = new SR();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = this._speechLang();
    this.recognition = rec;

    rec.onstart = function () {
      self.listening = true;
      micBtn.setAttribute('aria-pressed', 'true');
    };
    rec.onresult = function (event) {
      var transcript = '';
      for (var i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      input.value = transcript;
      self.rawText = transcript;
    };
    rec.onerror = function () { /* swallow — don't break the form */ };
    rec.onend = function () {
      self.listening = false;
      micBtn.setAttribute('aria-pressed', 'false');
      // Focus the CTA so a tap submits.
      var cta = self.root && self.root.querySelector('.gyl-qq__cta');
      if (cta) cta.focus();
    };

    try { rec.start(); } catch (e) { /* harmless if already started */ }
  };

  // Map our short lang codes to BCP-47 for SpeechRecognition.
  Widget.prototype._speechLang = function () {
    switch (this.config.language) {
      case 'en': return 'en-CA';
      case 'fr': return 'fr-CA';
      case 'pa': return 'pa-IN';
      case 'zh': return 'zh-CN';
      case 'yue': return 'zh-HK';
      case 'ar': return 'ar-SA';
      case 'es': return 'es-ES';
      case 'tl': return 'fil-PH';
      case 'it': return 'it-IT';
      case 'pt': return 'pt-BR';
      default: return 'en-US';
    }
  };

  // ===========================================================================
  // Mount-on-load: find all data-gyl-mount divs and start a Widget for each.
  // ===========================================================================

  function boot() {
    var mounts = document.querySelectorAll('div[data-gyl-mount="quick-quote"]');
    for (var i = 0; i < mounts.length; i++) {
      try {
        var w = new Widget(mounts[i]);
        w.start();
      } catch (e) {
        // Never let one bad mount kill the others.
        if (window.console && console.error) console.error('[gyl-qq] mount failed', e);
      }
    }
  }

  // Support both fresh page loads and late-injected (SPA) script tags.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // Expose a tiny API so other scripts (or admin previews) can remount.
  window.GYLQuickQuote = window.GYLQuickQuote || {
    mount: boot,
    version: '1.0.0'
  };
})();
`;
