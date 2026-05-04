import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { ideasApi, LyricIdea } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { EmptyState } from './EmptyState';

type DraftState = {
  title: string;
  lyrics: string;
  notes: string;
};

function toDraft(idea?: LyricIdea | null): DraftState {
  return {
    title: idea?.title || '',
    lyrics: idea?.lyrics || '',
    notes: idea?.notes || '',
  };
}

export const IdeasPage: React.FC = () => {
  const { token } = useAuth();
  const { t } = useI18n();
  const [ideas, setIdeas] = useState<LyricIdea[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftState>(() => toDraft());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedIdea = useMemo(
    () => ideas.find((idea) => idea.id === selectedId) ?? null,
    [ideas, selectedId]
  );

  const isDirty = selectedIdea
    ? draft.title !== selectedIdea.title || draft.lyrics !== selectedIdea.lyrics || draft.notes !== selectedIdea.notes
    : false;

  const loadIdeas = useCallback(async () => {
    if (!token) {
      setIdeas([]);
      setSelectedId(null);
      setDraft(toDraft());
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const result = await ideasApi.list(token);
      setIdeas(result.ideas);
      const nextSelected = result.ideas[0] ?? null;
      setSelectedId(nextSelected?.id ?? null);
      setDraft(toDraft(nextSelected));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('ideasLoadFailed'));
    } finally {
      setIsLoading(false);
    }
  }, [t, token]);

  useEffect(() => {
    void loadIdeas();
  }, [loadIdeas]);

  const selectIdea = (idea: LyricIdea) => {
    if (isDirty) {
      setError(t('saveCurrentDraftFirst'));
      return;
    }
    setSelectedId(idea.id);
    setDraft(toDraft(idea));
    setError(null);
  };

  const createIdea = async () => {
    if (!token || isSaving) return;
    if (isDirty) {
      setError(t('saveCurrentDraftFirst'));
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const result = await ideasApi.create({ title: t('newIdeaTitle'), lyrics: '', notes: '' }, token);
      setIdeas(prev => [result.idea, ...prev]);
      setSelectedId(result.idea.id);
      setDraft(toDraft(result.idea));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('ideaCreateFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const saveIdea = async () => {
    if (!token || !selectedIdea || isSaving) return;
    const title = draft.title.trim();
    if (!title) {
      setError(t('ideaTitleRequired'));
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const result = await ideasApi.update(selectedIdea.id, {
        title,
        lyrics: draft.lyrics,
        notes: draft.notes,
      }, token);
      setIdeas(prev => [result.idea, ...prev.filter((idea) => idea.id !== result.idea.id)]);
      setSelectedId(result.idea.id);
      setDraft(toDraft(result.idea));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('ideaSaveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const deleteIdea = async () => {
    if (!token || !selectedIdea || isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      await ideasApi.delete(selectedIdea.id, token);
      const remaining = ideas.filter((idea) => idea.id !== selectedIdea.id);
      const nextSelected = remaining[0] ?? null;
      setIdeas(remaining);
      setSelectedId(nextSelected?.id ?? null);
      setDraft(toDraft(nextSelected));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('ideaDeleteFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  if (!token) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-white p-6 dark:bg-black">
        <EmptyState
          icon={<FileText size={22} />}
          title={t('ideasSignInTitle')}
          body={t('ideasSignInBody')}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-white text-zinc-900 dark:bg-black dark:text-white">
      <div className="flex shrink-0 flex-col gap-4 border-b border-zinc-200 p-4 dark:border-white/10 md:flex-row md:items-center md:justify-between md:px-8 md:py-5">
        <div>
          <h1 className="text-2xl font-bold tracking-normal">{t('ideas')}</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{t('ideasSubtitle')}</p>
        </div>
        <button
          type="button"
          onClick={createIdea}
          disabled={isSaving}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
        >
          {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          {t('newIdea')}
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="max-h-56 shrink-0 overflow-y-auto border-b border-zinc-200 bg-zinc-50 p-3 dark:border-white/10 dark:bg-zinc-950 md:max-h-none md:w-80 md:border-b-0 md:border-r">
          {isLoading ? (
            <div className="flex h-32 items-center justify-center text-sm text-zinc-500 dark:text-zinc-400">
              <Loader2 size={18} className="mr-2 animate-spin" />
              {t('loading')}
            </div>
          ) : ideas.length === 0 ? (
            <EmptyState
              icon={<FileText size={22} />}
              title={t('ideasEmptyTitle')}
              body={t('ideasEmptyBody')}
              actionLabel={t('newIdea')}
              onAction={createIdea}
            />
          ) : (
            <div className="space-y-2">
              {ideas.map((idea) => (
                <button
                  key={idea.id}
                  type="button"
                  onClick={() => selectIdea(idea)}
                  className={`w-full rounded-lg border p-3 text-left transition-colors ${
                    idea.id === selectedId
                      ? 'border-pink-500/70 bg-pink-500/10'
                      : 'border-zinc-200 bg-white hover:border-zinc-300 dark:border-white/10 dark:bg-zinc-900/50 dark:hover:border-white/20'
                  }`}
                >
                  <div className="truncate text-sm font-semibold text-zinc-900 dark:text-white">{idea.title}</div>
                  <div className="mt-1 line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">
                    {idea.lyrics || idea.notes || t('emptyDraft')}
                  </div>
                </button>
              ))}
            </div>
          )}
        </aside>

        <main className="min-h-0 flex-1 overflow-y-auto p-4 md:p-8">
          {!selectedIdea ? (
            <EmptyState
              icon={<FileText size={22} />}
              title={t('ideasEmptyTitle')}
              body={t('ideasEmptyBody')}
              actionLabel={t('newIdea')}
              onAction={createIdea}
            />
          ) : (
            <div className="mx-auto flex max-w-4xl flex-col gap-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  {isDirty ? t('unsavedChanges') : t('saved')}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={deleteIdea}
                    disabled={isSaving}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-600 transition-colors hover:border-rose-300 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:text-zinc-300 dark:hover:border-rose-400/40 dark:hover:text-rose-300"
                  >
                    <Trash2 size={16} />
                    {t('delete')}
                  </button>
                  <button
                    type="button"
                    onClick={saveIdea}
                    disabled={isSaving || !isDirty}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-pink-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-pink-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    {t('saveDraft')}
                  </button>
                </div>
              </div>

              {error && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
                  {error}
                </div>
              )}

              <input
                value={draft.title}
                onChange={(event) => setDraft(prev => ({ ...prev, title: event.target.value }))}
                className="w-full rounded-lg border border-zinc-200 bg-white px-4 py-3 text-xl font-bold text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-pink-500 dark:border-white/10 dark:bg-zinc-900 dark:text-white dark:focus:border-pink-400"
                placeholder={t('ideaTitlePlaceholder')}
              />

              <textarea
                value={draft.lyrics}
                onChange={(event) => setDraft(prev => ({ ...prev, lyrics: event.target.value }))}
                className="min-h-[360px] w-full resize-y rounded-lg border border-zinc-200 bg-white px-4 py-3 font-mono text-sm leading-6 text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-pink-500 dark:border-white/10 dark:bg-zinc-900 dark:text-white dark:focus:border-pink-400"
                placeholder={t('lyricsDraftPlaceholder')}
              />

              <textarea
                value={draft.notes}
                onChange={(event) => setDraft(prev => ({ ...prev, notes: event.target.value }))}
                className="min-h-28 w-full resize-y rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm leading-6 text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-pink-500 dark:border-white/10 dark:bg-zinc-900 dark:text-white dark:focus:border-pink-400"
                placeholder={t('ideaNotesPlaceholder')}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
