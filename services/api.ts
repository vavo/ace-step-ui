// Use relative URLs so Vite proxy handles them (enables LAN access)
const API_BASE = '';

// Resolve audio URL based on storage type
export function getAudioUrl(audioUrl: string | undefined | null, songId?: string): string | undefined {
  if (!audioUrl) return undefined;

  // Route song playback through the backend so auth, range handling, and
  // browser-safe codec fallback are centralized.
  if (songId) {
    return `/api/songs/${encodeURIComponent(songId)}/audio`;
  }

  // Local FLAC files are not playable in Safari/WebKit. Use the audio proxy so
  // the server can return an MP3 stream when needed.
  if (/\.flac(?:$|\?)/i.test(audioUrl) && audioUrl.startsWith('/audio/')) {
    return `/api/generate/audio?path=${encodeURIComponent(audioUrl)}&format=mp3`;
  }

  // Local storage: already relative, works with proxy
  if (audioUrl.startsWith('/audio/')) {
    return audioUrl;
  }

  // Already a full URL
  return audioUrl;
}

interface ApiOptions {
  method?: string;
  body?: unknown;
  token?: string | null;
}

function collectNewBadges(value: unknown, badges: unknown[] = []): unknown[] {
  if (!value || typeof value !== 'object') return badges;

  const record = value as Record<string, unknown>;
  if (Array.isArray(record.newBadges)) {
    badges.push(...record.newBadges);
  }

  Object.values(record).forEach(child => {
    if (child && typeof child === 'object') {
      collectNewBadges(child, badges);
    }
  });

  return badges;
}

function emitNewBadges(value: unknown): void {
  if (typeof window === 'undefined') return;

  const seen = new Set<string>();
  const badges = collectNewBadges(value).filter((badge) => {
    if (!badge || typeof badge !== 'object') return false;
    const record = badge as Record<string, unknown>;
    const key = `${record.badge_key || record.id || 'badge'}:${record.awarded_at || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (badges.length > 0) {
    window.dispatchEvent(new CustomEvent('acestep:new-badges', { detail: badges }));
  }
}

async function api<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, token } = options;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    const errorMessage = error.error || error.message || 'Request failed';
    // Include status code in error for proper handling
    throw new Error(`${response.status}: ${errorMessage}`);
  }

  const data = await response.json();
  emitNewBadges(data);
  return data;
}

// Auth API
export interface User {
  id: string;
  username: string;
  email?: string;
  displayName?: string;
  display_name?: string;
  isAdmin?: boolean;
  bio?: string;
  avatar_url?: string;
  banner_url?: string;
  createdAt?: string;
  created_at?: string;
  default_vocal_language?: string;
  default_ui_language?: string;
  plan?: string;
  accountTier?: string;
  credit_balance?: number;
  unlimitedCredits?: boolean;
  xp?: number;
  level?: number;
  badges?: UserBadge[];
}

export interface UserBadge {
  id: string;
  badge_key?: string;
  label: string;
  description: string;
  color: string;
  awarded_at?: string;
  metadata?: Record<string, unknown> | null;
}

export interface UserProfileUpdate {
  username?: string;
  bio?: string;
  avatarUrl?: string;
  bannerUrl?: string;
  defaultVocalLanguage?: string;
  defaultUiLanguage?: string;
  default_vocal_language?: string;
  default_ui_language?: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface SessionResponse {
  authenticated: boolean;
  user: User | null;
  token: string | null;
}

export interface AuthOptions {
  googleConfigured: boolean;
  localAuthAllowed: boolean;
  emailAuthAllowed?: boolean;
}

export const authApi = {
  googleStartUrl: '/api/auth/google/start',

  options: (): Promise<AuthOptions> =>
    api('/api/auth/options'),

  setup: (username: string): Promise<AuthResponse> =>
    api('/api/auth/setup', { method: 'POST', body: { username } }),

  localDev: (username?: string): Promise<AuthResponse> =>
    api('/api/auth/local-dev', { method: 'POST', body: { username } }),

  emailRegister: (email: string, password: string, username: string): Promise<AuthResponse> =>
    api('/api/auth/email/register', { method: 'POST', body: { email, password, username } }),

  emailLogin: (email: string, password: string): Promise<AuthResponse> =>
    api('/api/auth/email/login', { method: 'POST', body: { email, password } }),

  forgotPassword: (email: string): Promise<{ sent: boolean; resetUrl?: string }> =>
    api('/api/auth/password/forgot', { method: 'POST', body: { email } }),

  resetPassword: (token: string, password: string): Promise<{ success: boolean }> =>
    api('/api/auth/password/reset', { method: 'POST', body: { token, password } }),

  me: (token?: string | null): Promise<AuthResponse> =>
    api('/api/auth/me', { token: token || undefined }),

  session: (): Promise<SessionResponse> =>
    api(`/api/auth/session?t=${Date.now()}`),

  logout: (token?: string | null): Promise<{ success: boolean }> =>
    api('/api/auth/logout', { method: 'POST', token: token || undefined }),

  refresh: (token?: string | null): Promise<AuthResponse> =>
    api('/api/auth/refresh', { method: 'POST', token: token || undefined }),

  updateUsername: (username: string, token: string): Promise<AuthResponse> =>
    api('/api/auth/username', { method: 'PATCH', body: { username }, token }),
};

// Songs API
export interface Song {
  id: string;
  title: string;
  lyrics: string;
  style: string;
  caption?: string;
  cover_url?: string;
  audio_url?: string;
  audioUrl?: string;
  duration?: number;
  bpm?: number;
  key_scale?: string;
  time_signature?: string;
  tags: string[];
  is_public: boolean;
  like_count?: number;
  view_count?: number;
  user_id?: string;
  created_at: string;
  creator?: string;
  creator_avatar?: string;
  comment_count?: number;
  is_liked?: boolean;
  leaderboard_score?: number;
  ditModel?: string;
  generation_params?: any;
}

// Transform songs to have proper audio URLs
function transformSongs(songs: Song[]): Song[] {
  return songs.map(song => {
    const rawUrl = song.audio_url || song.audioUrl;
    const resolvedUrl = getAudioUrl(rawUrl, song.id);
    return {
      ...song,
      audio_url: resolvedUrl,
      audioUrl: resolvedUrl,
    };
  });
}

export const songsApi = {
  getMySongs: async (token: string): Promise<{ songs: Song[] }> => {
    const result = await api('/api/songs', { token }) as { songs: Song[] };
    return { songs: transformSongs(result.songs) };
  },

  getPublicSongs: async (limit = 20, offset = 0): Promise<{ songs: Song[] }> => {
    const result = await api(`/api/songs/public?limit=${limit}&offset=${offset}`) as { songs: Song[] };
    return { songs: transformSongs(result.songs) };
  },

  getFeaturedSongs: async (): Promise<{ songs: Song[] }> => {
    const result = await api('/api/songs/public/featured') as { songs: Song[] };
    return { songs: transformSongs(result.songs) };
  },

  getSong: async (id: string, token?: string | null): Promise<{ song: Song }> => {
    const result = await api(`/api/songs/${id}`, { token: token || undefined }) as { song: Song };
    const rawUrl = result.song.audio_url || result.song.audioUrl;
    const resolvedUrl = getAudioUrl(rawUrl, result.song.id);
    return { song: { ...result.song, audio_url: resolvedUrl, audioUrl: resolvedUrl } };
  },

  getFullSong: async (id: string, token?: string | null): Promise<{ song: Song, comments: any[] }> => {
    const result = await api(`/api/songs/${id}/full`, { token: token || undefined }) as { song: Song, comments: any[] };
    const rawUrl = result.song.audio_url || result.song.audioUrl;
    const resolvedUrl = getAudioUrl(rawUrl, result.song.id);
    return { ...result, song: { ...result.song, audio_url: resolvedUrl, audioUrl: resolvedUrl } };
  },

  createSong: (song: Partial<Song>, token: string): Promise<{ song: Song }> =>
    api('/api/songs', { method: 'POST', body: song, token }),

  updateSong: async (id: string, updates: Partial<Song>, token: string): Promise<{ song: any }> => {
    const result = await api(`/api/songs/${id}`, { method: 'PATCH', body: updates, token }) as { song: any };
    const s = result.song;
    const rawUrl = s.audio_url || s.audioUrl;
    const resolvedUrl = getAudioUrl(rawUrl, s.id);

    return {
      song: {
        id: s.id,
        title: s.title,
        lyrics: s.lyrics,
        style: s.style,
        caption: s.caption,
        cover_url: s.cover_url,
        coverUrl: s.cover_url || s.coverUrl || `https://picsum.photos/seed/${s.id}/400/400`,
        duration: s.duration && s.duration > 0 ? `${Math.floor(s.duration / 60)}:${String(Math.floor(s.duration % 60)).padStart(2, '0')}` : '0:00',
        createdAt: new Date(s.created_at || s.createdAt),
        created_at: s.created_at,
        tags: s.tags || [],
        audioUrl: resolvedUrl,
        audio_url: resolvedUrl,
        isPublic: s.is_public ?? s.isPublic,
        is_public: s.is_public ?? s.isPublic,
        likeCount: s.like_count || s.likeCount || 0,
        like_count: s.like_count || s.likeCount || 0,
        viewCount: s.view_count || s.viewCount || 0,
        view_count: s.view_count || s.viewCount || 0,
        userId: s.user_id || s.userId,
        user_id: s.user_id || s.userId,
        creator: s.creator,
        creator_avatar: s.creator_avatar,
        ditModel: s.dit_model || s.ditModel,
        isGenerating: s.isGenerating,
        queuePosition: s.queuePosition,
        bpm: s.bpm,
        key_scale: s.key_scale,
        time_signature: s.time_signature,
      }
    };
  },

  deleteSong: (id: string, token: string): Promise<{ success: boolean }> =>
    api(`/api/songs/${id}`, { method: 'DELETE', token }),

  toggleLike: (id: string, token: string): Promise<{ liked: boolean }> =>
    api(`/api/songs/${id}/like`, { method: 'POST', token }),

  getLikedSongs: async (token: string): Promise<{ songs: Song[] }> => {
    const result = await api('/api/songs/liked/list', { token }) as { songs: Song[] };
    return { songs: transformSongs(result.songs) };
  },

  togglePrivacy: (id: string, token: string): Promise<{ isPublic: boolean }> =>
    api(`/api/songs/${id}/privacy`, { method: 'PATCH', token }),

  trackPlay: (id: string, token?: string | null): Promise<{ viewCount: number }> =>
    api(`/api/songs/${id}/play`, { method: 'POST', token: token || undefined }),

  getComments: (id: string, token?: string | null): Promise<{ comments: Comment[] }> =>
    api(`/api/songs/${id}/comments`, { token: token || undefined }),

  addComment: (id: string, content: string, token: string): Promise<{ comment: Comment }> =>
    api(`/api/songs/${id}/comments`, { method: 'POST', body: { content }, token }),

  deleteComment: (commentId: string, token: string): Promise<{ success: boolean }> =>
    api(`/api/songs/comments/${commentId}`, { method: 'DELETE', token }),
};

interface Comment {
  id: string;
  song_id: string;
  user_id: string;
  username: string;
  content: string;
  created_at: string;
}

// Generation API
export interface GenerationParams {
  // Mode
  customMode: boolean;
  songDescription?: string;

  // Custom Mode
  prompt?: string;
  lyrics: string;
  style: string;
  title: string;

  // Model Selection
  ditModel?: string;
  modelPreset?: 'fast' | 'quality' | 'advanced';
  strictMode?: boolean;

  // Common
  instrumental: boolean;
  vocalLanguage?: string;

  // Music Parameters
  duration?: number;
  bpm?: number;
  keyScale?: string;
  timeSignature?: string;

  // Generation Settings
  inferenceSteps?: number;
  guidanceScale?: number;
  batchSize?: number;
  randomSeed?: boolean;
  seed?: number;
  thinking?: boolean;
  audioFormat?: 'mp3' | 'flac' | 'wav';
  inferMethod?: 'ode' | 'sde';
  shift?: number;

  // LM Parameters
  lmTemperature?: number;
  lmCfgScale?: number;
  lmTopK?: number;
  lmTopP?: number;
  lmNegativePrompt?: string;
  lmBackend?: 'pt' | 'vllm';
  lmModel?: string;

  // Expert Parameters
  referenceAudioUrl?: string;
  sourceAudioUrl?: string;
  referenceAudioTitle?: string;
  sourceAudioTitle?: string;
  audioCodes?: string;
  repaintingStart?: number;
  repaintingEnd?: number;
  instruction?: string;
  audioCoverStrength?: number;
  taskType?: string;
  useAdg?: boolean;
  cfgIntervalStart?: number;
  cfgIntervalEnd?: number;
  customTimesteps?: string;
  useCotMetas?: boolean;
  useCotCaption?: boolean;
  useCotLanguage?: boolean;
  autogen?: boolean;
  constrainedDecodingDebug?: boolean;
  allowLmBatch?: boolean;
  getScores?: boolean;
  getLrc?: boolean;
  scoreScale?: number;
  lmBatchChunkSize?: number;
  trackName?: string;
  completeTrackClasses?: string[];
  isFormatCaption?: boolean;
  lockedConstraints?: {
    genres: string[];
    language?: string;
    vocalGender?: 'male' | 'female';
    vocalTone: string[];
    mood: string[];
    bpm?: number;
    duration?: number;
    keyScale?: string;
    timeSignature?: string;
    instrumental: boolean;
  };
  loraLoaded?: boolean;
}

export interface GenerationJob {
  jobId: string;
  id?: string;
  status: 'pending' | 'queued' | 'running' | 'succeeded' | 'failed';
  queuePosition?: number;
  etaSeconds?: number;
  progress?: number;
  stage?: string;
  params?: any;
  created_at?: string;
  result?: {
    audioUrls: string[];
    bpm?: number;
    estimatedBpm?: number;
    duration?: number;
    keyScale?: string;
    timeSignature?: string;
    qualityWarnings?: string[];
  };
  error?: string;
}

export const generateApi = {
  health: (): Promise<{ healthy: boolean; aceStepUrl?: string; error?: string }> =>
    api('/api/generate/health'),

  startGeneration: (params: GenerationParams, token: string): Promise<GenerationJob> =>
    api('/api/generate', { method: 'POST', body: params, token }),

  getStatus: (jobId: string, token: string): Promise<GenerationJob> =>
    api(`/api/generate/status/${jobId}`, { token }),

  getHistory: (token: string): Promise<{ jobs: GenerationJob[] }> =>
    api('/api/generate/history', { token }),

  uploadAudio: async (file: File, token: string): Promise<{ url: string; key: string }> => {
    const formData = new FormData();
    formData.append('audio', file);
    const response = await fetch(`${API_BASE}/api/generate/upload-audio`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(error.details || error.error || 'Upload failed');
    }
    return response.json();
  },

  formatInput: (params: {
    caption: string;
    lyrics?: string;
    bpm?: number;
    duration?: number;
    keyScale?: string;
    timeSignature?: string;
    temperature?: number;
    topK?: number;
    topP?: number;
    lmModel?: string;
    lmBackend?: string;
  }, token: string): Promise<{
    caption?: string;
    lyrics?: string;
    bpm?: number;
    duration?: number;
    key_scale?: string;
    vocal_language?: string;
    time_signature?: string;
    status_message?: string;
    error?: string;
  }> => api('/api/generate/format', { method: 'POST', body: params, token }),

  // Random description from Gradio's example library
  getRandomDescription: (token: string, language = 'en'): Promise<{
    description: string;
    instrumental: boolean;
    vocalLanguage: string;
  }> => api(`/api/generate/random-description?lang=${encodeURIComponent(language)}`, { token }),

  // LoRA Inference (requires ACE-Step training fork)
  loadLora: (params: {
    lora_path: string;
  }, token: string): Promise<{
    message: string;
    lora_path: string;
  }> => api('/api/lora/load', { method: 'POST', body: params, token }),

  unloadLora: (token: string): Promise<{
    message: string;
  }> => api('/api/lora/unload', { method: 'POST', token }),

  setLoraScale: (params: {
    scale: number;
  }, token: string): Promise<{
    message: string;
    scale: number;
  }> => api('/api/lora/scale', { method: 'POST', body: params, token }),

  toggleLora: (params: {
    enabled: boolean;
  }, token: string): Promise<{
    message: string;
    active: boolean;
  }> => api('/api/lora/toggle', { method: 'POST', body: params, token }),

  getLoraStatus: (token: string): Promise<{
    loaded: boolean;
    active: boolean;
    scale: number;
    path: string;
  }> => api('/api/lora/status', { token }),
};

export const creditsApi = {
  getBalance: (token: string): Promise<{
    credits: {
      balance: number;
      lastDailyClaimAt: string | null;
      streakDays: number;
      unlimited?: boolean;
    };
    costs: {
      lyricsDraft: number;
      generationVariation: number;
    };
    daily: {
      claimAmount: number;
      freeBalanceCap: number;
      streakBonusStep: number;
      streakBonusMax: number;
    };
  }> => api('/api/credits/balance', { token }),

  getLedger: (token: string, limit = 50): Promise<{
    entries: Array<{
      id: string;
      delta: number;
      balanceAfter: number;
      reason: string;
      referenceType: string | null;
      referenceId: string | null;
      metadata: Record<string, unknown> | null;
      createdAt: string;
    }>;
  }> => api(`/api/credits/ledger?limit=${encodeURIComponent(String(limit))}`, { token }),

  claimDaily: (token: string): Promise<{
    credits: {
      balance: number;
      lastDailyClaimAt: string | null;
      streakDays: number;
      unlimited?: boolean;
      claimed: boolean;
      grantAmount: number;
      reason?: string;
    };
  }> => api('/api/credits/claim-daily', { method: 'POST', token }),
};

export interface LyricIdea {
  id: string;
  title: string;
  lyrics: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export const ideasApi = {
  list: (token: string): Promise<{ ideas: LyricIdea[] }> =>
    api('/api/ideas', { token }),

  create: (params: { title?: string; lyrics?: string; notes?: string }, token: string): Promise<{ idea: LyricIdea }> =>
    api('/api/ideas', { method: 'POST', body: params, token }),

  update: (id: string, params: { title?: string; lyrics?: string; notes?: string }, token: string): Promise<{ idea: LyricIdea }> =>
    api(`/api/ideas/${id}`, { method: 'PATCH', body: params, token }),

  delete: (id: string, token: string): Promise<{ success: boolean }> =>
    api(`/api/ideas/${id}`, { method: 'DELETE', token }),
};

export const lyricsApi = {
  draft: (params: {
    prompt: string;
    mood?: string;
    style?: string;
    language?: string;
  }, token: string): Promise<{
    draftId: string;
    draft: {
      title: string;
      lyrics: string;
      stylePrompt: string;
      language: string;
    };
    creditsSpent: number;
  }> => api('/api/lyrics/draft', { method: 'POST', body: params, token }),
};

// Users API
export interface UserProfile extends User {
  bio?: string;
  avatar_url?: string;
  banner_url?: string;
  created_at: string;
}

export const usersApi = {
  getProfile: (username: string, token?: string | null): Promise<{ user: UserProfile }> =>
    api(`/api/users/${username}`, { token: token || undefined }),

  getPublicSongs: (username: string): Promise<{ songs: Song[] }> =>
    api(`/api/users/${username}/songs`),

  getPublicPlaylists: (username: string): Promise<{ playlists: any[] }> =>
    api(`/api/users/${username}/playlists`),

  getFeaturedCreators: (): Promise<{ creators: Array<UserProfile & { follower_count?: number }> }> =>
    api('/api/users/public/featured'),

  updateProfile: (updates: UserProfileUpdate, token: string): Promise<{ user: User }> =>
    api('/api/users/me', { method: 'PATCH', body: updates, token }),

  uploadAvatar: async (file: File, token: string): Promise<{ user: UserProfile; url: string }> => {
    const formData = new FormData();
    formData.append('avatar', file);
    const response = await fetch(`${API_BASE}/api/users/me/avatar`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(error.details || error.error || 'Upload failed');
    }
    return response.json();
  },

  uploadBanner: async (file: File, token: string): Promise<{ user: UserProfile; url: string }> => {
    const formData = new FormData();
    formData.append('banner', file);
    const response = await fetch(`${API_BASE}/api/users/me/banner`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(error.error || 'Upload failed');
    }
    return response.json();
  },

  toggleFollow: (username: string, token: string): Promise<{ following: boolean, followerCount: number }> =>
    api(`/api/users/${username}/follow`, { method: 'POST', token }),

  getFollowers: (username: string): Promise<{ followers: User[] }> =>
    api(`/api/users/${username}/followers`),

  getFollowing: (username: string): Promise<{ following: User[] }> =>
    api(`/api/users/${username}/following`),

  getStats: (username: string, token?: string | null): Promise<{ followerCount: number, followingCount: number, isFollowing: boolean }> =>
    api(`/api/users/${username}/stats`, { token: token || undefined }),
};

// Playlists API
export interface Playlist {
  id: string;
  name: string;
  description?: string;
  cover_url?: string;
  is_public?: boolean;
  isPublic?: boolean;
  user_id?: string;
  created_at?: string;
  song_count?: number;
}

export const playlistsApi = {
  create: (name: string, description: string, isPublic: boolean, token: string): Promise<{ playlist: Playlist }> =>
    api('/api/playlists', { method: 'POST', body: { name, description, isPublic }, token }),

  getMyPlaylists: (token: string): Promise<{ playlists: Playlist[] }> =>
    api('/api/playlists', { token }),

  getPlaylist: (id: string, token?: string | null): Promise<{ playlist: Playlist, songs: any[] }> =>
    api(`/api/playlists/${id}`, { token: token || undefined }),

  getFeaturedPlaylists: (): Promise<{ playlists: Array<Playlist & { creator?: string; creator_avatar?: string }> }> =>
    api('/api/playlists/public/featured'),

  addSong: (playlistId: string, songId: string, token: string): Promise<{ success: boolean }> =>
    api(`/api/playlists/${playlistId}/songs`, { method: 'POST', body: { songId }, token }),

  removeSong: (playlistId: string, songId: string, token: string): Promise<{ success: boolean }> =>
    api(`/api/playlists/${playlistId}/songs/${songId}`, { method: 'DELETE', token }),

  update: (id: string, updates: Partial<Playlist>, token: string): Promise<{ playlist: Playlist }> =>
    api(`/api/playlists/${id}`, { method: 'PATCH', body: updates, token }),

  delete: (id: string, token: string): Promise<{ success: boolean }> =>
    api(`/api/playlists/${id}`, { method: 'DELETE', token }),
};

// Search API
export interface SearchResult {
  songs: Song[];
  creators: Array<UserProfile & { follower_count?: number }>;
  playlists: Array<Playlist & { creator?: string; creator_avatar?: string }>;
}

export const searchApi = {
  search: async (query: string, type?: 'songs' | 'creators' | 'playlists' | 'all'): Promise<SearchResult> => {
    const params = new URLSearchParams({ q: query });
    if (type && type !== 'all') params.append('type', type);
    const result = await api(`/api/search?${params}`) as SearchResult;
    return {
      ...result,
      songs: transformSongs(result.songs || []),
    };
  },
};

export interface FeedResponse {
  items: Song[];
  pagination: {
    limit: number;
    offset: number;
    nextOffset: number | null;
  };
}

export interface LeaderboardsResponse {
  period: 'weekly';
  periodStart: string;
  songs: Song[];
  creators: Array<UserProfile & {
    rank: number;
    published_song_count: number;
    likes_received: number;
    follower_growth: number;
    event_points: number;
    leaderboard_score: number;
    badges?: UserBadge[];
  }>;
}

export const socialApi = {
  getFeed: async (params: { limit?: number; offset?: number; token?: string | null } = {}): Promise<FeedResponse> => {
    const query = new URLSearchParams();
    if (params.limit) query.set('limit', String(params.limit));
    if (params.offset) query.set('offset', String(params.offset));
    const suffix = query.toString() ? `?${query}` : '';
    const result = await api(`/api/feed${suffix}`, { token: params.token || undefined }) as FeedResponse;
    return { ...result, items: transformSongs(result.items || []) };
  },

  getLeaderboards: async (params: { period?: 'weekly'; limit?: number; token?: string | null } = {}): Promise<LeaderboardsResponse> => {
    const query = new URLSearchParams({ period: params.period || 'weekly' });
    if (params.limit) query.set('limit', String(params.limit));
    const result = await api(`/api/leaderboards?${query}`, { token: params.token || undefined }) as LeaderboardsResponse;
    return { ...result, songs: transformSongs(result.songs || []) };
  },

  report: (body: {
    targetType: 'song' | 'user' | 'comment';
    targetId: string;
    reason: string;
    details?: string;
  }, token: string): Promise<{ report: { id: string; targetType: string; targetId: string; reason: string; status: string } }> =>
    api('/api/reports', { method: 'POST', body, token }),

  getBlockedUsers: (token: string): Promise<{ users: UserProfile[] }> =>
    api('/api/blocks', { token }),

  blockUser: (username: string, token: string): Promise<{ blocked: boolean; user: UserProfile }> =>
    api(`/api/blocks/${encodeURIComponent(username)}`, { method: 'POST', token }),

  unblockUser: (username: string, token: string): Promise<{ blocked: boolean; user: UserProfile }> =>
    api(`/api/blocks/${encodeURIComponent(username)}`, { method: 'DELETE', token }),
};

// Contact Form API
export interface ContactFormData {
  name: string;
  email: string;
  subject: string;
  message: string;
  category: 'general' | 'support' | 'business' | 'press' | 'legal';
}

export const contactApi = {
  submit: (data: ContactFormData): Promise<{ success: boolean; message: string; id: string }> =>
    api('/api/contact', { method: 'POST', body: data }),
};

// Training API (LoRA fine-tuning via Gradio)
export interface TrainingSample {
  audio: unknown;
  filename: string;
  caption: string;
  genre: string;
  promptOverride: string;
  lyrics: string;
  bpm: number;
  key: string;
  timeSignature: string;
  duration: number;
  language: string;
  instrumental: boolean;
  rawLyrics?: string;
}

export interface DatasetSettings {
  datasetName: string;
  customTag: string;
  tagPosition: 'prepend' | 'append' | 'replace';
  allInstrumental: boolean;
  genreRatio: number;
}

export interface TrainingParams {
  tensorDir?: string;
  rank?: number;
  alpha?: number;
  dropout?: number;
  learningRate?: number;
  epochs?: number;
  batchSize?: number;
  gradientAccumulation?: number;
  saveEvery?: number;
  shift?: number;
  seed?: number;
  outputDir?: string;
  resumeCheckpoint?: string | null;
}

// Helper: build proxy URL for training audio files
export function getTrainingAudioUrl(audioPath: unknown, token?: string): string | undefined {
  if (!audioPath) return undefined;

  // Handle Gradio FileData objects
  if (typeof audioPath === 'object' && audioPath !== null) {
    const fd = audioPath as Record<string, unknown>;
    if (fd.url && typeof fd.url === 'string') return fd.url;
    if (fd.path && typeof fd.path === 'string') {
      return `${API_BASE}/api/training/audio?path=${encodeURIComponent(fd.path)}`;
    }
    return undefined;
  }

  // Handle absolute path string
  if (typeof audioPath === 'string') {
    if (audioPath.startsWith('http://') || audioPath.startsWith('https://') || audioPath.startsWith('/audio/')) {
      return audioPath;
    }
    return `${API_BASE}/api/training/audio?path=${encodeURIComponent(audioPath)}`;
  }

  return undefined;
}

export const trainingApi = {
  // Upload audio files for a dataset
  uploadAudio: async (files: File[], datasetName: string, token: string): Promise<{
    files: Array<{ filename: string; originalName: string; size: number; path: string }>;
    uploadDir: string;
    count: number;
  }> => {
    const formData = new FormData();
    formData.append('datasetName', datasetName);
    for (const file of files) {
      formData.append('audio', file);
    }
    const response = await fetch(`${API_BASE}/api/training/upload-audio`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(error.error || 'Upload failed');
    }
    return response.json();
  },

  // Build dataset JSON from uploaded audio files
  buildDataset: (params: {
    datasetName: string;
    customTag?: string;
    tagPosition?: string;
    allInstrumental?: boolean;
  }, token: string): Promise<{
    status: string;
    dataframe: unknown;
    sampleCount: number;
    sample: TrainingSample;
    settings: DatasetSettings;
    datasetPath: string;
  }> => api('/api/training/build-dataset', { method: 'POST', body: params, token }),

  // Scan directory for audio files (Node.js implementation)
  scanDirectory: (params: {
    audioDir: string;
    datasetName?: string;
    customTag?: string;
    tagPosition?: string;
    allInstrumental?: boolean;
  }, token: string): Promise<{
    status: string;
    dataframe: unknown;
    sampleCount: number;
    audioDir: string;
  }> => api('/api/training/scan-directory', { method: 'POST', body: params, token }),

  // Auto-label dataset samples (requires model loaded in Gradio)
  autoLabel: (params: {
    skipMetas?: boolean;
    formatLyrics?: boolean;
    transcribeLyrics?: boolean;
    onlyUnlabeled?: boolean;
  }, token: string): Promise<{
    dataframe?: unknown;
    status: string;
    error?: string;
    hint?: string;
  }> => api('/api/training/auto-label', { method: 'POST', body: params, token }),

  // Initialize model for training (requires Gradio)
  initModel: (params: {
    checkpoint?: string;
    configPath?: string;
    device?: string;
    initLlm?: boolean;
    lmModelPath?: string;
    backend?: string;
    useFlashAttention?: boolean;
    offloadToCpu?: boolean;
    offloadDitToCpu?: boolean;
    compileModel?: boolean;
    quantization?: boolean;
  }, token: string): Promise<{
    status: string;
    modelReady?: boolean;
    error?: string;
    hint?: string;
  }> => api('/api/training/init-model', { method: 'POST', body: params, token }),

  // List available checkpoints
  getCheckpoints: (token: string): Promise<{
    checkpoints: string[];
    configs: string[];
  }> => api('/api/training/checkpoints', { token }),

  // List LoRA training checkpoints
  getLoraCheckpoints: (dir: string, token: string): Promise<{
    checkpoints: string[];
    outputDir: string;
  }> => api(`/api/training/lora-checkpoints?dir=${encodeURIComponent(dir)}`, { token }),

  // Preprocess dataset to tensors
  preprocess: (params: {
    datasetPath: string;
    outputDir?: string;
  }, token: string): Promise<{
    status: string;
    message?: string;
    output_files?: number;
  }> => api('/api/training/preprocess', { method: 'POST', body: params, token }),

  loadDataset: (datasetPath: string, token: string): Promise<{
    status: string;
    dataframe: unknown;
    sampleCount: number;
    sample: TrainingSample;
    settings: DatasetSettings;
  }> => api('/api/training/load-dataset', { method: 'POST', body: { datasetPath }, token }),

  getSamplePreview: (idx: number, token: string): Promise<TrainingSample> =>
    api(`/api/training/sample-preview?idx=${idx}`, { token }),

  saveSample: (params: {
    sampleIdx: number;
    caption: string;
    genre: string;
    promptOverride: string;
    lyrics: string;
    bpm: number;
    key: string;
    timeSignature: string;
    language: string;
    instrumental: boolean;
  }, token: string): Promise<{ dataframe: unknown; status: string }> =>
    api('/api/training/save-sample', { method: 'POST', body: params, token }),

  updateSettings: (params: {
    customTag: string;
    tagPosition: string;
    allInstrumental: boolean;
    genreRatio: number;
  }, token: string): Promise<{ success: boolean }> =>
    api('/api/training/update-settings', { method: 'POST', body: params, token }),

  saveDataset: (params: {
    savePath?: string;
    datasetName?: string;
    customTag?: string;
    tagPosition?: string;
    allInstrumental?: boolean;
    genreRatio?: number;
  }, token: string): Promise<{ status: string; path: string }> =>
    api('/api/training/save-dataset', { method: 'POST', body: params, token }),

  loadTensors: (tensorDir: string, token: string): Promise<{ status: string }> =>
    api('/api/training/load-tensors', { method: 'POST', body: { tensorDir }, token }),

  startTraining: (params: TrainingParams, token: string): Promise<{
    progress: string;
    log: string;
    metrics: unknown;
  }> => api('/api/training/start', { method: 'POST', body: params, token }),

  stopTraining: (token: string): Promise<{ status: string }> =>
    api('/api/training/stop', { method: 'POST', token }),

  exportLora: (params: {
    exportPath?: string;
    loraOutputDir?: string;
  }, token: string): Promise<{ status: string }> =>
    api('/api/training/export', { method: 'POST', body: params, token }),

  importDataset: (datasetType: string, token: string): Promise<{ status: string }> =>
    api('/api/training/import-dataset', { method: 'POST', body: { datasetType }, token }),
};
