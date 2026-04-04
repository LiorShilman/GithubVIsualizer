import { useEffect, useState, useRef, useCallback } from 'react';
import { ExternalLink, Loader2, Sparkles, X } from 'lucide-react';
import { codeToHtml } from 'shiki';
import { useRepoStore } from '@/store/useRepoStore.ts';
import { getExtension } from '@/utils/fileIcons.ts';
import { analyzeFullFile } from '@/services/aiAnalysis.ts';
import styles from './FileTree.module.css';

const INITIAL_LINES = 500;

const EXT_TO_LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust',
  css: 'css', scss: 'scss', html: 'html', vue: 'vue',
  json: 'json', md: 'markdown', yml: 'yaml', yaml: 'yaml',
  sh: 'bash', bash: 'bash', zsh: 'bash',
  java: 'java', kt: 'kotlin', swift: 'swift',
  c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp',
  php: 'php', dart: 'dart', lua: 'lua', sql: 'sql',
  toml: 'toml', xml: 'xml', svg: 'xml',
};

export function CodeViewer() {
  const selectedFile = useRepoStore((s) => s.selectedFile);
  const fileContents = useRepoStore((s) => s.fileContents);
  const loadingFiles = useRepoStore((s) => s.loadingFiles);
  const repoInfo = useRepoStore((s) => s.repoInfo);
  const branch = useRepoStore((s) => s.branch);

  const aiModel = useRepoStore((s) => s.aiModel);
  const aiLanguage = useRepoStore((s) => s.aiLanguage);
  const getActiveAiKey = useRepoStore((s) => s.getActiveAiKey);

  const [highlightedHtml, setHighlightedHtml] = useState('');
  const [showAll, setShowAll] = useState(false);
  const codeRef = useRef<HTMLDivElement>(null);

  const [fileAiResult, setFileAiResult] = useState('');
  const [fileAiLoading, setFileAiLoading] = useState(false);
  const [fileAiOpen, setFileAiOpen] = useState(false);
  const [fileAiError, setFileAiError] = useState('');

  const content = selectedFile ? fileContents.get(selectedFile) : undefined;
  const isLoading = selectedFile ? loadingFiles.has(selectedFile) : false;

  useEffect(() => {
    setShowAll(false);
    setHighlightedHtml('');
    setFileAiResult('');
    setFileAiLoading(false);
    setFileAiOpen(false);
    setFileAiError('');
  }, [selectedFile]);

  const handleFileAiExplain = useCallback(async () => {
    if (!content || !selectedFile) return;
    const key = getActiveAiKey();
    if (!key) {
      setFileAiError('Please set an API key in settings first.');
      setFileAiOpen(true);
      return;
    }

    const cacheKey = `ai_file_cache_${selectedFile}_${aiLanguage}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      setFileAiResult(cached);
      setFileAiOpen(true);
      return;
    }

    setFileAiLoading(true);
    setFileAiOpen(true);
    setFileAiResult('');
    setFileAiError('');

    let full = '';
    try {
      await analyzeFullFile(content, selectedFile, key, aiModel, (chunk) => {
        full += chunk;
        setFileAiResult(full);
      }, aiLanguage);
      localStorage.setItem(cacheKey, full);
    } catch (e: unknown) {
      setFileAiError(e instanceof Error ? e.message : 'AI analysis failed');
    } finally {
      setFileAiLoading(false);
    }
  }, [content, selectedFile, aiModel, aiLanguage, getActiveAiKey]);

  useEffect(() => {
    if (!content || !selectedFile) return;

    const lines = content.split('\n');
    const displayContent = showAll ? content : lines.slice(0, INITIAL_LINES).join('\n');
    const ext = getExtension(selectedFile);
    const lang = EXT_TO_LANG[ext] || 'text';

    let cancelled = false;
    codeToHtml(displayContent, {
      lang,
      theme: 'github-dark',
    }).then((html) => {
      if (!cancelled) setHighlightedHtml(html);
    }).catch(() => {
      if (!cancelled) {
        setHighlightedHtml(`<pre><code>${escapeHtml(displayContent)}</code></pre>`);
      }
    });

    return () => { cancelled = true; };
  }, [content, selectedFile, showAll]);

  if (!selectedFile) {
    return (
      <div className={styles.emptyViewer}>
        Select a file to view its contents
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={styles.codeLoading}>
        <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', marginRight: 8 }} />
        Loading file...
      </div>
    );
  }

  if (!content) {
    return (
      <div className={styles.codeLoading}>
        Failed to load file content
      </div>
    );
  }

  const totalLines = content.split('\n').length;
  const isTruncated = !showAll && totalLines > INITIAL_LINES;

  const githubUrl = repoInfo
    ? `${repoInfo.html_url}/blob/${branch}/${selectedFile}`
    : '#';

  return (
    <div className={styles.viewerPanel}>
      <div className={styles.codeHeader}>
        <span className={styles.codeHeaderPath}>{selectedFile}</span>
        <div className={styles.codeHeaderActions}>
          <button
            className={`${styles.fileAiBtn} ${fileAiResult && !fileAiLoading ? styles.fileAiBtnDone : ''}`}
            onClick={handleFileAiExplain}
            disabled={fileAiLoading}
            title="Explain file with AI"
          >
            {fileAiLoading
              ? <Loader2 size={13} className={styles.spinIcon} />
              : <Sparkles size={13} />}
            {fileAiResult && !fileAiLoading ? 'Explained' : 'Explain File'}
          </button>
          <a
            className={styles.githubLink}
            href={githubUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink size={13} /> GitHub
          </a>
        </div>
      </div>

      {fileAiOpen && (
        <div className={styles.fileAiPanel}>
          <div className={styles.fileAiPanelHeader}>
            <Sparkles size={13} />
            AI File Analysis
            <button type="button" className={styles.fileAiCloseBtn} onClick={() => setFileAiOpen(false)} title="Close AI panel">
              <X size={13} />
            </button>
          </div>
          {fileAiError && <div className={styles.fileAiError}>{fileAiError}</div>}
          {fileAiResult && (
            <div
              className={styles.fileAiContent}
              dir={aiLanguage === 'he' ? 'rtl' : 'ltr'}
              dangerouslySetInnerHTML={{
                __html: fileAiResult
                  .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                  .replace(/`([^`]+)`/g, '<code>$1</code>')
                  .replace(/\n/g, '<br/>'),
              }}
            />
          )}
          {fileAiLoading && !fileAiResult && (
            <div className={styles.fileAiLoading}>
              <Loader2 size={16} className={styles.spinIcon} /> Analyzing file...
            </div>
          )}
        </div>
      )}

      <div className={styles.codeContent} ref={codeRef}>
        <div dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
        {isTruncated && (
          <button className={styles.loadMore} onClick={() => setShowAll(true)}>
            Show all {totalLines} lines ({totalLines - INITIAL_LINES} more)
          </button>
        )}
      </div>
    </div>
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
