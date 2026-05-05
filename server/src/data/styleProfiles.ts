export type GenerationPreset = 'fast' | 'quality' | 'advanced';

export interface StyleProfile {
  id: string;
  label: string;
  aliases: string[];
  defaultBpm: number;
  bpmRange: [number, number];
  defaultKeyScale: string;
  timeSignature: string;
  instrumentation: string[];
  productionNotes: string[];
  avoid: string[];
  preferredPreset: GenerationPreset;
}

export const STYLE_PROFILES: StyleProfile[] = [
  {
    id: 'hard-techno',
    label: 'hard techno',
    aliases: ['hard techno', 'tvrde techno', 'tvrdé techno'],
    defaultBpm: 150,
    bpmRange: [140, 160],
    defaultKeyScale: 'F minor',
    timeSignature: '4',
    instrumentation: ['distorted industrial kick', 'rumble bass', 'rave stabs', 'metallic percussion'],
    productionNotes: ['relentless warehouse pressure', 'tight four-on-the-floor drive', 'minimal melodic clutter'],
    avoid: ['slow techno', 'chiptune', 'trap drums', 'accordion', 'meme effects'],
    preferredPreset: 'quality',
  },
  {
    id: 'techno',
    label: 'techno',
    aliases: ['techno', 'technov'],
    defaultBpm: 132,
    bpmRange: [124, 140],
    defaultKeyScale: 'A minor',
    timeSignature: '4',
    instrumentation: ['driving kick', 'rolling bassline', 'hypnotic synth sequence', 'club percussion'],
    productionNotes: ['steady warehouse groove', 'gradual filter movement', 'focused repetition'],
    avoid: ['pop-rock guitars', 'chiptune novelty', 'acoustic folk arrangement'],
    preferredPreset: 'quality',
  },
  {
    id: 'jungle',
    label: 'jungle / drum and bass',
    aliases: ['jungle', 'dnb', 'drum and bass', 'drum & bass'],
    defaultBpm: 170,
    bpmRange: [160, 176],
    defaultKeyScale: 'D minor',
    timeSignature: '4',
    instrumentation: ['fast chopped breakbeats', 'rolling sub-bass', 'syncopated percussion', 'atmospheric pads'],
    productionNotes: ['high-speed breakbeat energy', 'deep low-end movement', 'sharp rhythmic edits'],
    avoid: ['slow techno', 'trap hi-hat grid', 'chiptune lead focus', 'oom-pah rhythm'],
    preferredPreset: 'quality',
  },
  {
    id: 'house',
    label: 'house',
    aliases: ['house', 'housov'],
    defaultBpm: 124,
    bpmRange: [118, 128],
    defaultKeyScale: 'C minor',
    timeSignature: '4',
    instrumentation: ['four-on-the-floor kick', 'warm bassline', 'piano or synth chords', 'open hi-hats'],
    productionNotes: ['club-ready groove', 'clean sidechain pulse', 'uplifting but controlled arrangement'],
    avoid: ['metal guitars', 'blast beats', 'chiptune novelty'],
    preferredPreset: 'quality',
  },
  {
    id: 'trap',
    label: 'trap',
    aliases: ['trap', 'trapov'],
    defaultBpm: 140,
    bpmRange: [130, 150],
    defaultKeyScale: 'C# minor',
    timeSignature: '4',
    instrumentation: ['808 bass', 'sharp hi-hats', 'snappy snare', 'dark sparse synths'],
    productionNotes: ['half-time bounce', 'heavy low end', 'space for vocal rhythm'],
    avoid: ['rock drum kit dominance', 'folk accordion', 'jungle breakbeat chaos'],
    preferredPreset: 'quality',
  },
  {
    id: 'hip-hop',
    label: 'hip hop',
    aliases: ['hip hop', 'hip-hop', 'rap', 'rapov'],
    defaultBpm: 92,
    bpmRange: [82, 100],
    defaultKeyScale: 'G minor',
    timeSignature: '4',
    instrumentation: ['tight drums', 'deep bass', 'sample texture', 'minimal melodic hook'],
    productionNotes: ['clear vocal pocket', 'strong downbeat', 'gritty but balanced mix'],
    avoid: ['four-on-the-floor techno drive unless requested', 'chiptune comedy'],
    preferredPreset: 'quality',
  },
  {
    id: 'pop',
    label: 'pop',
    aliases: ['pop', 'popov'],
    defaultBpm: 118,
    bpmRange: [96, 128],
    defaultKeyScale: 'C major',
    timeSignature: '4',
    instrumentation: ['polished drums', 'subtle synth bass', 'hooky chords', 'layered vocals'],
    productionNotes: ['clear verse/chorus contrast', 'memorable melodic hook', 'radio-ready polish'],
    avoid: ['overly chaotic arrangement', 'genre swaps away from pop'],
    preferredPreset: 'quality',
  },
  {
    id: 'rock',
    label: 'rock',
    aliases: ['rock', 'rockov', 'rock song'],
    defaultBpm: 128,
    bpmRange: [100, 150],
    defaultKeyScale: 'E minor',
    timeSignature: '4',
    instrumentation: ['electric guitars', 'bass guitar', 'live drums', 'strong lead vocal'],
    productionNotes: ['guitar-driven energy', 'big chorus lift', 'human band dynamics'],
    avoid: ['trap-only drums', 'chiptune lead focus', 'accordion novelty'],
    preferredPreset: 'quality',
  },
  {
    id: 'folk',
    label: 'folk',
    aliases: ['folk', 'folkov'],
    defaultBpm: 96,
    bpmRange: [72, 112],
    defaultKeyScale: 'G major',
    timeSignature: '4',
    instrumentation: ['acoustic guitar', 'organic percussion', 'warm bass', 'natural vocal'],
    productionNotes: ['intimate storytelling', 'organic dynamics', 'space around the vocal'],
    avoid: ['industrial techno kick', 'heavy 808 dominance'],
    preferredPreset: 'quality',
  },
  {
    id: 'orchestral',
    label: 'orchestral / classical',
    aliases: ['orchestral', 'classical', 'klasick', 'orchester'],
    defaultBpm: 84,
    bpmRange: [60, 120],
    defaultKeyScale: 'D minor',
    timeSignature: '4',
    instrumentation: ['strings', 'brass', 'woodwinds', 'cinematic percussion'],
    productionNotes: ['dynamic orchestral arc', 'clear motif development', 'wide cinematic space'],
    avoid: ['club kick dominance', 'trap hi-hat programming'],
    preferredPreset: 'advanced',
  },
];

function normalizeStyleText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function aliasPattern(alias: string): RegExp {
  const escaped = normalizeStyleText(alias).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`(^|\\b)${escaped}(\\b|$)`);
}

export function findStyleProfile(text: string): StyleProfile | undefined {
  const normalized = normalizeStyleText(text);
  return STYLE_PROFILES.find(profile =>
    profile.aliases.some(alias => aliasPattern(alias).test(normalized))
  );
}

export function buildStyleProfilePrompt(profile: StyleProfile): string {
  return [
    `${profile.label} production profile`,
    `core instrumentation: ${profile.instrumentation.join(', ')}`,
    `production focus: ${profile.productionNotes.join(', ')}`,
    `avoid: ${profile.avoid.join(', ')}`,
  ].join('. ') + '.';
}
