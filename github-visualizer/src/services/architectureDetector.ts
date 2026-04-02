import type { TreeNode, ArchComponent, ArchConnection } from '@/types/index.ts';

interface DetectedArchitecture {
  components: ArchComponent[];
  connections: ArchConnection[];
}

// Pattern matchers for detecting architecture components
const DETECTORS: {
  type: ArchComponent['type'];
  label: string;
  tech: string;
  icon: string;
  patterns: {
    dirs?: RegExp[];
    files?: RegExp[];
    extensions?: string[];
  };
}[] = [
  // Frontend frameworks
  {
    type: 'frontend',
    label: 'React Frontend',
    tech: 'React',
    icon: '⚛️',
    patterns: {
      dirs: [/^src\/components/i, /^src\/pages/i, /^src\/views/i, /^app\/components/i, /^client/i],
      files: [/\.tsx$/, /\.jsx$/],
    },
  },
  {
    type: 'frontend',
    label: 'Angular Frontend',
    tech: 'Angular',
    icon: '🅰️',
    patterns: {
      files: [/angular\.json$/, /\.component\.ts$/],
      dirs: [/^src\/app/i],
    },
  },
  {
    type: 'frontend',
    label: 'Vue Frontend',
    tech: 'Vue',
    icon: '💚',
    patterns: {
      files: [/\.vue$/, /vue\.config/],
    },
  },
  {
    type: 'frontend',
    label: 'Static Frontend',
    tech: 'HTML/CSS/JS',
    icon: '🌐',
    patterns: {
      files: [/\.html$/],
      dirs: [/^public/i, /^static/i, /^www/i],
    },
  },
  // Backend
  {
    type: 'backend',
    label: 'Node.js Server',
    tech: 'Node.js',
    icon: '🟢',
    patterns: {
      files: [/server\.(ts|js)$/, /app\.(ts|js)$/, /index\.(ts|js)$/],
      dirs: [/^server/i, /^backend/i, /^src\/server/i],
    },
  },
  {
    type: 'backend',
    label: 'Python Server',
    tech: 'Python',
    icon: '🐍',
    patterns: {
      files: [/manage\.py$/, /wsgi\.py$/, /asgi\.py$/, /app\.py$/, /main\.py$/],
      dirs: [/^django/i, /^flask/i],
    },
  },
  {
    type: 'backend',
    label: 'Java Server',
    tech: 'Java/Spring',
    icon: '☕',
    patterns: {
      files: [/\.java$/, /pom\.xml$/, /build\.gradle$/],
      dirs: [/^src\/main\/java/i],
    },
  },
  {
    type: 'backend',
    label: 'Go Server',
    tech: 'Go',
    icon: '🔵',
    patterns: {
      files: [/go\.mod$/, /main\.go$/],
    },
  },
  {
    type: 'backend',
    label: 'C# / .NET Server',
    tech: '.NET',
    icon: '🟣',
    patterns: {
      files: [/\.csproj$/, /\.sln$/, /Program\.cs$/, /Startup\.cs$/],
      dirs: [/^Controllers/i, /^Services/i],
    },
  },
  // API layer
  {
    type: 'api',
    label: 'REST API',
    tech: 'REST',
    icon: '🔌',
    patterns: {
      dirs: [/^(src\/)?(api|routes|endpoints|controllers)/i],
      files: [/routes?\.(ts|js|py)$/, /controller\.(ts|js)$/, /swagger/i, /openapi/i],
    },
  },
  {
    type: 'api',
    label: 'GraphQL API',
    tech: 'GraphQL',
    icon: '◈',
    patterns: {
      files: [/\.graphql$/, /schema\.gql$/, /resolvers?\.(ts|js)$/],
      dirs: [/graphql/i],
    },
  },
  // Database
  {
    type: 'database',
    label: 'PostgreSQL',
    tech: 'PostgreSQL',
    icon: '🐘',
    patterns: {
      files: [/prisma\/schema\.prisma$/, /knexfile/i, /sequelize/i],
      dirs: [/^prisma/i, /^migrations/i, /^db/i],
    },
  },
  {
    type: 'database',
    label: 'MongoDB',
    tech: 'MongoDB',
    icon: '🍃',
    patterns: {
      files: [/models?\/(.*)\.(ts|js)$/, /mongoose/i, /\.model\.(ts|js)$/],
      dirs: [/^models/i, /^schemas/i],
    },
  },
  {
    type: 'database',
    label: 'SQLite / SQL',
    tech: 'SQL',
    icon: '💾',
    patterns: {
      files: [/\.sql$/, /\.sqlite$/, /database\.(ts|js)$/],
    },
  },
  // Auth
  {
    type: 'auth',
    label: 'Authentication',
    tech: 'Auth',
    icon: '🔐',
    patterns: {
      dirs: [/^(src\/)?(auth|authentication|passport)/i],
      files: [/auth\.(ts|js)$/, /passport/i, /jwt/i, /oauth/i, /middleware\/auth/i],
    },
  },
  // Cache
  {
    type: 'cache',
    label: 'Cache Layer',
    tech: 'Redis',
    icon: '⚡',
    patterns: {
      files: [/redis/i, /cache\.(ts|js)$/],
      dirs: [/^cache/i],
    },
  },
  // Storage
  {
    type: 'storage',
    label: 'File Storage',
    tech: 'Storage',
    icon: '📁',
    patterns: {
      dirs: [/^uploads/i, /^storage/i, /^assets/i, /^media/i],
      files: [/multer/i, /upload\.(ts|js)$/, /s3/i],
    },
  },
  // External services
  {
    type: 'external',
    label: 'External Services',
    tech: 'APIs',
    icon: '☁️',
    patterns: {
      files: [/\.env\.example$/, /\.env$/],
      dirs: [/^services/i, /^integrations/i],
    },
  },
  // CI/CD
  {
    type: 'ci',
    label: 'CI/CD Pipeline',
    tech: 'CI/CD',
    icon: '🔄',
    patterns: {
      dirs: [/^\.github\/workflows/i, /^\.circleci/i, /^\.gitlab-ci/i],
      files: [/Dockerfile$/, /docker-compose/i, /Jenkinsfile/i, /\.yml$/],
    },
  },
  // Testing
  {
    type: 'testing',
    label: 'Test Suite',
    tech: 'Testing',
    icon: '🧪',
    patterns: {
      dirs: [/^(src\/)?(__tests__|tests?|spec|cypress|e2e)/i],
      files: [/\.test\.(ts|js|tsx|jsx)$/, /\.spec\.(ts|js)$/, /jest\.config/i, /vitest\.config/i],
    },
  },
];

// Connection rules: what connects to what
const CONNECTION_RULES: {
  from: ArchComponent['type'];
  to: ArchComponent['type'];
  label: string;
  protocol: string;
}[] = [
  { from: 'frontend', to: 'api', label: 'HTTP Requests', protocol: 'REST/GraphQL' },
  { from: 'frontend', to: 'backend', label: 'HTTP Requests', protocol: 'HTTP' },
  { from: 'frontend', to: 'auth', label: 'Login / Token', protocol: 'JWT' },
  { from: 'api', to: 'backend', label: 'Route Handling', protocol: 'Internal' },
  { from: 'backend', to: 'database', label: 'Queries', protocol: 'SQL/NoSQL' },
  { from: 'backend', to: 'cache', label: 'Read/Write', protocol: 'Redis' },
  { from: 'backend', to: 'storage', label: 'File I/O', protocol: 'FS/S3' },
  { from: 'backend', to: 'external', label: 'API Calls', protocol: 'HTTPS' },
  { from: 'backend', to: 'auth', label: 'Verify', protocol: 'Middleware' },
  { from: 'auth', to: 'database', label: 'User Data', protocol: 'Query' },
  { from: 'api', to: 'database', label: 'CRUD', protocol: 'ORM' },
  { from: 'api', to: 'auth', label: 'Auth Check', protocol: 'Middleware' },
  { from: 'ci', to: 'testing', label: 'Run Tests', protocol: 'Pipeline' },
  { from: 'ci', to: 'backend', label: 'Deploy', protocol: 'CD' },
  { from: 'ci', to: 'frontend', label: 'Build & Deploy', protocol: 'CD' },
];

export function detectArchitecture(tree: TreeNode[]): DetectedArchitecture {
  const filePaths = tree.map((n) => n.path);
  const detectedComponents: ArchComponent[] = [];
  const seenTypes = new Map<string, ArchComponent>(); // type+tech → component

  for (const detector of DETECTORS) {
    const matchingFiles: string[] = [];

    for (const filePath of filePaths) {
      let matched = false;

      if (detector.patterns.dirs) {
        for (const dirPattern of detector.patterns.dirs) {
          if (dirPattern.test(filePath)) {
            matched = true;
            break;
          }
        }
      }

      if (!matched && detector.patterns.files) {
        for (const filePattern of detector.patterns.files) {
          if (filePattern.test(filePath)) {
            matched = true;
            break;
          }
        }
      }

      if (matched) matchingFiles.push(filePath);
    }

    if (matchingFiles.length > 0) {
      const key = `${detector.type}:${detector.tech}`;

      if (seenTypes.has(key)) {
        // Merge files into existing component
        const existing = seenTypes.get(key)!;
        existing.files.push(...matchingFiles);
      } else {
        const component: ArchComponent = {
          id: `${detector.type}-${detector.tech.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
          type: detector.type,
          label: detector.label,
          tech: detector.tech,
          icon: detector.icon,
          files: matchingFiles,
        };

        // Don't duplicate same type (e.g., two frontend detectors)
        const existingOfType = detectedComponents.find(
          (c) => c.type === detector.type && c.type !== 'database' && c.type !== 'api'
        );
        if (existingOfType && detector.type === 'frontend') continue;
        if (existingOfType && detector.type === 'backend') continue;

        detectedComponents.push(component);
        seenTypes.set(key, component);
      }
    }
  }

  // Deduplicate by type (keep the one with most files, except databases/APIs can be multiple)
  const finalComponents: ArchComponent[] = [];
  const typeGroups = new Map<string, ArchComponent[]>();
  for (const comp of detectedComponents) {
    const key = comp.type;
    if (!typeGroups.has(key)) typeGroups.set(key, []);
    typeGroups.get(key)!.push(comp);
  }
  for (const [type, group] of typeGroups) {
    if (type === 'database' || type === 'api') {
      // Keep the one with most files for DB/API
      group.sort((a, b) => b.files.length - a.files.length);
      finalComponents.push(group[0]);
    } else {
      group.sort((a, b) => b.files.length - a.files.length);
      finalComponents.push(group[0]);
    }
  }

  // Build connections based on detected components
  const connections: ArchConnection[] = [];
  const componentTypes = new Set(finalComponents.map((c) => c.type));

  for (const rule of CONNECTION_RULES) {
    if (componentTypes.has(rule.from) && componentTypes.has(rule.to)) {
      const fromComp = finalComponents.find((c) => c.type === rule.from)!;
      const toComp = finalComponents.find((c) => c.type === rule.to)!;
      connections.push({
        from: fromComp.id,
        to: toComp.id,
        label: rule.label,
        protocol: rule.protocol,
        animated: true,
      });
    }
  }

  return { components: finalComponents, connections };
}
