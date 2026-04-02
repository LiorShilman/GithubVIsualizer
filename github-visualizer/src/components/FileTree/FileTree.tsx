import { useRepoStore } from '@/store/useRepoStore.ts';
import { TreeNodeComponent } from './TreeNode.tsx';
import { CodeViewer } from './CodeViewer.tsx';
import styles from './FileTree.module.css';

export function FileTree() {
  const nestedTree = useRepoStore((s) => s.nestedTree);

  if (!nestedTree) return null;

  return (
    <div className={styles.container}>
      <div className={styles.treePanel}>
        {nestedTree.children.map((child) => (
          <TreeNodeComponent key={child.path} node={child} depth={0} />
        ))}
      </div>
      <CodeViewer />
    </div>
  );
}
