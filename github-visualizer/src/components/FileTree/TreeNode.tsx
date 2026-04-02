import { memo } from 'react';
import { ChevronRight, Folder, FolderOpen, FileText } from 'lucide-react';
import type { NestedNode } from '@/types/index.ts';
import { useRepoStore } from '@/store/useRepoStore.ts';
import { getExtensionColor } from '@/utils/fileIcons.ts';
import styles from './FileTree.module.css';

interface TreeNodeProps {
  node: NestedNode;
  depth: number;
}

export const TreeNodeComponent = memo(function TreeNodeComponent({ node, depth }: TreeNodeProps) {
  const selectedFile = useRepoStore((s) => s.selectedFile);
  const openFolders = useRepoStore((s) => s.openFolders);
  const toggleFolder = useRepoStore((s) => s.toggleFolder);
  const setSelectedFile = useRepoStore((s) => s.setSelectedFile);
  const loadFileContent = useRepoStore((s) => s.loadFileContent);

  const isOpen = openFolders.has(node.path);
  const isSelected = selectedFile === node.path;

  const handleClick = () => {
    if (node.type === 'directory') {
      toggleFolder(node.path);
    } else {
      setSelectedFile(node.path);
      loadFileContent(node.path);
    }
  };

  const color = node.extension ? getExtensionColor(node.extension) : undefined;

  return (
    <>
      <div
        className={`${styles.node} ${isSelected ? styles.nodeSelected : ''}`}
        style={{ '--depth': `${depth * 16 + 8}px` } as React.CSSProperties}
        onClick={handleClick}
      >
        {node.type === 'directory' && (
          <ChevronRight
            size={14}
            className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`}
          />
        )}
        <span className={styles.nodeIcon}>
          {node.type === 'directory' ? (
            isOpen ? <FolderOpen size={16} color="#e8a87c" /> : <Folder size={16} color="#e8a87c" />
          ) : (
            <FileText size={16} color={color} />
          )}
        </span>
        <span className={styles.nodeName}>{node.name}</span>
      </div>
      {node.type === 'directory' && isOpen && (
        <>
          {node.children.map((child) => (
            <TreeNodeComponent key={child.path} node={child} depth={depth + 1} />
          ))}
        </>
      )}
    </>
  );
});
