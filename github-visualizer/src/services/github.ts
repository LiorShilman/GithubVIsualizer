import type { GitHubRepo, GitHubLanguages, TreeNode, RateLimitInfo, GitHubBranch, GitHubCommit, GitHubContributor, CommitDetail } from '@/types/index.ts';
import { parseRateLimitHeaders } from '@/utils/rateLimit.ts';

const BASE_URL = 'https://api.github.com';

let latestRateLimit: RateLimitInfo = { remaining: 60, limit: 60, reset: null };

export function getRateLimit(): RateLimitInfo {
  return latestRateLimit;
}

function getHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function fetchGitHub<T>(path: string, token?: string): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: getHeaders(token),
  });

  latestRateLimit = parseRateLimitHeaders(response.headers);

  if (!response.ok) {
    if (response.status === 403 && latestRateLimit.remaining === 0) {
      throw new Error(
        `Rate limit exceeded. Resets at ${latestRateLimit.reset?.toLocaleTimeString() || 'unknown'}`
      );
    }
    if (response.status === 404) {
      throw new Error('Repository not found. Check the URL and ensure the repo is public.');
    }
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

export function parseRepoUrl(url: string): { owner: string; repo: string } | null {
  const cleaned = url.trim().replace(/\/$/, '');
  const patterns = [
    /github\.com\/([^/]+)\/([^/]+)/,
    /^([^/]+)\/([^/]+)$/,
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match) {
      return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
    }
  }
  return null;
}

export async function fetchRepoInfo(owner: string, repo: string, token?: string): Promise<GitHubRepo> {
  return fetchGitHub<GitHubRepo>(`/repos/${owner}/${repo}`, token);
}

export async function fetchRepoLanguages(owner: string, repo: string, token?: string): Promise<GitHubLanguages> {
  return fetchGitHub<GitHubLanguages>(`/repos/${owner}/${repo}/languages`, token);
}

interface TreeResponse {
  sha: string;
  tree: TreeNode[];
  truncated: boolean;
}

export async function fetchRepoTree(
  owner: string,
  repo: string,
  branch: string,
  token?: string
): Promise<TreeNode[]> {
  const data = await fetchGitHub<TreeResponse>(
    `/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
    token
  );
  return data.tree;
}

interface ContentResponse {
  content: string;
  encoding: string;
}

export async function fetchBranches(
  owner: string,
  repo: string,
  token?: string
): Promise<GitHubBranch[]> {
  return fetchGitHub<GitHubBranch[]>(`/repos/${owner}/${repo}/branches?per_page=100`, token);
}

export async function fetchBranchCommits(
  owner: string,
  repo: string,
  branch: string,
  token?: string,
  perPage = 40
): Promise<GitHubCommit[]> {
  return fetchGitHub<GitHubCommit[]>(
    `/repos/${owner}/${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=${perPage}`,
    token
  );
}

export async function fetchContributors(
  owner: string,
  repo: string,
  token?: string
): Promise<GitHubContributor[]> {
  return fetchGitHub<GitHubContributor[]>(
    `/repos/${owner}/${repo}/contributors?per_page=100`,
    token
  );
}

export async function fetchCommitDetail(
  owner: string,
  repo: string,
  sha: string,
  token?: string
): Promise<CommitDetail> {
  return fetchGitHub<CommitDetail>(
    `/repos/${owner}/${repo}/commits/${sha}`,
    token
  );
}

export interface GitHubUserRepo {
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  updated_at: string;
  fork: boolean;
  private: boolean;
  owner: {
    login: string;
    avatar_url: string;
  };
}

export async function fetchUserRepos(
  username: string,
  token?: string,
  page = 1,
  perPage = 100
): Promise<GitHubUserRepo[]> {
  // If we have a token, try authenticated endpoint first (includes private repos)
  if (token) {
    try {
      const allRepos = await fetchGitHub<GitHubUserRepo[]>(
        `/user/repos?per_page=${perPage}&page=${page}&sort=updated&direction=desc&affiliation=owner`,
        token
      );
      // Filter to only repos owned by this user
      return allRepos.filter((r) => r.owner.login.toLowerCase() === username.toLowerCase());
    } catch {
      // Fall back to public endpoint
    }
  }
  return fetchGitHub<GitHubUserRepo[]>(
    `/users/${username}/repos?per_page=${perPage}&page=${page}&sort=updated&direction=desc`,
    token
  );
}

export async function fetchFileContent(
  owner: string,
  repo: string,
  path: string,
  token?: string
): Promise<string> {
  const data = await fetchGitHub<ContentResponse>(
    `/repos/${owner}/${repo}/contents/${path}`,
    token
  );

  if (data.encoding === 'base64') {
    const binary = atob(data.content.replace(/\n/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  }
  return data.content;
}

/* ─── Pulse data ─── */

export interface GitHubPR {
  number: number;
  title: string;
  state: string;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  draft: boolean;
  user: { login: string; avatar_url: string };
  labels: { name: string; color: string }[];
  head: { ref: string };
  base: { ref: string };
  review_comments: number;
  comments: number;
  additions: number;
  deletions: number;
  changed_files: number;
}

export interface GitHubIssue {
  number: number;
  title: string;
  state: string;
  created_at: string;
  updated_at: string;
  user: { login: string; avatar_url: string };
  labels: { name: string; color: string }[];
  comments: number;
  pull_request?: unknown;
}

export interface GitHubRelease {
  tag_name: string;
  name: string;
  published_at: string;
  prerelease: boolean;
  draft: boolean;
  author: { login: string; avatar_url: string };
  body: string;
  assets: { name: string; download_count: number; size: number }[];
}

export async function fetchPullRequests(
  owner: string, repo: string, token?: string, state: 'open' | 'closed' | 'all' = 'all'
): Promise<GitHubPR[]> {
  return fetchGitHub<GitHubPR[]>(
    `/repos/${owner}/${repo}/pulls?state=${state}&sort=updated&direction=desc&per_page=50`,
    token
  );
}

export async function fetchIssues(
  owner: string, repo: string, token?: string, state: 'open' | 'closed' | 'all' = 'all'
): Promise<GitHubIssue[]> {
  const all = await fetchGitHub<GitHubIssue[]>(
    `/repos/${owner}/${repo}/issues?state=${state}&sort=updated&direction=desc&per_page=50`,
    token
  );
  // GitHub API returns PRs as issues too — filter them out
  return all.filter((i) => !i.pull_request);
}

export async function fetchReleases(
  owner: string, repo: string, token?: string
): Promise<GitHubRelease[]> {
  return fetchGitHub<GitHubRelease[]>(
    `/repos/${owner}/${repo}/releases?per_page=10`,
    token
  );
}

/* ─── Statistics API (for Insights) ─── */

// [day, hour, commits] — day 0=Sun
export type PunchCardEntry = [number, number, number];

// [unix_timestamp, additions, deletions] per week
export type CodeFreqEntry = [number, number, number];

export interface WeeklyActivity {
  days: number[]; // Sun–Sat commit counts
  total: number;
  week: number;   // Unix timestamp
}

export interface ContributorStats {
  author: { login: string; avatar_url: string };
  total: number;
  weeks: { w: number; a: number; d: number; c: number }[];
}

export async function fetchPunchCard(owner: string, repo: string, token?: string): Promise<PunchCardEntry[]> {
  return fetchGitHub<PunchCardEntry[]>(`/repos/${owner}/${repo}/stats/punch_card`, token);
}

export async function fetchCodeFrequency(owner: string, repo: string, token?: string): Promise<CodeFreqEntry[]> {
  return fetchGitHub<CodeFreqEntry[]>(`/repos/${owner}/${repo}/stats/code_frequency`, token);
}

export async function fetchCommitActivity(owner: string, repo: string, token?: string): Promise<WeeklyActivity[]> {
  return fetchGitHub<WeeklyActivity[]>(`/repos/${owner}/${repo}/stats/commit_activity`, token);
}

export async function fetchContributorStats(owner: string, repo: string, token?: string): Promise<ContributorStats[]> {
  return fetchGitHub<ContributorStats[]>(`/repos/${owner}/${repo}/stats/contributors`, token);
}
