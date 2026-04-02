import { useMemo, useState, useEffect, useCallback } from 'react';
import { X, Import, FunctionSquare, Type, Box, FileOutput, Variable, Loader2, Sparkles } from 'lucide-react';
import { codeToHtml } from 'shiki';
import { useRepoStore } from '@/store/useRepoStore.ts';
import { getExtensionColor, getExtension } from '@/utils/fileIcons.ts';
import { analyzeCode } from '@/services/aiAnalysis.ts';
import styles from './CodeMap.module.css';

interface CodeMapProps {
  filePath: string;
  onClose: () => void;
}

interface CodeSection {
  type: 'import' | 'type' | 'function' | 'class' | 'variable' | 'export' | 'other';
  name: string;
  signature: string;
  startLine: number;
  endLine: number;
  code: string;
  lineCount: number;
}

const SECTION_CONFIG: Record<CodeSection['type'], { label: string; color: string; icon: typeof Import }> = {
  import:   { label: 'Imports',    color: '#8B5CF6', icon: Import },
  type:     { label: 'Types',      color: '#06B6D4', icon: Type },
  function: { label: 'Functions',  color: '#22C55E', icon: FunctionSquare },
  class:    { label: 'Classes',    color: '#F59E0B', icon: Box },
  variable: { label: 'Variables',  color: '#EC4899', icon: Variable },
  export:   { label: 'Exports',    color: '#3B82F6', icon: FileOutput },
  other:    { label: 'Other',      color: '#6B7280', icon: Box },
};

function findMatchingBrace(lines: string[], startIdx: number): number {
  let depth = 0;
  for (let i = startIdx; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === '{') depth++;
      if (ch === '}') depth--;
    }
    if (depth <= 0 && i > startIdx) return i;
    if (depth <= 0 && i === startIdx && lines[i].includes('{')) return i;
  }
  return lines.length - 1;
}

function findIndentEnd(lines: string[], startIdx: number): number {
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') continue;
    if (!/^\s/.test(line)) return i - 1;
  }
  return lines.length - 1;
}

// Threshold: if a function/component is larger than this, parse its inner members
const DEEP_PARSE_THRESHOLD = 15;

function parseInnerSections(_parentName: string, code: string, startLineOffset: number): CodeSection[] {
  const lines = code.split('\n');
  const inner: CodeSection[] = [];

  // Skip the first line (function signature) and last line (closing brace)
  for (let i = 1; i < lines.length - 1; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) continue;

    // Inner function declaration: function name() or async function name()
    const funcMatch = trimmed.match(/^(?:async\s+)?function\s+(\w+)/);
    if (funcMatch) {
      const end = findMatchingBrace(lines, i);
      const codeLines = lines.slice(i, end + 1);
      inner.push({
        type: 'function',
        name: funcMatch[1],
        signature: trimmed,
        startLine: startLineOffset + i + 1,
        endLine: startLineOffset + end + 1,
        code: codeLines.join('\n'),
        lineCount: codeLines.length,
      });
      i = end;
      continue;
    }

    // Inner const/let arrow functions or callbacks: const name = (...) => { or const name = useCallback(
    const constMatch = trimmed.match(/^const\s+(\w+)\s*=\s*/);
    if (constMatch) {
      const afterEquals = trimmed.slice(trimmed.indexOf('=') + 1).trim();
      const isFunc = /^\(|^async\s*\(|^useCallback|^useMemo|^memo/.test(afterEquals) ||
                     /=>\s*\{?/.test(trimmed) ||
                     /^function/.test(afterEquals);

      if (isFunc || trimmed.includes('{')) {
        let end = i;
        if (trimmed.includes('{')) {
          end = findMatchingBrace(lines, i);
        } else if (trimmed.endsWith(';') || trimmed.endsWith(',')) {
          end = i;
        } else {
          let parenDepth = 0;
          let braceDepth = 0;
          for (let j = i; j < lines.length - 1; j++) {
            for (const ch of lines[j]) {
              if (ch === '(') parenDepth++;
              if (ch === ')') parenDepth--;
              if (ch === '{') braceDepth++;
              if (ch === '}') braceDepth--;
            }
            if (j > i && parenDepth <= 0 && braceDepth <= 0) {
              end = j;
              break;
            }
          }
        }

        const codeLines = lines.slice(i, end + 1);
        inner.push({
          type: isFunc ? 'function' : 'variable',
          name: constMatch[1],
          signature: trimmed,
          startLine: startLineOffset + i + 1,
          endLine: startLineOffset + end + 1,
          code: codeLines.join('\n'),
          lineCount: codeLines.length,
        });
        i = end;
        continue;
      }
    }

    // Hook calls: useEffect(() => { ... }), useMemo(() => { ... })
    const hookMatch = trimmed.match(/^(useEffect|useLayoutEffect|useMemo|useCallback)\s*\(/);
    if (hookMatch) {
      let end = i;
      let parenDepth = 0;
      for (let j = i; j < lines.length - 1; j++) {
        for (const ch of lines[j]) {
          if (ch === '(') parenDepth++;
          if (ch === ')') parenDepth--;
        }
        if (j > i && parenDepth <= 0) {
          end = j;
          break;
        }
      }

      const codeLines = lines.slice(i, end + 1);
      inner.push({
        type: 'function',
        name: hookMatch[1],
        signature: trimmed,
        startLine: startLineOffset + i + 1,
        endLine: startLineOffset + end + 1,
        code: codeLines.join('\n'),
        lineCount: codeLines.length,
      });
      i = end;
      continue;
    }
  }

  return inner;
}

function parseCodeSections(content: string, ext: string): CodeSection[] {
  const lines = content.split('\n');
  const sections: CodeSection[] = [];
  const isJS = ['ts', 'tsx', 'js', 'jsx', 'mjs'].includes(ext);
  const isPy = ext === 'py';

  const used = new Set<number>();

  function addSection(type: CodeSection['type'], name: string, start: number, end: number) {
    const codeLines = lines.slice(start, end + 1);
    const code = codeLines.join('\n');

    // For large functions/components, also parse inner members
    if (type === 'function' && codeLines.length > DEEP_PARSE_THRESHOLD && isJS) {
      const innerSections = parseInnerSections(name, code, start);
      if (innerSections.length > 0) {
        // Add the parent as a "component" header, then add inner sections
        sections.push({
          type,
          name: `${name} (component)`,
          signature: lines[start]?.trim() || '',
          startLine: start + 1,
          endLine: end + 1,
          code,
          lineCount: codeLines.length,
        });
        sections.push(...innerSections);
        for (let i = start; i <= end; i++) used.add(i);
        return;
      }
    }

    sections.push({
      type,
      name,
      signature: lines[start]?.trim() || '',
      startLine: start + 1,
      endLine: end + 1,
      code,
      lineCount: codeLines.length,
    });
    for (let i = start; i <= end; i++) used.add(i);
  }

  if (isJS) {
    // Pass 1: Collect import blocks
    let i = 0;
    while (i < lines.length) {
      const trimmed = lines[i].trim();
      if (/^import\s/.test(trimmed) || /^const\s+\w+\s*=\s*require\(/.test(trimmed)) {
        const importStart = i;
        // Consume consecutive import lines (including multi-line imports)
        while (i < lines.length) {
          const t = lines[i].trim();
          if (i > importStart && /^import\s/.test(t)) {
            // next import line - continue
          } else if (i > importStart && !t) {
            // blank line between imports - check if next non-blank is also import
            let nextNonBlank = i + 1;
            while (nextNonBlank < lines.length && !lines[nextNonBlank].trim()) nextNonBlank++;
            if (nextNonBlank < lines.length && /^import\s/.test(lines[nextNonBlank].trim())) {
              i++;
              continue;
            }
            break;
          } else if (i === importStart) {
            // first line
          } else if (/^\}/.test(t) || /^import\s/.test(t) || /^const\s+\w+\s*=\s*require\(/.test(t)) {
            // closing brace of multi-line import or next require
          } else if (!t.startsWith('import') && !t.startsWith('from') && !t.startsWith('}') && !t.startsWith(',') && !/^\w/.test(t)) {
            // continuation of multi-line import (indented content)
          } else {
            break;
          }
          i++;
        }
        // Back up to last non-blank import line
        let end = i - 1;
        while (end > importStart && !lines[end].trim()) end--;
        addSection('import', 'imports', importStart, end);
      } else {
        i++;
      }
    }

    // Pass 2: Detect all other blocks
    for (i = 0; i < lines.length; i++) {
      if (used.has(i)) continue;
      const trimmed = lines[i].trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) continue;

      // Type/Interface
      const typeMatch = trimmed.match(/^(?:export\s+)?(?:declare\s+)?(interface|type)\s+(\w+)/);
      if (typeMatch) {
        let end = i;
        if (trimmed.includes('{')) {
          end = findMatchingBrace(lines, i);
        } else {
          // type alias on single/multi lines ending with ;
          end = i;
          while (end < lines.length - 1 && !lines[end].trim().endsWith(';')) end++;
        }
        addSection('type', typeMatch[2], i, end);
        i = end;
        continue;
      }

      // Class
      const classMatch = trimmed.match(/^(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+(\w+)/);
      if (classMatch) {
        const end = findMatchingBrace(lines, i);
        addSection('class', classMatch[1], i, end);
        i = end;
        continue;
      }

      // Named export function: export [default] [async] function name
      const exportFuncMatch = trimmed.match(/^export\s+(?:default\s+)?(?:async\s+)?function\s*\*?\s*(\w+)/);
      if (exportFuncMatch) {
        const end = findMatchingBrace(lines, i);
        addSection('function', exportFuncMatch[1], i, end);
        i = end;
        continue;
      }

      // Regular function: [async] function name
      const funcMatch = trimmed.match(/^(?:async\s+)?function\s*\*?\s*(\w+)/);
      if (funcMatch) {
        const end = findMatchingBrace(lines, i);
        addSection('function', funcMatch[1], i, end);
        i = end;
        continue;
      }

      // Arrow function / const assigned to function: [export] const name = ...
      const constFuncMatch = trimmed.match(/^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*(?::\s*[^=]+)?\s*=\s*/);
      if (constFuncMatch) {
        const varName = constFuncMatch[1];
        const afterEquals = trimmed.slice(trimmed.indexOf('=') + 1).trim();
        const isFunc = /^\(|^async\s*\(|^async\s*<|^</.test(afterEquals) ||
                       /=>\s*\{?/.test(trimmed) ||
                       /^\w+\s*\(/.test(afterEquals) || // e.g. create(...)
                       /^function/.test(afterEquals);

        let end = i;
        if (trimmed.includes('{')) {
          end = findMatchingBrace(lines, i);
        } else if (trimmed.endsWith(';') || trimmed.endsWith(',')) {
          end = i;
        } else {
          // Multi-line expression - find the end
          end = i + 1;
          let parenDepth = 0;
          let braceDepth = 0;
          for (let j = i; j < lines.length; j++) {
            for (const ch of lines[j]) {
              if (ch === '(') parenDepth++;
              if (ch === ')') parenDepth--;
              if (ch === '{') braceDepth++;
              if (ch === '}') braceDepth--;
            }
            if (j > i && parenDepth <= 0 && braceDepth <= 0) {
              end = j;
              break;
            }
          }
        }

        const sectionType = isFunc ? 'function' : 'variable';
        addSection(sectionType, varName, i, end);
        i = end;
        continue;
      }

      // Export block: export { ... }
      const exportBlockMatch = /^export\s*\{/.test(trimmed);
      if (exportBlockMatch) {
        let end = i;
        if (trimmed.includes('}')) {
          end = i;
        } else {
          while (end < lines.length - 1 && !lines[end].includes('}')) end++;
        }
        addSection('export', 'exports', i, end);
        i = end;
        continue;
      }

      // Export default expression
      if (/^export\s+default\s/.test(trimmed) && !trimmed.includes('function') && !trimmed.includes('class')) {
        let end = i;
        if (trimmed.includes('{')) {
          end = findMatchingBrace(lines, i);
        } else {
          while (end < lines.length - 1 && !lines[end].trim().endsWith(';')) end++;
        }
        addSection('export', 'default export', i, end);
        i = end;
        continue;
      }

      // Standalone enum
      const enumMatch = trimmed.match(/^(?:export\s+)?(?:const\s+)?enum\s+(\w+)/);
      if (enumMatch) {
        const end = findMatchingBrace(lines, i);
        addSection('type', enumMatch[1], i, end);
        i = end;
        continue;
      }
    }
  }

  if (isPy) {
    let i = 0;

    // Pass 1: imports
    while (i < lines.length) {
      const trimmed = lines[i].trim();
      if (/^(?:from\s|import\s)/.test(trimmed)) {
        const importStart = i;
        i++;
        while (i < lines.length) {
          const t = lines[i].trim();
          if (/^(?:from\s|import\s)/.test(t) || !t) {
            i++;
          } else break;
        }
        let end = i - 1;
        while (end > importStart && !lines[end].trim()) end--;
        addSection('import', 'imports', importStart, end);
      } else {
        i++;
      }
    }

    // Pass 2: classes, functions, variables
    for (i = 0; i < lines.length; i++) {
      if (used.has(i)) continue;
      const trimmed = lines[i].trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const classMatch = trimmed.match(/^class\s+(\w+)/);
      if (classMatch) {
        const end = findIndentEnd(lines, i);
        addSection('class', classMatch[1], i, end);
        i = end;
        continue;
      }

      const funcMatch = trimmed.match(/^(?:async\s+)?def\s+(\w+)/);
      if (funcMatch) {
        const end = findIndentEnd(lines, i);
        addSection('function', funcMatch[1], i, end);
        i = end;
        continue;
      }

      // Top-level variable assignment
      const varMatch = trimmed.match(/^([A-Za-z_]\w*)\s*(?::\s*\w[^=]*)?\s*=/);
      if (varMatch && !/^\s/.test(lines[i])) {
        addSection('variable', varMatch[1], i, i);
        continue;
      }
    }
  }

  // CSS/SCSS
  if (['css', 'scss', 'less'].includes(ext)) {
    for (let i = 0; i < lines.length; i++) {
      if (used.has(i)) continue;
      const trimmed = lines[i].trim();
      if (!trimmed || trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed.startsWith('//')) continue;

      if (trimmed.includes('{')) {
        const name = trimmed.replace(/\s*\{.*/, '').trim() || 'rule';
        const end = findMatchingBrace(lines, i);
        addSection('other', name, i, end);
        i = end;
      }
    }
  }

  // Sort sections by start line
  sections.sort((a, b) => a.startLine - b.startLine);

  return sections;
}

function renderMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^(\d+)\.\s/gm, '<span class="list-num">$1.</span> ')
    .replace(/^- /gm, '<span class="list-bullet">&bull;</span> ')
    .replace(/\n/g, '<br/>');
}

export function CodeMap({ filePath, onClose }: CodeMapProps) {
  const fileContents = useRepoStore((s) => s.fileContents);
  const loadingFiles = useRepoStore((s) => s.loadingFiles);
  const graphEdges = useRepoStore((s) => s.graphEdges);
  const getActiveAiKey = useRepoStore((s) => s.getActiveAiKey);
  const aiModel = useRepoStore((s) => s.aiModel);
  const aiApiKey = getActiveAiKey();

  const [expandedSection, setExpandedSection] = useState<number | null>(null);
  const [highlightedHtml, setHighlightedHtml] = useState<Map<number, string>>(new Map());

  // AI state - load cached results from localStorage
  const [aiSectionIdx, setAiSectionIdx] = useState<number | null>(null);
  const [aiResult, setAiResult] = useState<Map<number, string>>(() => {
    try {
      const cached = localStorage.getItem(`ai_cache_${filePath}`);
      if (cached) {
        const parsed = JSON.parse(cached) as Record<string, string>;
        return new Map(Object.entries(parsed).map(([k, v]) => [Number(k), v]));
      }
    } catch { /* ignore */ }
    return new Map();
  });
  const [aiLoading, setAiLoading] = useState<number | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const content = fileContents.get(filePath);
  const isLoading = loadingFiles.has(filePath);
  const ext = getExtension(filePath);
  const color = getExtensionColor(ext);
  const fileName = filePath.split('/').pop() || filePath;

  const sections = useMemo(() => {
    if (!content) return [];
    return parseCodeSections(content, ext);
  }, [content, ext]);

  const sectionSummary = useMemo(() => {
    const summary: Record<string, number> = {};
    for (const s of sections) {
      summary[s.type] = (summary[s.type] || 0) + 1;
    }
    return summary;
  }, [sections]);

  const importsFrom = useMemo(
    () => graphEdges.filter((e) => e.source === filePath),
    [graphEdges, filePath]
  );

  const importedBy = useMemo(
    () => graphEdges.filter((e) => e.target === filePath),
    [graphEdges, filePath]
  );

  const totalLines = content?.split('\n').length || 0;

  useEffect(() => {
    if (expandedSection === null) return;
    const section = sections[expandedSection];
    if (!section || highlightedHtml.has(expandedSection)) return;

    const EXT_TO_LANG: Record<string, string> = {
      ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
      py: 'python', rb: 'ruby', go: 'go', rs: 'rust',
      css: 'css', scss: 'scss', json: 'json',
    };

    const lang = EXT_TO_LANG[ext] || 'text';
    let cancelled = false;

    codeToHtml(section.code, { lang, theme: 'github-dark' })
      .then((html) => {
        if (!cancelled) {
          setHighlightedHtml((prev) => {
            const next = new Map(prev);
            next.set(expandedSection, html);
            return next;
          });
        }
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [expandedSection, sections, ext, highlightedHtml]);

  // Save AI results to localStorage whenever they change
  const saveAiCache = useCallback((results: Map<number, string>) => {
    try {
      const obj: Record<string, string> = {};
      results.forEach((v, k) => { obj[String(k)] = v; });
      localStorage.setItem(`ai_cache_${filePath}`, JSON.stringify(obj));
    } catch { /* ignore quota errors */ }
  }, [filePath]);

  const handleAiExplain = useCallback(async (sectionIdx: number) => {
    const section = sections[sectionIdx];
    if (!section || !aiApiKey) return;

    if (aiResult.has(sectionIdx)) {
      setAiSectionIdx(sectionIdx);
      return;
    }

    setAiSectionIdx(sectionIdx);
    setAiLoading(sectionIdx);
    setAiError(null);

    let accumulated = '';

    try {
      await analyzeCode(
        section.code,
        section.name,
        SECTION_CONFIG[section.type].label,
        filePath,
        aiApiKey,
        aiModel,
        (chunk) => {
          accumulated += chunk;
          setAiResult((prev) => {
            const next = new Map(prev);
            next.set(sectionIdx, accumulated);
            return next;
          });
        }
      );
      // Save final result to localStorage
      setAiResult((prev) => {
        const next = new Map(prev);
        next.set(sectionIdx, accumulated);
        saveAiCache(next);
        return next;
      });
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI analysis failed');
    } finally {
      setAiLoading(null);
    }
  }, [sections, aiApiKey, aiModel, filePath, aiResult, saveAiCache]);

  if (isLoading) {
    return (
      <div className={styles.overlay}>
        <div className={styles.container}>
          <div className={styles.loading}>
            <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
            Loading file...
          </div>
        </div>
      </div>
    );
  }

  if (!content) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.container} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.fileIcon} style={{ background: color }}>{ext.toUpperCase()}</div>
            <div className={styles.headerInfo}>
              <span className={styles.fileName}>{fileName}</span>
              <span className={styles.filePath}>{filePath}</span>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose}><X size={18} /></button>
        </div>

        {/* Overview bar */}
        <div className={styles.overviewBar}>
          <div className={styles.overviewStats}>
            <span className={styles.overviewStat}>{totalLines} lines</span>
            <span className={styles.overviewStat}>{sections.length} sections</span>
            <span className={styles.overviewStat}>{importsFrom.length} dependencies</span>
            <span className={styles.overviewStat}>{importedBy.length} dependents</span>
          </div>
          <div className={styles.minimap}>
            {sections.map((s, i) => {
              const cfg = SECTION_CONFIG[s.type];
              const widthPct = Math.max((s.lineCount / totalLines) * 100, 2);
              return (
                <div
                  key={i}
                  className={styles.minimapBlock}
                  style={{ width: `${widthPct}%`, background: cfg.color }}
                  title={`${cfg.label}: ${s.name} (${s.lineCount} lines)`}
                />
              );
            })}
          </div>
          <div className={styles.legendRow}>
            {Object.entries(sectionSummary).map(([type, count]) => {
              const cfg = SECTION_CONFIG[type as CodeSection['type']];
              return (
                <span key={type} className={styles.legendItem}>
                  <span className={styles.legendDot} style={{ background: cfg.color }} />
                  {cfg.label} ({count})
                </span>
              );
            })}
          </div>
        </div>

        {/* Sections */}
        <div className={styles.sections}>
          {sections.map((section, i) => {
            const cfg = SECTION_CONFIG[section.type];
            const Icon = cfg.icon;
            const isExpanded = expandedSection === i;
            const hasAiResult = aiResult.has(i);
            const isAiActive = aiSectionIdx === i;
            const isAiLoading = aiLoading === i;

            return (
              <div
                key={i}
                className={`${styles.section} ${isExpanded ? styles.sectionExpanded : ''}`}
                style={{ '--section-color': cfg.color } as React.CSSProperties}
              >
                <div className={styles.sectionHeaderRow}>
                  <button
                    className={styles.sectionHeader}
                    onClick={() => setExpandedSection(isExpanded ? null : i)}
                  >
                    <div className={styles.sectionStripe} />
                    <Icon size={16} className={styles.sectionIcon} />
                    <div className={styles.sectionInfo}>
                      <span className={styles.sectionName}>{section.name}</span>
                      <span className={styles.sectionSignature}>{section.signature}</span>
                    </div>
                    <span className={styles.sectionMeta}>
                      L{section.startLine}–{section.endLine}
                      <span className={styles.sectionLines}>{section.lineCount} lines</span>
                    </span>
                  </button>

                  {aiApiKey && section.type !== 'import' && (
                    <button
                      className={`${styles.aiBtn} ${hasAiResult ? styles.aiBtnDone : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAiExplain(i);
                      }}
                      disabled={isAiLoading}
                      title="Explain with AI"
                    >
                      {isAiLoading ? (
                        <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                      ) : (
                        <Sparkles size={13} />
                      )}
                    </button>
                  )}
                </div>

                {isExpanded && (
                  <div className={styles.sectionCode}>
                    {highlightedHtml.has(i) ? (
                      <div dangerouslySetInnerHTML={{ __html: highlightedHtml.get(i)! }} />
                    ) : (
                      <pre><code>{section.code}</code></pre>
                    )}
                  </div>
                )}

                {isAiActive && (aiResult.has(i) || isAiLoading) && (
                  <div className={styles.aiPanel}>
                    <div className={styles.aiPanelHeader}>
                      <Sparkles size={14} />
                      <span>AI Analysis</span>
                      {isAiLoading && (
                        <Loader2 size={12} style={{ animation: 'spin 1s linear infinite', marginLeft: 4 }} />
                      )}
                      <button
                        className={styles.aiCloseBtn}
                        onClick={() => setAiSectionIdx(null)}
                        title="Close AI analysis"
                      >
                        <X size={12} />
                      </button>
                    </div>
                    <div
                      className={styles.aiContent}
                      dangerouslySetInnerHTML={{
                        __html: renderMarkdown(aiResult.get(i) || ''),
                      }}
                    />
                  </div>
                )}

                {isAiActive && aiError && (
                  <div className={styles.aiError}>
                    {aiError}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
