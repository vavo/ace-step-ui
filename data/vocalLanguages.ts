export interface VocalLanguageOption {
  value: string;
  key:
    | 'autoInstrumental'
    | 'vocalBulgarian'
    | 'vocalCatalan'
    | 'vocalCroatian'
    | 'vocalCzech'
    | 'vocalDanish'
    | 'vocalDutch'
    | 'vocalFinnish'
    | 'vocalFrench'
    | 'vocalGerman'
    | 'vocalGreek'
    | 'vocalHungarian'
    | 'vocalIcelandic'
    | 'vocalItalian'
    | 'vocalEnglish'
    | 'vocalSpanish'
    | 'vocalLatin'
    | 'vocalLithuanian'
    | 'vocalNorwegian'
    | 'vocalPolish'
    | 'vocalPortuguese'
    | 'vocalRomanian'
    | 'vocalSlovak'
    | 'vocalSerbian'
    | 'vocalSwedish'
    | 'vocalTurkish'
    | 'vocalUkrainian';
}

export const VOCAL_LANGUAGE_KEYS: VocalLanguageOption[] = [
  { value: 'unknown', key: 'autoInstrumental' },
  { value: 'sk', key: 'vocalSlovak' },
  { value: 'en', key: 'vocalEnglish' },
  { value: 'bg', key: 'vocalBulgarian' },
  { value: 'ca', key: 'vocalCatalan' },
  { value: 'hr', key: 'vocalCroatian' },
  { value: 'cs', key: 'vocalCzech' },
  { value: 'da', key: 'vocalDanish' },
  { value: 'nl', key: 'vocalDutch' },
  { value: 'fi', key: 'vocalFinnish' },
  { value: 'fr', key: 'vocalFrench' },
  { value: 'de', key: 'vocalGerman' },
  { value: 'el', key: 'vocalGreek' },
  { value: 'hu', key: 'vocalHungarian' },
  { value: 'is', key: 'vocalIcelandic' },
  { value: 'it', key: 'vocalItalian' },
  { value: 'la', key: 'vocalLatin' },
  { value: 'lt', key: 'vocalLithuanian' },
  { value: 'no', key: 'vocalNorwegian' },
  { value: 'pl', key: 'vocalPolish' },
  { value: 'pt', key: 'vocalPortuguese' },
  { value: 'ro', key: 'vocalRomanian' },
  { value: 'sr', key: 'vocalSerbian' },
  { value: 'es', key: 'vocalSpanish' },
  { value: 'sv', key: 'vocalSwedish' },
  { value: 'tr', key: 'vocalTurkish' },
  { value: 'uk', key: 'vocalUkrainian' },
];
