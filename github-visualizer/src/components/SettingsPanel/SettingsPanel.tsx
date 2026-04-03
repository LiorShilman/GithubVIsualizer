import { Settings, Moon, Sun, Brain, FolderGit2 } from 'lucide-react';
import { useState } from 'react';
import { useRepoStore } from '@/store/useRepoStore.ts';
import { AI_MODELS } from '@/services/aiAnalysis.ts';
import type { AIModel, AILanguage } from '@/services/aiAnalysis.ts';
import styles from './SettingsPanel.module.css';

export function SettingsPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const darkMode = useRepoStore((s) => s.darkMode);
  const showConfig = useRepoStore((s) => s.showConfig);
  const graphFilter = useRepoStore((s) => s.graphFilter);
  const aiModel = useRepoStore((s) => s.aiModel);
  const anthropicKey = useRepoStore((s) => s.anthropicKey);
  const openaiKey = useRepoStore((s) => s.openaiKey);
  const toggleDarkMode = useRepoStore((s) => s.toggleDarkMode);
  const toggleShowConfig = useRepoStore((s) => s.toggleShowConfig);
  const setGraphFilter = useRepoStore((s) => s.setGraphFilter);
  const aiLanguage = useRepoStore((s) => s.aiLanguage);
  const githubUser = useRepoStore((s) => s.githubUser);
  const setAiModel = useRepoStore((s) => s.setAiModel);
  const setAiLanguage = useRepoStore((s) => s.setAiLanguage);
  const setAnthropicKey = useRepoStore((s) => s.setAnthropicKey);
  const setOpenaiKey = useRepoStore((s) => s.setOpenaiKey);
  const setGithubUser = useRepoStore((s) => s.setGithubUser);

  const claudeReady = anthropicKey.length > 0;
  const openaiReady = openaiKey.length > 0;

  return (
    <div className={styles.wrapper}>
      <button className={styles.toggleBtn} onClick={() => setIsOpen(!isOpen)} title="Settings">
        <Settings size={18} />
      </button>

      {isOpen && (
        <div className={styles.panel}>
          <h3 className={styles.title}>Settings</h3>

          <div className={styles.option}>
            <label className={styles.label}>Theme</label>
            <button className={styles.themeBtn} onClick={toggleDarkMode}>
              {darkMode ? <Sun size={14} /> : <Moon size={14} />}
              {darkMode ? 'Light' : 'Dark'}
            </button>
          </div>

          <div className={styles.option}>
            <label className={styles.label}>Show config files</label>
            <input
              type="checkbox"
              checked={showConfig}
              onChange={toggleShowConfig}
            />
          </div>

          <div className={styles.option}>
            <label className={styles.label}>
              Max graph nodes: {graphFilter.maxNodes}
            </label>
            <input
              type="range"
              min={20}
              max={200}
              step={10}
              value={graphFilter.maxNodes}
              onChange={(e) =>
                setGraphFilter({ maxNodes: parseInt(e.target.value, 10) })
              }
              className={styles.slider}
            />
          </div>

          <div className={styles.divider} />

          <h3 className={styles.title}>
            <FolderGit2 size={14} />
            GitHub Profile
          </h3>

          <div className={styles.optionCol}>
            <label className={styles.label}>GitHub Username</label>
            <input
              className={styles.apiKeyInput}
              type="text"
              placeholder="e.g. octocat"
              value={githubUser}
              onChange={(e) => setGithubUser(e.target.value.trim())}
            />
            <div className={styles.aiStatus}>
              <span className={`${styles.statusDot} ${githubUser ? styles.statusActive : ''}`} />
              {githubUser ? `Repos for ${githubUser}` : 'Not set'}
            </div>
          </div>

          <div className={styles.divider} />

          <h3 className={styles.title}>
            <Brain size={14} />
            AI Code Analysis
          </h3>

          <div className={styles.aiSection}>
            <div className={styles.optionCol}>
              <label className={styles.label}>Model</label>
              <select
                className={styles.modelSelect}
                title="AI Model"
                value={aiModel}
                onChange={(e) => setAiModel(e.target.value as AIModel)}
              >
                <optgroup label="Claude (Anthropic)">
                  {AI_MODELS.filter((m) => m.provider === 'claude').map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </optgroup>
                <optgroup label="GPT (OpenAI)">
                  {AI_MODELS.filter((m) => m.provider === 'openai').map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </optgroup>
              </select>
            </div>

            <div className={styles.optionCol}>
              <label className={styles.label}>Response Language</label>
              <select
                className={styles.modelSelect}
                title="AI Response Language"
                value={aiLanguage}
                onChange={(e) => setAiLanguage(e.target.value as AILanguage)}
              >
                <option value="en">English</option>
                <option value="he">עברית (Hebrew)</option>
              </select>
            </div>

            <div className={styles.optionCol}>
              <label className={styles.label}>Anthropic API Key</label>
              <input
                className={styles.apiKeyInput}
                type="password"
                placeholder="sk-ant-..."
                value={anthropicKey}
                onChange={(e) => setAnthropicKey(e.target.value)}
              />
              <div className={styles.aiStatus}>
                <span className={`${styles.statusDot} ${claudeReady ? styles.statusActive : ''}`} />
                {claudeReady ? 'Claude ready' : 'Not set'}
              </div>
            </div>

            <div className={styles.optionCol}>
              <label className={styles.label}>OpenAI API Key</label>
              <input
                className={styles.apiKeyInput}
                type="password"
                placeholder="sk-..."
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
              />
              <div className={styles.aiStatus}>
                <span className={`${styles.statusDot} ${openaiReady ? styles.statusActive : ''}`} />
                {openaiReady ? 'OpenAI ready' : 'Not set'}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
