interface ImportResult {
  source: string;
  target: string;
}

const JS_TS_IMPORT_REGEX = /(?:import\s+.*?\s+from\s+['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\)|export\s+.*?\s+from\s+['"]([^'"]+)['"])/g;
const PYTHON_IMPORT_REGEX = /(?:from\s+(\.[\w.]*)\s+import|import\s+([\w.]+))/g;
const CSS_IMPORT_REGEX = /(?:@import\s+['"]([^'"]+)['"]|@use\s+['"]([^'"]+)['"])/g;

function resolveRelativePath(fromFile: string, importPath: string): string | null {
  if (!importPath.startsWith('.')) return null;

  const fromDir = fromFile.split('/').slice(0, -1);
  const parts = importPath.split('/');

  const resolved = [...fromDir];
  for (const part of parts) {
    if (part === '.') continue;
    if (part === '..') {
      resolved.pop();
    } else {
      resolved.push(part);
    }
  }

  return resolved.join('/');
}

const JS_EXTENSIONS = ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'];
const CSS_EXTENSIONS = ['css', 'scss', 'less'];

function findMatchingFile(resolvedPath: string, allFiles: Set<string>): string | null {
  if (allFiles.has(resolvedPath)) return resolvedPath;

  const ext = resolvedPath.split('.').pop() || '';
  const extensions = CSS_EXTENSIONS.includes(ext) ? CSS_EXTENSIONS : JS_EXTENSIONS;

  for (const e of extensions) {
    const withExt = `${resolvedPath}.${e}`;
    if (allFiles.has(withExt)) return withExt;

    const indexFile = `${resolvedPath}/index.${e}`;
    if (allFiles.has(indexFile)) return indexFile;
  }

  return null;
}

function getFileExtension(path: string): string {
  const parts = path.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

export function parseImports(
  filePath: string,
  content: string,
  allFiles: Set<string>
): ImportResult[] {
  const results: ImportResult[] = [];
  const ext = getFileExtension(filePath);

  let regex: RegExp;
  if (JS_EXTENSIONS.includes(ext)) {
    regex = JS_TS_IMPORT_REGEX;
  } else if (ext === 'py') {
    regex = PYTHON_IMPORT_REGEX;
  } else if (CSS_EXTENSIONS.includes(ext)) {
    regex = CSS_IMPORT_REGEX;
  } else {
    return results;
  }

  regex.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const importPath = match[1] || match[2] || match[3];
    if (!importPath) continue;

    if (ext === 'py') {
      if (importPath.startsWith('.')) {
        const resolved = resolveRelativePath(filePath, importPath.replace(/\./g, '/'));
        if (resolved) {
          const matched = findMatchingFile(resolved, allFiles);
          if (matched) {
            results.push({ source: filePath, target: matched });
          }
        }
      }
      continue;
    }

    const resolved = resolveRelativePath(filePath, importPath);
    if (!resolved) continue;

    const matched = findMatchingFile(resolved, allFiles);
    if (matched) {
      results.push({ source: filePath, target: matched });
    }
  }

  return results;
}
