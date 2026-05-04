import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Ban, Heart, Loader2, MessageCircle, MoreHorizontal, Music2, Play, RefreshCw, UserRound } from 'lucide-react';
import { Song } from '../types';
import { getAudioUrl, socialApi, Song as ApiSong } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { EmptyState } from './EmptyState';

interface FeedPageProps {
  currentSong?: Song | null;
  isPlaying?: boolean;
  likedSongIds?: Set<string>;
  onPlaySong?: (song: Song, list?: Song[]) => void;
  onToggleLike?: (songId: string) => void;
  onNavigateToProfile?: (username: string) => void;
  onNavigateToSong?: (songId: string) => void;
  onNavigateToCreate?: () => void;
}

type FeedSong = Song & {
  commentCount?: number;
  isLiked?: boolean;
};

const PAGE_SIZE = 20;

function toSong(song: ApiSong): FeedSong {
  return {
    id: song.id,
    title: song.title,
    lyrics: song.lyrics || '',
    style: song.style || song.caption || '',
    coverUrl: song.cover_url || `https://picsum.photos/seed/${song.id}/400/400`,
    duration: song.duration ? `${Math.floor(Number(song.duration) / 60)}:${String(Math.floor(Number(song.duration) % 60)).padStart(2, '0')}` : '0:00',
    createdAt: new Date(song.created_at),
    tags: song.tags || [],
    audioUrl: getAudioUrl(song.audio_url || song.audioUrl, song.id),
    isPublic: song.is_public,
    likeCount: song.like_count || 0,
    viewCount: song.view_count || 0,
    userId: song.user_id,
    creator: song.creator,
    creator_avatar: song.creator_avatar,
    commentCount: song.comment_count || 0,
    isLiked: song.is_liked,
  };
}

export const FeedPage: React.FC<FeedPageProps> = ({
  currentSong,
  isPlaying,
  likedSongIds = new Set(),
  onPlaySong,
  onToggleLike,
  onNavigateToProfile,
  onNavigateToSong,
  onNavigateToCreate,
}) => {
  const { token, isAuthenticated } = useAuth();
  const { t } = useI18n();
  const [songs, setSongs] = useState<FeedSong[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [safetyMessage, setSafetyMessage] = useState<string | null>(null);
  const [safetyError, setSafetyError] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [reportingSong, setReportingSong] = useState<FeedSong | null>(null);
  const [reportReason, setReportReason] = useState('spam');
  const [submittingReport, setSubmittingReport] = useState(false);
  const [blockingCreatorId, setBlockingCreatorId] = useState<string | null>(null);

  const loadFeed = useCallback(async (offset = 0, mode: 'initial' | 'refresh' = 'initial') => {
    const isFirstPage = offset === 0;
    if (isFirstPage && mode === 'refresh') setRefreshing(true);
    else if (isFirstPage) setLoading(true);
    else setLoadingMore(true);
    setError(null);
    setSafetyMessage(null);
    setSafetyError(null);

    try {
      const response = await socialApi.getFeed({ limit: PAGE_SIZE, offset, token });
      const nextSongs = response.items.map(toSong);
      setSongs(prev => isFirstPage ? nextSongs : [...prev, ...nextSongs]);
      setNextOffset(response.pagination.nextOffset);
    } catch (feedError) {
      console.error('Failed to load feed:', feedError);
      setError(t('feedLoadFailed'));
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [token, t]);

  useEffect(() => {
    loadFeed(0, 'initial');
  }, [loadFeed]);

  const handleToggleLike = (songId: string) => {
    if (!isAuthenticated) return;
    onToggleLike?.(songId);
    setSongs(prev => prev.map(song => {
      if (song.id !== songId) return song;
      const wasLiked = likedSongIds.has(songId) || song.isLiked;
      return {
        ...song,
        isLiked: !wasLiked,
        likeCount: Math.max(0, (song.likeCount || 0) + (wasLiked ? -1 : 1)),
      };
    }));
  };

  const submitReport = async () => {
    if (!reportingSong || !token || submittingReport) return;
    setSubmittingReport(true);
    setSafetyError(null);
    try {
      await socialApi.report({
        targetType: 'song',
        targetId: reportingSong.id,
        reason: reportReason,
      }, token);
      setReportingSong(null);
      setReportReason('spam');
      setSafetyMessage(t('reportSent'));
    } catch (reportError) {
      console.error('Failed to report song:', reportError);
      setSafetyError(t('reportFailed'));
    } finally {
      setSubmittingReport(false);
    }
  };

  const blockCreator = async (song: FeedSong) => {
    if (!song.creator || !token || blockingCreatorId) return;
    setBlockingCreatorId(song.id);
    setSafetyError(null);
    try {
      await socialApi.blockUser(song.creator, token);
      setSongs(prev => prev.filter(item => song.userId ? item.userId !== song.userId : item.creator !== song.creator));
      setSafetyMessage(t('creatorBlocked'));
    } catch (blockError) {
      console.error('Failed to block creator:', blockError);
      setSafetyError(t('blockFailed'));
    } finally {
      setBlockingCreatorId(null);
      setOpenMenuId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-50 dark:bg-black text-zinc-500 dark:text-zinc-400">
        <Loader2 size={18} className="animate-spin mr-2" />
        {t('loadingFeed')}
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-y-auto bg-zinc-50 dark:bg-black pb-24 lg:pb-32">
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-5 md:py-8">
        <div className="flex items-center justify-between gap-4 mb-5">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-zinc-900 dark:text-white">{t('feed')}</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">{t('feedSubtitle')}</p>
          </div>
          <button
            onClick={() => loadFeed(0, 'refresh')}
            disabled={refreshing || loadingMore}
            className="w-10 h-10 rounded-full border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white flex items-center justify-center transition-colors disabled:opacity-60"
            title={t('refresh')}
          >
            <RefreshCw size={17} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>

        {error && (
          <div className="border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300 rounded-lg px-4 py-3 text-sm mb-4">
            {error}
          </div>
        )}
        {safetyMessage && (
          <div className="border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 rounded-lg px-4 py-3 text-sm mb-4">
            {safetyMessage}
          </div>
        )}
        {safetyError && !reportingSong && (
          <div className="border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300 rounded-lg px-4 py-3 text-sm mb-4">
            {safetyError}
          </div>
        )}

        {songs.length === 0 ? (
          <EmptyState
            icon={<Music2 size={22} />}
            title={t('feedEmpty')}
            body={t('feedEmptyBody')}
            actionLabel={onNavigateToCreate ? t('createFirstSong') : undefined}
            onAction={onNavigateToCreate}
          />
        ) : (
          <div className="space-y-4">
            {songs.map(song => {
              const active = currentSong?.id === song.id;
              const liked = likedSongIds.has(song.id) || Boolean(song.isLiked);

              return (
                <article key={song.id} className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-white/10 rounded-lg overflow-hidden">
                  <div className="p-4 flex items-start gap-3">
                    <button
                      onClick={() => song.creator && onNavigateToProfile?.(song.creator)}
                      className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center text-white font-bold overflow-hidden flex-shrink-0"
                      title={song.creator || t('anonymous')}
                    >
                      {song.creator_avatar ? (
                        <img src={song.creator_avatar} alt={song.creator || t('creator')} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                      ) : (
                        song.creator?.[0]?.toUpperCase() || <UserRound size={18} />
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <button
                        onClick={() => song.creator && onNavigateToProfile?.(song.creator)}
                        className="text-sm font-semibold text-zinc-900 dark:text-white hover:underline"
                      >
                        {song.creator || t('anonymous')}
                      </button>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400">
                        {song.createdAt.toLocaleDateString()}
                      </div>
                    </div>
                    <div className="relative">
                      <button
                        onClick={() => setOpenMenuId(openMenuId === song.id ? null : song.id)}
                        className="w-8 h-8 rounded-full hover:bg-zinc-100 dark:hover:bg-white/10 flex items-center justify-center text-zinc-500 dark:text-zinc-400"
                        title={t('more')}
                      >
                        <MoreHorizontal size={18} />
                      </button>
                      {openMenuId === song.id && (
                        <div className="absolute right-0 top-9 z-20 w-44 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900 shadow-xl py-1">
                          {token ? (
                            <>
                              <button
                                onClick={() => {
                                  setReportingSong(song);
                                  setOpenMenuId(null);
                                }}
                                className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/10 flex items-center gap-2"
                              >
                                <AlertTriangle size={14} />
                                {t('reportSong')}
                              </button>
                              {song.creator && (
                                <button
                                  onClick={() => blockCreator(song)}
                                  disabled={blockingCreatorId === song.id}
                                  className="w-full px-3 py-2 text-left text-sm text-red-600 dark:text-red-300 hover:bg-red-500/10 flex items-center gap-2 disabled:opacity-60"
                                >
                                  {blockingCreatorId === song.id ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />}
                                  {t('blockCreator')}
                                </button>
                              )}
                            </>
                          ) : (
                            <div className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">
                              {t('signInToReport')}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="px-4 pb-4">
                    <div className="flex gap-4">
                      <button
                        onClick={() => onPlaySong?.(song, songs)}
                        className="relative w-28 h-28 sm:w-36 sm:h-36 rounded-lg overflow-hidden flex-shrink-0 bg-zinc-200 dark:bg-zinc-800"
                      >
                        <img src={song.coverUrl} alt={song.title} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                        <span className="absolute inset-0 bg-black/35 flex items-center justify-center">
                          <span className="w-11 h-11 rounded-full bg-white text-black flex items-center justify-center shadow-lg">
                            <Play size={20} className="ml-0.5 fill-current" />
                          </span>
                        </span>
                        {active && isPlaying && (
                          <span className="absolute left-2 bottom-2 px-2 py-1 rounded-full bg-pink-600 text-white text-[10px] font-semibold">
                            {t('nowPlaying')}
                          </span>
                        )}
                      </button>
                      <div className="min-w-0 flex-1">
                        <button
                          onClick={() => onNavigateToSong?.(song.id)}
                          className="text-left text-lg font-bold text-zinc-900 dark:text-white hover:underline line-clamp-2"
                        >
                          {song.title}
                        </button>
                        <p className="text-sm text-zinc-600 dark:text-zinc-300 mt-1 line-clamp-2">
                          {song.style}
                        </p>
                        <div className="flex items-center gap-2 mt-4">
                          <button
                            onClick={() => handleToggleLike(song.id)}
                            className={`h-9 px-3 rounded-full flex items-center gap-2 text-sm font-semibold transition-colors ${liked ? 'bg-pink-600 text-white' : 'bg-zinc-100 dark:bg-white/10 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-white/15'}`}
                          >
                            <Heart size={16} className={liked ? 'fill-current' : ''} />
                            {song.likeCount || 0}
                          </button>
                          <button
                            onClick={() => onNavigateToSong?.(song.id)}
                            className="h-9 px-3 rounded-full flex items-center gap-2 text-sm font-semibold bg-zinc-100 dark:bg-white/10 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-white/15 transition-colors"
                          >
                            <MessageCircle size={16} />
                            {song.commentCount || 0}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {nextOffset !== null && songs.length > 0 && (
          <div className="flex justify-center mt-6">
            <button
              onClick={() => loadFeed(nextOffset)}
              disabled={loadingMore}
              className="px-5 py-2.5 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-black font-semibold text-sm disabled:opacity-60 flex items-center gap-2"
            >
              {loadingMore && <Loader2 size={16} className="animate-spin" />}
              {t('loadMore')}
            </button>
          </div>
        )}
      </div>

      {reportingSong && (
        <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-center justify-center px-4">
          <div className="w-full max-w-sm bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-white/10 rounded-lg p-5 shadow-2xl">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white mb-3">{t('reportSong')}</h2>
            <select
              value={reportReason}
              onChange={(event) => setReportReason(event.target.value)}
              disabled={submittingReport}
              className="w-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-white mb-4"
            >
              <option value="spam">{t('reportSpam')}</option>
              <option value="abuse">{t('reportAbuse')}</option>
              <option value="copyright">{t('reportCopyright')}</option>
              <option value="other">{t('reportOther')}</option>
            </select>
            {safetyError && (
              <div className="border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300 rounded-lg px-3 py-2 text-sm mb-4">
                {safetyError}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setReportingSong(null)}
                disabled={submittingReport}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10"
              >
                {t('cancel')}
              </button>
              <button
                onClick={() => void submitReport()}
                disabled={!token || submittingReport}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 flex items-center gap-2"
              >
                {submittingReport && <Loader2 size={16} className="animate-spin" />}
                {t('submitReport')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
