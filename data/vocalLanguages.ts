export interface VocalLanguageOption {
  value: string;
  key:
    | 'autoInstrumental'
    | 'vocalArabic'
    | 'vocalAzerbaijani'
    | 'vocalBulgarian'
    | 'vocalBengali'
    | 'vocalCatalan'
    | 'vocalCzech'
    | 'vocalDanish'
    | 'vocalGerman'
    | 'vocalGreek'
    | 'vocalEnglish'
    | 'vocalSpanish'
    | 'vocalPersian'
    | 'vocalFinnish'
    | 'vocalFrench'
    | 'vocalHebrew'
    | 'vocalHindi'
    | 'vocalCroatian'
    | 'vocalHaitianCreole'
    | 'vocalHungarian'
    | 'vocalIndonesian'
    | 'vocalIcelandic'
    | 'vocalItalian'
    | 'vocalJapanese'
    | 'vocalKorean'
    | 'vocalLatin'
    | 'vocalLithuanian'
    | 'vocalMalay'
    | 'vocalNepali'
    | 'vocalDutch'
    | 'vocalNorwegian'
    | 'vocalPunjabi'
    | 'vocalPolish'
    | 'vocalPortuguese'
    | 'vocalRomanian'
    | 'vocalRussian'
    | 'vocalSanskrit'
    | 'vocalSlovak'
    | 'vocalSerbian'
    | 'vocalSwedish'
    | 'vocalSwahili'
    | 'vocalTamil'
    | 'vocalTelugu'
    | 'vocalThai'
    | 'vocalTagalog'
    | 'vocalTurkish'
    | 'vocalUkrainian'
    | 'vocalUrdu'
    | 'vocalVietnamese'
    | 'vocalCantonese'
    | 'vocalChineseMandarin';
}

export const VOCAL_LANGUAGE_KEYS: VocalLanguageOption[] = [
  { value: 'unknown', key: 'autoInstrumental' },
  { value: 'ar', key: 'vocalArabic' },
  { value: 'az', key: 'vocalAzerbaijani' },
  { value: 'bg', key: 'vocalBulgarian' },
  { value: 'bn', key: 'vocalBengali' },
  { value: 'ca', key: 'vocalCatalan' },
  { value: 'cs', key: 'vocalCzech' },
  { value: 'da', key: 'vocalDanish' },
  { value: 'de', key: 'vocalGerman' },
  { value: 'el', key: 'vocalGreek' },
  { value: 'en', key: 'vocalEnglish' },
  { value: 'es', key: 'vocalSpanish' },
  { value: 'fa', key: 'vocalPersian' },
  { value: 'fi', key: 'vocalFinnish' },
  { value: 'fr', key: 'vocalFrench' },
  { value: 'he', key: 'vocalHebrew' },
  { value: 'hi', key: 'vocalHindi' },
  { value: 'hr', key: 'vocalCroatian' },
  { value: 'ht', key: 'vocalHaitianCreole' },
  { value: 'hu', key: 'vocalHungarian' },
  { value: 'id', key: 'vocalIndonesian' },
  { value: 'is', key: 'vocalIcelandic' },
  { value: 'it', key: 'vocalItalian' },
  { value: 'ja', key: 'vocalJapanese' },
  { value: 'ko', key: 'vocalKorean' },
  { value: 'la', key: 'vocalLatin' },
  { value: 'lt', key: 'vocalLithuanian' },
  { value: 'ms', key: 'vocalMalay' },
  { value: 'ne', key: 'vocalNepali' },
  { value: 'nl', key: 'vocalDutch' },
  { value: 'no', key: 'vocalNorwegian' },
  { value: 'pa', key: 'vocalPunjabi' },
  { value: 'pl', key: 'vocalPolish' },
  { value: 'pt', key: 'vocalPortuguese' },
  { value: 'ro', key: 'vocalRomanian' },
  { value: 'ru', key: 'vocalRussian' },
  { value: 'sa', key: 'vocalSanskrit' },
  { value: 'sk', key: 'vocalSlovak' },
  { value: 'sr', key: 'vocalSerbian' },
  { value: 'sv', key: 'vocalSwedish' },
  { value: 'sw', key: 'vocalSwahili' },
  { value: 'ta', key: 'vocalTamil' },
  { value: 'te', key: 'vocalTelugu' },
  { value: 'th', key: 'vocalThai' },
  { value: 'tl', key: 'vocalTagalog' },
  { value: 'tr', key: 'vocalTurkish' },
  { value: 'uk', key: 'vocalUkrainian' },
  { value: 'ur', key: 'vocalUrdu' },
  { value: 'vi', key: 'vocalVietnamese' },
  { value: 'yue', key: 'vocalCantonese' },
  { value: 'zh', key: 'vocalChineseMandarin' },
];
