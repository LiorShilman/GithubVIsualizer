const EXT_COLORS: Record<string, string> = {
  ts: '#3178C6',
  tsx: '#3178C6',
  js: '#F0DB4F',
  jsx: '#61DAFB',
  py: '#3572A5',
  rb: '#CC342D',
  go: '#00ADD8',
  rs: '#DEA584',
  css: '#563D7C',
  scss: '#CC6699',
  html: '#E34C26',
  vue: '#42B883',
  json: '#89D185',
  md: '#636363',
  sh: '#4EAA25',
  yml: '#CB171E',
  yaml: '#CB171E',
  java: '#B07219',
  kt: '#A97BFF',
  swift: '#F05138',
  c: '#555555',
  cpp: '#F34B7D',
  h: '#555555',
  php: '#4F5D95',
  dart: '#00B4AB',
  lua: '#000080',
  sql: '#E38C00',
  svg: '#FFB13B',
  toml: '#9C4221',
  lock: '#999999',
};

export function getExtensionColor(ext: string): string {
  return EXT_COLORS[ext] || '#8B8B8B';
}

export function getExtension(filename: string): string {
  const parts = filename.split('.');
  if (parts.length <= 1) return '';
  return parts[parts.length - 1].toLowerCase();
}

const CONFIG_EXTENSIONS = new Set([
  'json', 'yml', 'yaml', 'toml', 'ini', 'cfg', 'conf',
  'lock', 'editorconfig', 'prettierrc', 'eslintrc',
]);

export function isConfigFile(filename: string): boolean {
  const ext = getExtension(filename);
  const name = filename.split('/').pop() || '';
  return (
    CONFIG_EXTENSIONS.has(ext) ||
    name.startsWith('.') ||
    name === 'Makefile' ||
    name === 'Dockerfile'
  );
}
