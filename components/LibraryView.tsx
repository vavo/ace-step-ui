import React, { useRef, useState } from 'react';
import { Song, Playlist } from '../types';
import { Heart, Plus, Music, Play, MoreHorizontal, Trash2, Upload, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { SongDropdownMenu } from './SongDropdownMenu';
import { ShareModal } from './ShareModal';
import { AlbumCover } from './AlbumCover';
import { useI18n } from '../context/I18nContext';
import { EmptyState } from './EmptyState';

interface LibraryViewProps {
  allSongs: Song[];
  likedSongs: Song[];
  playlists: Playlist[];
  referenceTracks: ReferenceTrack[];
  referenceUploadUsage?: UploadUsage | null;
  onPlaySong: (song: Song, list?: Song[]) => void;
  onCreatePlaylist: () => void;
  onSelectPlaylist: (playlist: Playlist) => void;
  onAddToPlaylist: (song: Song) => void;
  onOpenVideo?: (song: Song) => void;
  onReusePrompt?: (song: Song) => void;
  onDeleteSong?: (song: Song) => void;
  onDeleteReferenceTrack?: (trackId: string) => void;
  onUploadReferenceTrack?: (file: File) => Promise<void>;
  isUploadingReferenceTrack?: boolean;
}

interface ReferenceTrack {
    id: string;
    filename: string;
    storage_key: string;
    duration: number | null;
    file_size_bytes: number | null;
    tags: string[] | null;
    created_at: string;
    audio_url: string;
}

interface UploadUsage {
    usedBytes: number;
    limitBytes: number | null;
    plan: string;
}

export const LibraryView: React.FC<LibraryViewProps> = ({ 
    allSongs,
    likedSongs, 
    playlists, 
    referenceTracks,
    referenceUploadUsage,
    onPlaySong, 
    onCreatePlaylist,
    onSelectPlaylist,
    onAddToPlaylist,
    onOpenVideo,
    onReusePrompt,
    onDeleteSong,
    onDeleteReferenceTrack,
    onUploadReferenceTrack,
    isUploadingReferenceTrack = false,
}) => {
    const { t } = useI18n();
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<'all' | 'playlists' | 'liked' | 'uploads'>('all');
    const [shareModalOpen, setShareModalOpen] = useState(false);
    const [shareSong, setShareSong] = useState<Song | null>(null);
    const uploadInputRef = useRef<HTMLInputElement | null>(null);
    const fallbackUsedBytes = referenceTracks.reduce((total, track) => total + (track.file_size_bytes || 0), 0);
    const usedBytes = referenceUploadUsage?.usedBytes ?? fallbackUsedBytes;
    const limitBytes = referenceUploadUsage?.limitBytes ?? null;
    const isUploadLimitReached = limitBytes !== null && usedBytes >= limitBytes;

    const formatBytes = (bytes?: number | null) => {
        if (!bytes || bytes <= 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unit = 0;
        while (size >= 1024 && unit < units.length - 1) {
            size /= 1024;
            unit += 1;
        }
        return `${size.toFixed(size >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
    };

    const formatMbNumber = (bytes: number) => {
        const mb = bytes / (1024 * 1024);
        return mb >= 10 || Number.isInteger(mb) ? mb.toFixed(0) : mb.toFixed(1);
    };

    const openUploadPicker = () => {
        if (isUploadingReferenceTrack || isUploadLimitReached) return;
        uploadInputRef.current?.click();
    };

    const handleUploadFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = '';
        if (file) {
            void onUploadReferenceTrack?.(file);
        }
    };

    return (
        <>
        <div className="flex-1 bg-white dark:bg-black overflow-y-auto custom-scrollbar p-4 md:p-6 lg:p-10 pb-32 transition-colors duration-300">
             <div className="flex items-center justify-between gap-3 mb-6 md:mb-8">
                <h1 className="text-2xl md:text-3xl font-bold text-zinc-900 dark:text-white">{t('yourLibrary')}</h1>
                <button 
                    onClick={onCreatePlaylist}
                    className="flex items-center gap-2 bg-zinc-900 dark:bg-zinc-800 hover:bg-zinc-800 dark:hover:bg-zinc-700 text-white px-3 md:px-4 py-2 rounded-full font-medium transition-colors shadow-lg shadow-zinc-900/10 dark:shadow-none text-sm"
                >
                    <Plus size={18} />
                    <span className="hidden sm:inline">{t('newPlaylist')}</span>
                </button>
             </div>

             {/* Tabs */}
             <div className="flex items-center gap-4 mb-6 md:mb-8 border-b border-zinc-200 dark:border-white/10 pb-1 overflow-x-auto">
                 <button 
                    onClick={() => setActiveTab('all')}
                    className={`pb-3 text-sm font-bold transition-colors relative whitespace-nowrap ${activeTab === 'all' ? 'text-zinc-900 dark:text-white' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white'}`}
                 >
                    {t('allSongs')}
                    {activeTab === 'all' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-green-500 rounded-full"></div>}
                 </button>
                 <button 
                    onClick={() => setActiveTab('liked')}
                    className={`pb-3 text-sm font-bold transition-colors relative whitespace-nowrap ${activeTab === 'liked' ? 'text-zinc-900 dark:text-white' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white'}`}
                 >
                    {t('likedSongs')}
                    {activeTab === 'liked' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-green-500 rounded-full"></div>}
                 </button>
                 <button 
                    onClick={() => setActiveTab('playlists')}
                    className={`pb-3 text-sm font-bold transition-colors relative whitespace-nowrap ${activeTab === 'playlists' ? 'text-zinc-900 dark:text-white' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white'}`}
                 >
                    {t('playlists')}
                    {activeTab === 'playlists' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-green-500 rounded-full"></div>}
                 </button>
                 <button 
                    onClick={() => setActiveTab('uploads')}
                    className={`pb-3 text-sm font-bold transition-colors relative whitespace-nowrap ${activeTab === 'uploads' ? 'text-zinc-900 dark:text-white' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white'}`}
                 >
                    {t('uploads')}
                    {activeTab === 'uploads' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-green-500 rounded-full"></div>}
                 </button>
             </div>

             {/* Content */}
             {activeTab === 'all' && (
                 <div className="space-y-1">
                    {allSongs.length === 0 ? (
                        <EmptyState
                            icon={<Music size={22} />}
                            title={t('libraryEmptyTitle')}
                            body={t('libraryEmptyBody')}
                        />
                    ) : (
                        allSongs.map((song, idx) => (
                            <div key={song.id} className="group flex items-center gap-4 p-2 rounded hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors" onClick={() => onPlaySong(song, allSongs)}>
                                <span className="text-zinc-400 dark:text-zinc-500 w-6 text-center group-hover:hidden">{idx + 1}</span>
                                <span className="text-zinc-900 dark:text-white w-6 text-center hidden group-hover:block"><Play size={14} fill="currentColor" /></span>
                                
                                {song.coverUrl ? (
                                    <img src={song.coverUrl} className="w-10 h-10 rounded object-cover shadow-sm" alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                                ) : (
                                    <AlbumCover seed={song.id || song.title} size="sm" className="w-10 h-10" />
                                )}
                                
                                <div className="flex-1 min-w-0">
                                    <div className="text-zinc-900 dark:text-white font-medium truncate">{song.title}</div>
                                    <div className="text-zinc-500 dark:text-zinc-400 text-xs">{song.style}</div>
                                </div>
                                
                                <div className="text-zinc-500 dark:text-zinc-400 text-sm font-mono">{song.duration}</div>
                                <div className="relative ml-2">
                                    <button
                                        className="p-2 rounded-full hover:bg-zinc-200 dark:hover:bg-white/5 text-zinc-400 hover:text-black dark:hover:text-white transition-colors"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setShareSong(prev => prev?.id === song.id ? null : song);
                                        }}
                                    >
                                        <MoreHorizontal size={16} />
                                    </button>
                                    <SongDropdownMenu
                                        song={song}
                                        isOpen={shareSong?.id === song.id}
                                        onClose={() => setShareSong(null)}
                                        isOwner={user ? song.userId === user.id : false}
                                        onCreateVideo={() => onOpenVideo?.(song)}
                                        onReusePrompt={() => onReusePrompt?.(song)}
                                        onAddToPlaylist={() => onAddToPlaylist(song)}
                                        onDelete={() => onDeleteSong?.(song)}
                                        onShare={() => {
                                            setShareModalOpen(true);
                                        }}
                                    />
                                </div>
                            </div>
                        ))
                    )}
                 </div>
             )}
             {activeTab === 'liked' && (
                 <div>
                    <div className="bg-gradient-to-b from-indigo-500/10 to-zinc-50 dark:from-indigo-800/50 dark:to-zinc-900/50 p-4 md:p-6 rounded-xl flex flex-col sm:flex-row sm:items-end gap-4 md:gap-6 mb-6 md:mb-8 cursor-pointer hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors group border border-zinc-200 dark:border-white/5" onClick={() => likedSongs.length > 0 && onPlaySong(likedSongs[0], likedSongs)}>
                         <div className="w-24 h-24 md:w-40 md:h-40 bg-gradient-to-br from-indigo-500 to-purple-400 rounded shadow-2xl flex items-center justify-center">
                            <Heart fill="white" size={48} className="text-white md:w-16 md:h-16" />
                         </div>
                         <div className="mb-2">
                             <h2 className="text-sm font-bold uppercase text-zinc-500 dark:text-white mb-2">{t('playlist')}</h2>
                             <h1 className="text-3xl md:text-5xl font-extrabold text-zinc-900 dark:text-white mb-3 md:mb-4">{t('likedSongs')}</h1>
                             <div className="text-sm text-zinc-500 dark:text-zinc-300 font-medium">
                                 {likedSongs.length} {t('songs')}
                             </div>
                         </div>
                         <div className="sm:ml-auto mb-2 opacity-0 group-hover:opacity-100 transition-opacity hidden sm:block">
                             <div className="w-14 h-14 rounded-full bg-green-500 flex items-center justify-center shadow-lg hover:scale-105 transition-transform">
                                <Play fill="black" className="text-black ml-1" size={28} />
                             </div>
                         </div>
                    </div>

                    <div className="space-y-1">
                        {likedSongs.length === 0 ? (
                            <EmptyState
                                icon={<Heart size={22} />}
                                title={t('likedEmptyTitle')}
                                body={t('likedEmptyBody')}
                            />
                        ) : likedSongs.map((song, idx) => (
                            <div key={song.id} className="group flex items-center gap-4 p-2 rounded hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors" onClick={() => onPlaySong(song, likedSongs)}>
                                <span className="text-zinc-400 dark:text-zinc-500 w-6 text-center group-hover:hidden">{idx + 1}</span>
                                <span className="text-zinc-900 dark:text-white w-6 text-center hidden group-hover:block"><Play size={14} fill="currentColor" /></span>
                                
                                {song.coverUrl ? (
                                    <img src={song.coverUrl} className="w-10 h-10 rounded object-cover shadow-sm" alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                                ) : (
                                    <AlbumCover seed={song.id || song.title} size="sm" className="w-10 h-10" />
                                )}
                                
                                <div className="flex-1 min-w-0">
                                    <div className="text-zinc-900 dark:text-white font-medium truncate">{song.title}</div>
                                    <div className="text-zinc-500 dark:text-zinc-400 text-xs">{song.style}</div>
                                </div>
                                
                                <div className="text-zinc-500 dark:text-zinc-400 text-sm font-mono">{song.duration}</div>
                                <div className="text-green-500"><Heart fill="#22c55e" size={16} /></div>
                                <div className="relative ml-2">
                                    <button
                                        className="p-2 rounded-full hover:bg-zinc-200 dark:hover:bg-white/5 text-zinc-400 hover:text-black dark:hover:text-white transition-colors"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setShareSong(prev => prev?.id === song.id ? null : song);
                                        }}
                                    >
                                        <MoreHorizontal size={16} />
                                    </button>
                                    <SongDropdownMenu
                                        song={song}
                                        isOpen={shareSong?.id === song.id}
                                        onClose={() => setShareSong(null)}
                                        isOwner={user ? song.userId === user.id : false}
                                        onCreateVideo={() => onOpenVideo?.(song)}
                                        onReusePrompt={() => onReusePrompt?.(song)}
                                        onAddToPlaylist={() => onAddToPlaylist(song)}
                                        onDelete={() => onDeleteSong?.(song)}
                                        onShare={() => {
                                            setShareModalOpen(true);
                                        }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                 </div>
             )}
             {activeTab === 'playlists' && (
                 playlists.length === 0 ? (
                    <EmptyState
                        icon={<Plus size={22} />}
                        title={t('playlistEmptyTitle')}
                        body={t('playlistEmptyBody')}
                        actionLabel={t('newPlaylist')}
                        onAction={onCreatePlaylist}
                    />
                 ) : (
                 <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
                     {playlists.map((playlist) => (
                         <div key={playlist.id} className="bg-white dark:bg-zinc-900/40 p-4 rounded-lg border border-zinc-200 dark:border-white/5 hover:border-zinc-300 dark:hover:border-white/10 hover:shadow-lg dark:hover:bg-zinc-900 transition-all group cursor-pointer" onClick={() => onSelectPlaylist(playlist)}>
                             <div className="relative aspect-square mb-4 rounded-md overflow-hidden bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                                 {playlist.coverUrl ? (
                                     <img src={playlist.coverUrl} className="w-full h-full object-cover" alt={playlist.name} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                                 ) : (
                                     <AlbumCover seed={playlist.id || playlist.name} size="full" className="w-full h-full" />
                                 )}
                             </div>
                             <h3 className="font-bold text-zinc-900 dark:text-white truncate">{playlist.name}</h3>
                             <p className="text-sm text-zinc-500 dark:text-zinc-400 line-clamp-2">{playlist.description || t('byYou')}</p>
                         </div>
                     ))}
                 </div>
                 )
             )}
             {activeTab === 'uploads' && (
                 <div className="space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-dashed border-zinc-300 dark:border-white/10 bg-zinc-50 dark:bg-zinc-900/40 p-4">
                        <div className="min-w-0">
                            <div className="text-sm font-semibold text-zinc-900 dark:text-white">{t('uploadAudio')}</div>
                            <div className="text-xs text-zinc-500 dark:text-zinc-400">{t('uploadAudioFilesAsReferences')} · {t('audioFormats')}</div>
                            {limitBytes !== null && (
                                <div className="mt-2 max-w-xs">
                                    <div className="mb-1 flex items-center justify-between gap-3 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                                        <span>{formatMbNumber(usedBytes)} / {formatMbNumber(limitBytes)} MBs</span>
                                    </div>
                                    <div className="h-1.5 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden">
                                        <div
                                            className={`h-full rounded-full ${isUploadLimitReached ? 'bg-rose-500' : 'bg-green-500'}`}
                                            style={{ width: `${Math.min(100, (usedBytes / limitBytes) * 100)}%` }}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                        <input
                            ref={uploadInputRef}
                            type="file"
                            accept=".mp3,.wav,.flac,.m4a,.mp4,audio/*"
                            className="hidden"
                            onChange={handleUploadFileChange}
                        />
                        <button
                            type="button"
                            onClick={openUploadPicker}
                            disabled={!onUploadReferenceTrack || isUploadingReferenceTrack || isUploadLimitReached}
                            className="inline-flex items-center justify-center gap-2 rounded-full bg-zinc-900 dark:bg-white px-4 py-2 text-sm font-semibold text-white dark:text-zinc-950 transition-colors hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isUploadingReferenceTrack ? (
                                <>
                                    <Loader2 size={16} className="animate-spin" />
                                    {t('uploadingAudio')}
                                </>
                            ) : (
                                <>
                                    <Upload size={16} />
                                    {t('uploadAudio')}
                                </>
                            )}
                        </button>
                    </div>
                    {referenceTracks.length === 0 ? (
                        <EmptyState
                            icon={<Music size={22} />}
                            title={t('uploadsEmptyTitle')}
                            body={t('uploadsEmptyBody')}
                            actionLabel={t('uploadAudio')}
                            onAction={onUploadReferenceTrack ? openUploadPicker : undefined}
                        />
                    ) : (
                        referenceTracks.map((track) => (
                            <div key={track.id} className="flex items-center gap-4 p-3 rounded-lg border border-zinc-200 dark:border-white/5 bg-white dark:bg-zinc-900/40">
                                <div className="w-10 h-10 rounded bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                                    <Music size={18} className="text-zinc-500 dark:text-zinc-400" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium text-zinc-900 dark:text-white truncate">{track.filename}</div>
                                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                                        {formatBytes(track.file_size_bytes)} • {new Date(track.created_at).toLocaleDateString()}
                                    </div>
                                </div>
                                <button
                                    className="p-2 rounded-full hover:bg-zinc-200 dark:hover:bg-white/5 text-zinc-500 hover:text-red-600 transition-colors"
                                    onClick={() => onDeleteReferenceTrack?.(track.id)}
                                    title={t('deleteUpload')}
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        ))
                    )}
                 </div>
             )}
        </div>
        {shareSong && (
            <ShareModal
                isOpen={shareModalOpen}
                onClose={() => { setShareModalOpen(false); setShareSong(null); }}
                song={shareSong}
            />
        )}
        </>
    );
};
