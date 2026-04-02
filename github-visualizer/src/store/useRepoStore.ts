import { create } from 'zustand';
import type {
  GitHubRepo,
  GitHubLanguages,
  TreeNode,
  NestedNode,
  GraphNode,
  GraphEdge,
  GraphFilter,
  RateLimitInfo,
  AppStatus,
  ActiveTab,
} from '@/types/index.ts';
import type { AIModel } from '@/services/aiAnalysis.ts';
import { getProviderForModel } from '@/services/aiAnalysis.ts';
import {
  parseRepoUrl,
  fetchRepoInfo,
  fetchRepoLanguages,
  fetchRepoTree,
  fetchFileContent,
  getRateLimit,
} from '@/services/github.ts';
import { parseImports } from '@/services/fileParser.ts';
import { buildGraph } from '@/services/graphBuilder.ts';
import { getExtension } from '@/utils/fileIcons.ts';

function buildNestedTree(flatTree: TreeNode[]): NestedNode {
  const root: NestedNode = {
    name: '/',
    path: '',
    type: 'directory',
    children: [],
  };

  const dirMap = new Map<string, NestedNode>();
  dirMap.set('', root);

  const sorted = [...flatTree].sort((a, b) => a.path.localeCompare(b.path));

  for (const node of sorted) {
    const parts = node.path.split('/');
    const name = parts[parts.length - 1];
    const parentPath = parts.slice(0, -1).join('/');

    let parent = dirMap.get(parentPath);
    if (!parent) {
      parent = root;
    }

    if (node.type === 'tree') {
      const dirNode: NestedNode = {
        name,
        path: node.path,
        type: 'directory',
        children: [],
      };
      parent.children.push(dirNode);
      dirMap.set(node.path, dirNode);
    } else {
      parent.children.push({
        name,
        path: node.path,
        type: 'file',
        children: [],
        size: node.size,
        extension: getExtension(name),
      });
    }
  }

  for (const dir of dirMap.values()) {
    dir.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  return root;
}

interface RepoStore {
  repoUrl: string;
  token: string;
  status: AppStatus;
  error: string | null;

  repoInfo: GitHubRepo | null;
  languages: GitHubLanguages | null;
  tree: TreeNode[];
  nestedTree: NestedNode | null;

  activeTab: ActiveTab;
  selectedFile: string | null;
  openFolders: Set<string>;
  fileContents: Map<string, string>;
  loadingFiles: Set<string>;

  graphNodes: GraphNode[];
  graphEdges: GraphEdge[];
  graphFilter: GraphFilter;

  rateLimit: RateLimitInfo;

  darkMode: boolean;
  showConfig: boolean;
  branch: string;

  aiApiKey: string;
  aiModel: AIModel;
  anthropicKey: string;
  openaiKey: string;

  setRepoUrl: (url: string) => void;
  setToken: (token: string) => void;
  setActiveTab: (tab: ActiveTab) => void;
  setSelectedFile: (path: string | null) => void;
  toggleFolder: (path: string) => void;
  setGraphFilter: (filter: Partial<GraphFilter>) => void;
  toggleDarkMode: () => void;
  toggleShowConfig: () => void;
  setBranch: (branch: string) => void;
  setAiApiKey: (key: string) => void;
  setAiModel: (model: AIModel) => void;
  setAnthropicKey: (key: string) => void;
  setOpenaiKey: (key: string) => void;
  getActiveAiKey: () => string;

  loadRepo: () => Promise<void>;
  loadFileContent: (path: string) => Promise<void>;
  buildDependencyGraph: () => Promise<void>;
}

export const useRepoStore = create<RepoStore>((set, get) => ({
  repoUrl: '',
  token: localStorage.getItem('gh_token') || import.meta.env.VITE_GITHUB_TOKEN || '',
  status: 'idle',
  error: null,

  repoInfo: null,
  languages: null,
  tree: [],
  nestedTree: null,

  activeTab: 'tree',
  selectedFile: null,
  openFolders: new Set<string>(),
  fileContents: new Map<string, string>(),
  loadingFiles: new Set<string>(),

  graphNodes: [],
  graphEdges: [],
  graphFilter: {
    extensions: [],
    hideIsolated: false,
    maxNodes: 100,
  },

  rateLimit: { remaining: 60, limit: 60, reset: null },

  darkMode: localStorage.getItem('darkMode') === 'true',
  showConfig: true,
  branch: '',

  anthropicKey: localStorage.getItem('anthropic_api_key') || import.meta.env.VITE_ANTHROPIC_API_KEY || '',
  openaiKey: localStorage.getItem('openai_api_key') || import.meta.env.VITE_OPENAI_API_KEY || '',
  aiApiKey: localStorage.getItem('ai_api_key') || '',
  aiModel: (localStorage.getItem('ai_model') as AIModel) || 'claude-sonnet-4-6',

  setRepoUrl: (url) => set({ repoUrl: url }),
  setToken: (token) => {
    localStorage.setItem('gh_token', token);
    set({ token });
  },
  setActiveTab: (tab) => set({ activeTab: tab }),
  setSelectedFile: (path) => set({ selectedFile: path }),
  toggleFolder: (path) =>
    set((state) => {
      const next = new Set(state.openFolders);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return { openFolders: next };
    }),
  setGraphFilter: (filter) =>
    set((state) => ({
      graphFilter: { ...state.graphFilter, ...filter },
    })),
  toggleDarkMode: () =>
    set((state) => {
      const next = !state.darkMode;
      localStorage.setItem('darkMode', String(next));
      return { darkMode: next };
    }),
  toggleShowConfig: () => set((state) => ({ showConfig: !state.showConfig })),
  setBranch: (branch) => set({ branch }),
  setAiApiKey: (key) => {
    localStorage.setItem('ai_api_key', key);
    set({ aiApiKey: key });
  },
  setAiModel: (model) => {
    localStorage.setItem('ai_model', model);
    set({ aiModel: model });
  },
  setAnthropicKey: (key) => {
    localStorage.setItem('anthropic_api_key', key);
    set({ anthropicKey: key });
  },
  setOpenaiKey: (key) => {
    localStorage.setItem('openai_api_key', key);
    set({ openaiKey: key });
  },
  getActiveAiKey: () => {
    const { aiModel, anthropicKey, openaiKey, aiApiKey } = get();
    const provider = getProviderForModel(aiModel);
    if (provider === 'claude' && anthropicKey) return anthropicKey;
    if (provider === 'openai' && openaiKey) return openaiKey;
    return aiApiKey;
  },

  loadRepo: async () => {
    const { repoUrl, token } = get();
    const parsed = parseRepoUrl(repoUrl);
    if (!parsed) {
      set({ error: 'Invalid GitHub URL. Use format: github.com/owner/repo', status: 'error' });
      return;
    }

    set({
      status: 'loading',
      error: null,
      repoInfo: null,
      tree: [],
      nestedTree: null,
      selectedFile: null,
      fileContents: new Map(),
      graphNodes: [],
      graphEdges: [],
      openFolders: new Set(),
    });

    try {
      const [repoInfo, languages] = await Promise.all([
        fetchRepoInfo(parsed.owner, parsed.repo, token || undefined),
        fetchRepoLanguages(parsed.owner, parsed.repo, token || undefined),
      ]);

      const branch = get().branch || repoInfo.default_branch;
      const tree = await fetchRepoTree(parsed.owner, parsed.repo, branch, token || undefined);
      const nestedTree = buildNestedTree(tree);

      set({
        repoInfo,
        languages,
        tree,
        nestedTree,
        branch,
        status: 'success',
        rateLimit: getRateLimit(),
      });
    } catch (err) {
      set({
        status: 'error',
        error: err instanceof Error ? err.message : 'Unknown error occurred',
        rateLimit: getRateLimit(),
      });
    }
  },

  loadFileContent: async (path: string) => {
    const { fileContents, repoInfo, token, loadingFiles } = get();
    if (fileContents.has(path) || !repoInfo) return;
    if (loadingFiles.has(path)) return;

    set((state) => {
      const next = new Set(state.loadingFiles);
      next.add(path);
      return { loadingFiles: next };
    });

    try {
      const parsed = parseRepoUrl(get().repoUrl);
      if (!parsed) return;

      const content = await fetchFileContent(parsed.owner, parsed.repo, path, token || undefined);

      set((state) => {
        const nextContents = new Map(state.fileContents);
        nextContents.set(path, content);
        const nextLoading = new Set(state.loadingFiles);
        nextLoading.delete(path);
        return {
          fileContents: nextContents,
          loadingFiles: nextLoading,
          rateLimit: getRateLimit(),
        };
      });
    } catch (err) {
      set((state) => {
        const nextLoading = new Set(state.loadingFiles);
        nextLoading.delete(path);
        return { loadingFiles: nextLoading };
      });
      console.error(`Failed to load file: ${path}`, err);
    }
  },

  buildDependencyGraph: async () => {
    const { tree, repoInfo, token, graphFilter } = get();
    if (!repoInfo) return;

    const parsed = parseRepoUrl(get().repoUrl);
    if (!parsed) return;

    const codeFiles = tree
      .filter((n) => n.type === 'blob')
      .map((n) => n.path)
      .filter((p) => /\.(ts|tsx|js|jsx|py|css|scss)$/.test(p));

    const allFileSet = new Set(tree.filter((n) => n.type === 'blob').map((n) => n.path));
    const filesToParse = codeFiles.slice(0, graphFilter.maxNodes);

    const allEdges: { source: string; target: string }[] = [];

    const batchSize = 5;
    for (let i = 0; i < filesToParse.length; i += batchSize) {
      const batch = filesToParse.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(async (filePath) => {
          try {
            const content = await fetchFileContent(
              parsed.owner,
              parsed.repo,
              filePath,
              token || undefined
            );
            return parseImports(filePath, content, allFileSet);
          } catch {
            return [];
          }
        })
      );

      for (const imports of results) {
        allEdges.push(...imports);
      }

      set({ rateLimit: getRateLimit() });
    }

    const { nodes, edges } = buildGraph({
      edges: allEdges,
      filePaths: codeFiles,
    });

    set({ graphNodes: nodes, graphEdges: edges });
  },
}));
