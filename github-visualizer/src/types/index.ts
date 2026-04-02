export interface GitHubRepo {
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  default_branch: string;
  owner: {
    login: string;
    avatar_url: string;
  };
}

export interface GitHubLanguages {
  [language: string]: number;
}

export interface TreeNode {
  path: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
}

export interface NestedNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children: NestedNode[];
  size?: number;
  extension?: string;
}

export interface GraphNode {
  id: string;
  label: string;
  directory: string;
  extension: string;
  importCount: number;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface GraphFilter {
  extensions: string[];
  hideIsolated: boolean;
  maxNodes: number;
}

export interface RateLimitInfo {
  remaining: number;
  limit: number;
  reset: Date | null;
}

export interface GitHubBranch {
  name: string;
  commit: {
    sha: string;
    url: string;
  };
  protected: boolean;
}

export interface GitHubCommit {
  sha: string;
  commit: {
    message: string;
    author: {
      name: string;
      date: string;
    };
  };
  author: {
    login: string;
    avatar_url: string;
  } | null;
  parents: { sha: string }[];
}

export type AppStatus = 'idle' | 'loading' | 'success' | 'error';
export type ActiveTab = 'tree' | 'graph' | 'branches';
