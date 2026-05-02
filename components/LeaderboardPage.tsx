import React, { useCallback, useEffect, useState } from 'react';
import { Heart, Loader2, Music, Play, RefreshCw, Trophy, TrendingUp, Users } from 'lucide-react';
import { Song } from '../types';
import { socialApi, Song as ApiSong, LeaderboardsResponse } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { EmptyState } from './EmptyState';

interface LeaderboardPageProps {
  currentSong?: Song | null;
  isPlaying?: boolean;
  onPlaySong?: (song: Song, list?: Song[]) => void;
  onNavigateToProfile?: (username: string) => void;
  onNavigateToSong?: (songId: string) => void;
  onNavigateToCreate?: () => void;
}

type RankedSong = Song & {
  leaderboardScore: number;
};

function toSong(song: ApiSong): RankedSong {
  return {
    id: song.id,
    title: song.title,
    lyrics: song.lyrics || '',
    style: song.style || song.caption || '',
    coverUrl: song.cover_url || `https://picsum.photos/seed/${song.id}/400/400`,
    duration: song.duration ? `${Math.floor(Number(song.duration) / 60)}:${String(Math.floor(Number(song.duration) % 60)).padStart(2, '0')}` : '0:00',
    createdAt: new Date(song.created_at),
    tags: song.tags || [],
    audioUrl: song.audio_url || song.audioUrl,
    isPublic: song.is_public,
    likeCount: song.like_count || 0,
    viewCount: song.view_count || 0,
    userId: song.user_id,
    creator: song.creator,
    creator_avatar: song.creator_avatar,
    leaderboardScore: song.leaderboard_score || 0,
  };
}

export const LeaderboardPage: React.FC<LeaderboardPageProps> = ({
  currentSong,
  isPlaying,
  onPlaySong,
  onNavigateToProfile,
  onNavigateToSong,
  onNavigateToCreate,
}) => {
  const { token } = useAuth();
  const { t } = useI18n();
  const [data, setData] = useState<LeaderboardsResponse | null>(null);
  const [songs, setSongs] = useState<RankedSong[]>([]);
  const [activeTab, setActiveTab] = useState<'songs' | 'creators'>('songs');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLeaderboards = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'refresh') setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const response = await socialApi.getLeaderboards({ period: 'weekly', limit: 20, token });
      setData(response);
      setSongs(response.songs.map(toSong));
    } catch (leaderboardError) {
      console.error('Failed to load leaderboards:', leaderboardError);
      setError(t('leaderboardLoadFailed'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, t]);

  useEffect(() => {
    loadLeaderboards('initial');
  }, [loadLeaderboards]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-50 dark:bg-black text-zinc-500 dark:text-zinc-400">
        <Loader2 size={18} className="animate-spin mr-2" />
        {t('loadingLeaderboards')}
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-y-auto bg-zinc-50 dark:bg-black pb-24 lg:pb-32">
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-5 md:py-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-zinc-900 dark:text-white">{t('leaderboards')}</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              {data?.periodStart ? `${t('weekOf')} ${data.periodStart}` : t('weekly')}
            </p>
          </div>
          <button
            onClick={() => loadLeaderboards('refresh')}
            disabled={refreshing}
            className="w-10 h-10 rounded-full border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white flex items-center justify-center transition-colors disabled:opacity-60"
            title={t('refresh')}
          >
            <RefreshCw size={17} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>

        <div className="flex gap-2 mb-5">
          <button
            onClick={() => setActiveTab('songs')}
            className={`px-4 py-2 rounded-full text-sm font-semibold flex items-center gap-2 transition-colors ${activeTab === 'songs' ? 'bg-zinc-900 dark:bg-white text-white dark:text-black' : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-white/10'}`}
          >
            <Music size={16} />
            {t('topSongs')}
          </button>
          <button
            onClick={() => setActiveTab('creators')}
            className={`px-4 py-2 rounded-full text-sm font-semibold flex items-center gap-2 transition-colors ${activeTab === 'creators' ? 'bg-zinc-900 dark:bg-white text-white dark:text-black' : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-white/10'}`}
          >
            <Users size={16} />
            {t('topCreators')}
          </button>
        </div>

        {error && (
          <div className="border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300 rounded-lg px-4 py-3 text-sm mb-4">
            {error}
          </div>
        )}

        {activeTab === 'songs' && (
          <div className="space-y-3">
            {songs.length === 0 ? (
              <EmptyState
                icon={<Trophy size={22} />}
                title={t('leaderboardEmpty')}
                body={t('leaderboardEmptyBody')}
                actionLabel={onNavigateToCreate ? t('createFirstSong') : undefined}
                onAction={onNavigateToCreate}
              />
            ) : songs.map((song, index) => {
              const active = currentSong?.id === song.id;
              return (
                <div key={song.id} className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-white/10 rounded-lg p-3 md:p-4 flex items-center gap-3 md:gap-4">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0 ${index < 3 ? 'bg-yellow-400 text-yellow-950' : 'bg-zinc-100 dark:bg-white/10 text-zinc-700 dark:text-zinc-200'}`}>
                    {index + 1}
                  </div>
                  <button
                    onClick={() => onPlaySong?.(song, songs)}
                    className="relative w-16 h-16 rounded-lg overflow-hidden bg-zinc-200 dark:bg-zinc-800 flex-shrink-0"
                  >
                    <img src={song.coverUrl} alt={song.title} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                    <span className="absolute inset-0 bg-black/35 flex items-center justify-center">
                      <Play size={18} className="text-white fill-current" />
                    </span>
                    {active && isPlaying && (
                      <span className="absolute inset-x-2 bottom-2 h-1 rounded-full bg-pink-500" />
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <button
                      onClick={() => onNavigateToSong?.(song.id)}
                      className="text-left font-bold text-zinc-900 dark:text-white hover:underline line-clamp-1"
                    >
                      {song.title}
                    </button>
                    <button
                      onClick={() => song.creator && onNavigateToProfile?.(song.creator)}
                      className="text-sm text-zinc-500 dark:text-zinc-400 hover:underline"
                    >
                      {song.creator || t('anonymous')}
                    </button>
                  </div>
                  <div className="hidden sm:flex items-center gap-4 text-sm text-zinc-500 dark:text-zinc-400">
                    <span className="flex items-center gap-1">
                      <Heart size={15} />
                      {song.likeCount || 0}
                    </span>
                    <span className="flex items-center gap-1">
                      <TrendingUp size={15} />
                      {song.leaderboardScore}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'creators' && (
          <div className="space-y-3">
            {!data?.creators.length ? (
              <EmptyState
                icon={<Users size={22} />}
                title={t('leaderboardEmpty')}
                body={t('leaderboardEmptyBody')}
                actionLabel={onNavigateToCreate ? t('createFirstSong') : undefined}
                onAction={onNavigateToCreate}
              />
            ) : data.creators.map((creator) => (
              <button
                key={creator.id}
                onClick={() => onNavigateToProfile?.(creator.username)}
                className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-white/10 rounded-lg p-4 flex items-center gap-4 text-left hover:border-zinc-300 dark:hover:border-white/20 transition-colors"
              >
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0 ${creator.rank <= 3 ? 'bg-yellow-400 text-yellow-950' : 'bg-zinc-100 dark:bg-white/10 text-zinc-700 dark:text-zinc-200'}`}>
                  {creator.rank}
                </div>
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center text-white font-bold overflow-hidden flex-shrink-0">
                  {creator.avatar_url ? (
                    <img src={creator.avatar_url} alt={creator.username} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                  ) : (
                    creator.username[0]?.toUpperCase()
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-zinc-900 dark:text-white truncate">{creator.username}</span>
                    {creator.rank <= 10 && <Trophy size={16} className="text-yellow-500 flex-shrink-0" />}
                  </div>
                  <div className="text-sm text-zinc-500 dark:text-zinc-400">
                    {t('level')} {creator.level || 1} · {creator.leaderboard_score} {t('points')}
                  </div>
                </div>
                <div className="hidden md:grid grid-cols-3 gap-4 text-center text-xs text-zinc-500 dark:text-zinc-400">
                  <div>
                    <div className="font-bold text-zinc-900 dark:text-white text-sm">{creator.published_song_count}</div>
                    {t('songs')}
                  </div>
                  <div>
                    <div className="font-bold text-zinc-900 dark:text-white text-sm">{creator.likes_received}</div>
                    {t('likes')}
                  </div>
                  <div>
                    <div className="font-bold text-zinc-900 dark:text-white text-sm">{creator.follower_growth}</div>
                    {t('newFans')}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
