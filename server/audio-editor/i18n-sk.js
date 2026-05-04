(function () {
  'use strict';

  var translations = {
    'AudioMass - Audio Editor': 'AudioMass - Editor zvuku',
    'AudioMass - About': 'AudioMass - O aplikácii',
    'Audio Editor': 'Editor zvuku',
    'About': 'O aplikácii',
    'File': 'Súbor',
    'Edit': 'Upraviť',
    'View': 'Zobraziť',
    'Effects': 'Efekty',
    'Help': 'Pomoc',
    'New': 'Nový',
    'Open': 'Otvoriť',
    'Load': 'Načítať',
    'Save': 'Uložiť',
    'Save As': 'Uložiť ako',
    'Export': 'Exportovať',
    'Export to mp3': 'Exportovať do MP3',
    'Exporting to mp3': 'Exportovanie do MP3',
    'Import': 'Importovať',
    'Close': 'Zavrieť',
    'Exit': 'Ukončiť',
    'Undo': 'Späť',
    'Redo': 'Znova',
    'Cut': 'Vystrihnúť',
    'Copy': 'Kopírovať',
    'Paste': 'Prilepiť',
    'Delete': 'Odstrániť',
    'Trim': 'Orezať',
    'Select': 'Vybrať',
    'Select All': 'Vybrať všetko',
    'Deselect': 'Zrušiť výber',
    'Play': 'Prehrať',
    'Pause': 'Pozastaviť',
    'Stop': 'Zastaviť',
    'Record': 'Nahrávať',
    'Recording Audio': 'Nahrávanie zvuku',
    'Zoom In': 'Priblížiť',
    'Zoom Out': 'Oddialiť',
    'Zoom Reset': 'Resetovať priblíženie',
    'Normalize': 'Normalizovať',
    'Normalization': 'Normalizácia',
    'Compressor': 'Kompresor',
    'Reverb': 'Reverb',
    'Delay': 'Delay',
    'Distortion': 'Skreslenie',
    'Pitch Shift': 'Zmena výšky tónu',
    'Fade In': 'Postupné zosilnenie',
    'Fade Out': 'Postupné zoslabenie',
    'Fade In/Out': 'Postupné zosilnenie/zoslabenie',
    'Invert': 'Invertovať',
    'Reverse': 'Obrátiť',
    'Volume': 'Hlasitosť',
    'Gain': 'Zisk',
    'Pan': 'Panoráma',
    'Balance': 'Vyváženie',
    'Speed': 'Rýchlosť',
    'Frequency': 'Frekvencia',
    'Quality': 'Kvalita',
    'Apply': 'Použiť',
    'Cancel': 'Zrušiť',
    'OK': 'OK',
    'Yes': 'Áno',
    'No': 'Nie',
    'Reset': 'Resetovať',
    'Preview': 'Náhľad',
    'Download': 'Stiahnuť',
    'Loading': 'Načítava sa',
    'Error': 'Chyba',
    'Warning': 'Upozornenie',
    'Settings': 'Nastavenia',
    'Options': 'Možnosti',
    'Duration': 'Trvanie',
    'Channels': 'Kanály',
    'Mono': 'Mono',
    'Stereo': 'Stereo',
    'Left': 'Ľavý',
    'Right': 'Pravý',
    'Start': 'Začiatok',
    'End': 'Koniec',
    'Name': 'Názov',
    'Size': 'Veľkosť',
    'Type': 'Typ',
    'Getting Started': 'Začíname',
    'Drag n drop Files!': 'Pretiahnite sem súbory!',
    'Welcome to AudioMass': 'Vitajte v AudioMass',
    'AudioMass is a free full-featured web-based audio & waveform editing tool': 'AudioMass je bezplatný webový editor zvuku a vlnovej formy',
    'AudioMass is a free full-featured web-based audio & waveform editing tool.': 'AudioMass je bezplatný webový editor zvuku a vlnovej formy.',
    'Introducing AudioMass': 'Predstavujeme AudioMass',
    'an open-source web based audio and waveform editing tool.': 'open-source webový editor zvuku a vlnovej formy.',
    'Loading Audio, navigating waveform, zoom and pan': 'Načítanie zvuku, navigácia vo vlnovej forme, priblíženie a posun',
    'Visualization of frequency levels': 'Vizualizácia frekvenčných úrovní',
    'Peak and distortion signaling': 'Signalizácia špičiek a skreslenia',
    'Cutting/Pasting/Trimming parts of audio': 'Vystrihovanie, vkladanie a orezávanie častí zvuku',
    'Inverting/Reversing Audio': 'Invertovanie a obracanie zvuku',
    'Modifying volume levels': 'Úprava hlasitosti',
    'Keeps track of states so you can undo mistakes': 'Sleduje históriu zmien, aby sa dali vrátiť chyby',
    'Offline support': 'Podpora offline režimu',
    'Record audio from your microphone': 'Nahrajte zvuk z mikrofónu',
    'Use the editor directly in your browser.': 'Editor môžete používať priamo v prehliadači.',
    'No installation required.': 'Bez inštalácie.',
    'Select a part of the waveform to edit it.': 'Vyberte časť vlnovej formy, ktorú chcete upraviť.',
    'Use the menu or keyboard shortcuts to apply edits and effects.': 'Na úpravy a efekty použite menu alebo klávesové skratky.',
    'Drop audio files here': 'Sem pretiahnite zvukové súbory',
    'Choose file': 'Vybrať súbor',
    'Open file': 'Otvoriť súbor',
    'Save file': 'Uložiť súbor',
    'Are you sure?': 'Naozaj?',
    'Are you sure you want to continue?': 'Naozaj chcete pokračovať?',
    'This action cannot be undone.': 'Táto akcia sa nedá vrátiť späť.',
    'No audio loaded.': 'Nie je načítaný žiadny zvuk.',
    'No selection.': 'Nič nie je vybrané.',
    'Please select an audio region first.': 'Najprv vyberte časť zvuku.',
    'Processing': 'Spracúva sa',
    'Processing...': 'Spracúva sa...',
    'Rendering': 'Renderuje sa',
    'Rendering...': 'Renderuje sa...',
    'Done': 'Hotovo',
    'Failed': 'Zlyhalo',
    'Unsupported file type': 'Nepodporovaný typ súboru',
    'Keyboard Shortcuts': 'Klávesové skratky',
    'Shortcuts': 'Skratky'
  };

  var skipSelector = 'script, style, pre, code, textarea, input, select';
  var translatedAttrNames = ['title', 'placeholder', 'aria-label', 'alt'];
  var observer = null;
  var translating = false;

  function clean(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function translateValue(value) {
    var valueString = String(value || '');
    var prefix = valueString.match(/^\s*/)[0];
    var suffix = valueString.match(/\s*$/)[0];
    var key = clean(valueString);
    return translations[key] ? prefix + translations[key] + suffix : value;
  }

  function shouldSkip(node) {
    var parent = node.nodeType === 1 ? node : node.parentElement;
    return !parent || Boolean(parent.closest(skipSelector));
  }

  function translateAttributes(element) {
    if (!element || shouldSkip(element)) return;

    translatedAttrNames.forEach(function (name) {
      if (!element.hasAttribute(name)) return;
      var current = element.getAttribute(name);
      var translated = translateValue(current);
      if (translated !== current) element.setAttribute(name, translated);
    });
  }

  function translateTextNode(node) {
    if (!node || shouldSkip(node)) return;

    var translated = translateValue(node.nodeValue);
    if (translated !== node.nodeValue) node.nodeValue = translated;
  }

  function translateSubtree(root) {
    var walker;
    var current;

    if (!root) return;

    if (root.nodeType === 3) {
      translateTextNode(root);
      return;
    }

    if (root.nodeType !== 1 || shouldSkip(root)) return;

    translateAttributes(root);

    walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode: function (node) {
        return shouldSkip(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
    });

    current = walker.currentNode;
    while (current) {
      if (current.nodeType === 1) translateAttributes(current);
      if (current.nodeType === 3) translateTextNode(current);
      current = walker.nextNode();
    }
  }

  function translateDocument() {
    if (translating) return;
    translating = true;

    document.documentElement.lang = 'sk';
    document.title = translateValue(document.title);
    translateSubtree(document.body);

    translating = false;
  }

  function observe() {
    if (!observer) return;
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: translatedAttrNames
    });
  }

  function scheduleTranslate(root) {
    if (!root) return;

    window.requestAnimationFrame(function () {
      if (observer) observer.disconnect();
      translateSubtree(root);
      observe();
    });
  }

  function start() {
    translateDocument();

    observer = new MutationObserver(function (mutations) {
      var target = document.body;
      var i;

      for (i = 0; i < mutations.length; i += 1) {
        if (mutations[i].target && mutations[i].target.nodeType === 1) {
          target = mutations[i].target;
          break;
        }
      }

      scheduleTranslate(target);
    });

    observe();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
}());
