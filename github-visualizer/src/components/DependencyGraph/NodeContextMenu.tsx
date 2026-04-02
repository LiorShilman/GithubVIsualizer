import { useEffect, useRef } from 'react';
import { Code, Eye, GitBranch, ExternalLink, X } from 'lucide-react';
import { useRepoStore } from '@/store/useRepoStore.ts';
import { getExtensionColor, getExtension } from '@/utils/fileIcons.ts';
import type { GraphEdge } from '@/types/index.ts';
import styles from './NodeContextMenu.module.css';

interface NodeContextMenuProps {
  nodeId: string;
  nodeLabel: string;
  position: { x: number; y: number };
  edges: GraphEdge[];
  onClose: () => void;
  onOpenCodeMap: (filePath: string) => void;
}

export function NodeContextMenu({
  nodeId,
  nodeLabel,
  position,
  edges,
  onClose,
  onOpenCodeMap,
}: NodeContextMenuProps) {
  const setActiveTab = useRepoStore((s) => s.setActiveTab);
  const setSelectedFile = useRepoStore((s) => s.setSelectedFile);
  const loadFileContent = useRepoStore((s) => s.loadFileContent);
  const repoInfo = useRepoStore((s) => s.repoInfo);
  const branch = useRepoStore((s) => s.branch);
  const menuRef = useRef<HTMLDivElement>(null);

  const ext = getExtension(nodeLabel);
  const color = getExtensionColor(ext);

  const importsFrom = edges.filter((e) => e.source === nodeId);
  const importedBy = edges.filter((e) => e.target === nodeId);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const handleViewCode = () => {
    setSelectedFile(nodeId);
    loadFileContent(nodeId);
    setActiveTab('tree');
    onClose();
  };

  const handleViewCodeMap = () => {
    loadFileContent(nodeId);
    onOpenCodeMap(nodeId);
    onClose();
  };

  const githubUrl = repoInfo
    ? `${repoInfo.html_url}/blob/${branch}/${nodeId}`
    : '';

  return (
    <div
      ref={menuRef}
      className={styles.menu}
      style={{ left: position.x, top: position.y }}
    >
      <div className={styles.header}>
        <div className={styles.headerIcon} style={{ color }}>
          <Code size={16} />
        </div>
        <div className={styles.headerInfo}>
          <span className={styles.headerName}>{nodeLabel}</span>
          <span className={styles.headerPath}>{nodeId}</span>
        </div>
        <button className={styles.closeBtn} onClick={onClose}>
          <X size={14} />
        </button>
      </div>

      <div className={styles.stats}>
        <div className={styles.statItem}>
          <span className={styles.statValue}>{importsFrom.length}</span>
          <span className={styles.statLabel}>imports</span>
        </div>
        <div className={styles.statDivider} />
        <div className={styles.statItem}>
          <span className={styles.statValue}>{importedBy.length}</span>
          <span className={styles.statLabel}>imported by</span>
        </div>
      </div>

      <div className={styles.actions}>
        <button className={styles.actionBtn} onClick={handleViewCodeMap}>
          <Eye size={16} />
          <div className={styles.actionText}>
            <span className={styles.actionTitle}>File Anatomy</span>
            <span className={styles.actionDesc}>Visual breakdown of the file structure</span>
          </div>
        </button>

        <button className={styles.actionBtn} onClick={handleViewCode}>
          <Code size={16} />
          <div className={styles.actionText}>
            <span className={styles.actionTitle}>View Source Code</span>
            <span className={styles.actionDesc}>Open in the code viewer with syntax highlighting</span>
          </div>
        </button>

        {githubUrl && (
          <a
            className={styles.actionBtn}
            href={githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onClose}
          >
            <ExternalLink size={16} />
            <div className={styles.actionText}>
              <span className={styles.actionTitle}>Open in GitHub</span>
              <span className={styles.actionDesc}>View on github.com</span>
            </div>
          </a>
        )}
      </div>

      {(importsFrom.length > 0 || importedBy.length > 0) && (
        <div className={styles.connections}>
          {importedBy.length > 0 && (
            <div className={styles.connectionGroup}>
              <span className={styles.connectionTitle}>
                <GitBranch size={12} /> Imported by
              </span>
              {importedBy.slice(0, 5).map((e) => (
                <span key={e.source} className={styles.connectionItem}>
                  {e.source.split('/').pop()}
                </span>
              ))}
              {importedBy.length > 5 && (
                <span className={styles.connectionMore}>
                  +{importedBy.length - 5} more
                </span>
              )}
            </div>
          )}
          {importsFrom.length > 0 && (
            <div className={styles.connectionGroup}>
              <span className={styles.connectionTitle}>
                <GitBranch size={12} /> Imports
              </span>
              {importsFrom.slice(0, 5).map((e) => (
                <span key={e.target} className={styles.connectionItem}>
                  {e.target.split('/').pop()}
                </span>
              ))}
              {importsFrom.length > 5 && (
                <span className={styles.connectionMore}>
                  +{importsFrom.length - 5} more
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
