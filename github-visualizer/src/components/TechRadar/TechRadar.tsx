import { useMemo, useState, useRef, useCallback } from 'react';
import { Radar } from 'lucide-react';
import { useRepoStore } from '@/store/useRepoStore.ts';
import styles from './TechRadar.module.css';

interface TechItem {
  name: string;
  category: 'language' | 'framework' | 'tool' | 'infrastructure';
  ring: number; // 0=adopt, 1=trial, 2=assess, 3=hold
  angle: number;
  confidence: number; // 0-1
  color: string;
  x: number;
  y: number;
  size: number;
}

const RING_LABELS = ['Adopt', 'Trial', 'Assess', 'Hold'];
const RING_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#6b7280'];

const CATEGORY_COLORS: Record<string, string> = {
  language: '#8B5CF6',
  framework: '#EC4899',
  tool: '#06B6D4',
  infrastructure: '#F59E0B',
};

// Deterministic hash for stable jitter
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return h;
}

// Detection patterns for technologies
const TECH_PATTERNS: { name: string; category: TechItem['category']; patterns: RegExp[] }[] = [
  // Frameworks
  { name: 'React', category: 'framework', patterns: [/react/, /\.jsx$/, /\.tsx$/] },
  { name: 'Vue', category: 'framework', patterns: [/vue/, /\.vue$/] },
  { name: 'Angular', category: 'framework', patterns: [/angular/, /\.component\.ts$/] },
  { name: 'Svelte', category: 'framework', patterns: [/svelte/, /\.svelte$/] },
  { name: 'Next.js', category: 'framework', patterns: [/next\.config/, /next-env/] },
  { name: 'Nuxt', category: 'framework', patterns: [/nuxt\.config/] },
  { name: 'Express', category: 'framework', patterns: [/express/] },
  { name: 'FastAPI', category: 'framework', patterns: [/fastapi/] },
  { name: 'Django', category: 'framework', patterns: [/django/, /manage\.py/] },
  { name: 'Flask', category: 'framework', patterns: [/flask/] },
  { name: 'Spring', category: 'framework', patterns: [/spring/, /\.java$/] },
  { name: 'Rails', category: 'framework', patterns: [/rails/, /Gemfile/] },
  { name: 'Laravel', category: 'framework', patterns: [/laravel/, /artisan/] },
  { name: '.NET', category: 'framework', patterns: [/\.csproj$/, /\.sln$/, /appsettings\.json/] },
  { name: 'Tailwind', category: 'framework', patterns: [/tailwind/] },

  // Tools
  { name: 'Docker', category: 'tool', patterns: [/dockerfile/i, /docker-compose/] },
  { name: 'Webpack', category: 'tool', patterns: [/webpack/] },
  { name: 'Vite', category: 'tool', patterns: [/vite\.config/] },
  { name: 'ESLint', category: 'tool', patterns: [/\.eslint/] },
  { name: 'Prettier', category: 'tool', patterns: [/\.prettier/] },
  { name: 'Jest', category: 'tool', patterns: [/jest\.config/, /__tests__/] },
  { name: 'Vitest', category: 'tool', patterns: [/vitest/] },
  { name: 'Cypress', category: 'tool', patterns: [/cypress/] },
  { name: 'Storybook', category: 'tool', patterns: [/\.storybook/] },
  { name: 'Babel', category: 'tool', patterns: [/\.babel/, /babel\.config/] },
  { name: 'Rollup', category: 'tool', patterns: [/rollup\.config/] },
  { name: 'esbuild', category: 'tool', patterns: [/esbuild/] },
  { name: 'Turborepo', category: 'tool', patterns: [/turbo\.json/] },
  { name: 'pnpm', category: 'tool', patterns: [/pnpm-lock/, /pnpm-workspace/] },
  { name: 'Yarn', category: 'tool', patterns: [/yarn\.lock/, /\.yarnrc/] },
  { name: 'npm', category: 'tool', patterns: [/package-lock\.json/] },
  { name: 'Gradle', category: 'tool', patterns: [/build\.gradle/, /gradlew/] },
  { name: 'Maven', category: 'tool', patterns: [/pom\.xml/] },
  { name: 'CMake', category: 'tool', patterns: [/CMakeLists\.txt/i, /\.cmake$/] },

  // Infrastructure
  { name: 'GitHub Actions', category: 'infrastructure', patterns: [/\.github\/workflows/] },
  { name: 'GitLab CI', category: 'infrastructure', patterns: [/\.gitlab-ci/] },
  { name: 'Terraform', category: 'infrastructure', patterns: [/\.tf$/, /terraform/] },
  { name: 'Kubernetes', category: 'infrastructure', patterns: [/k8s/, /kubernetes/, /\.yaml$.*kind:\s*deployment/i] },
  { name: 'AWS', category: 'infrastructure', patterns: [/aws/, /\.aws/, /serverless/] },
  { name: 'Vercel', category: 'infrastructure', patterns: [/vercel\.json/] },
  { name: 'Netlify', category: 'infrastructure', patterns: [/netlify\.toml/] },
  { name: 'Nginx', category: 'infrastructure', patterns: [/nginx/] },
  { name: 'Redis', category: 'infrastructure', patterns: [/redis/] },
  { name: 'PostgreSQL', category: 'infrastructure', patterns: [/postgres/, /pg_/, /\.sql$/] },
  { name: 'MongoDB', category: 'infrastructure', patterns: [/mongo/, /mongoose/] },
  { name: 'Prisma', category: 'infrastructure', patterns: [/prisma/] },
];

const CX = 350;
const CY = 350;
const MAX_R = 300;
const RING_W = MAX_R / 4;

export function TechRadar() {
  const tree = useRepoStore((s) => s.tree);
  const languages = useRepoStore((s) => s.languages);

  const [hoveredName, setHoveredName] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  // Compute positions once, stable across re-renders
  const techs = useMemo<TechItem[]>(() => {
    const filePaths = tree.map((n) => n.path.toLowerCase());
    const detected: Omit<TechItem, 'x' | 'y' | 'size'>[] = [];

    for (const tech of TECH_PATTERNS) {
      let matchCount = 0;
      for (const path of filePaths) {
        for (const pattern of tech.patterns) {
          if (pattern.test(path)) {
            matchCount++;
            break;
          }
        }
      }
      if (matchCount > 0) {
        const confidence = Math.min(1, matchCount / 10);
        detected.push({
          name: tech.name,
          category: tech.category,
          ring: confidence > 0.5 ? 0 : confidence > 0.2 ? 1 : 2,
          angle: 0,
          confidence,
          color: CATEGORY_COLORS[tech.category],
        });
      }
    }

    if (languages) {
      const totalBytes = Object.values(languages).reduce((a, b) => a + b, 0);
      for (const [lang, bytes] of Object.entries(languages)) {
        const ratio = bytes / totalBytes;
        detected.push({
          name: lang,
          category: 'language',
          ring: ratio > 0.3 ? 0 : ratio > 0.1 ? 1 : ratio > 0.03 ? 2 : 3,
          angle: 0,
          confidence: ratio,
          color: CATEGORY_COLORS.language,
        });
      }
    }

    detected.sort((a, b) => b.confidence - a.confidence);

    const categories = ['language', 'framework', 'tool', 'infrastructure'] as const;
    const quadrantSize = 360 / categories.length;

    for (const [ci, cat] of categories.entries()) {
      const items = detected.filter((t) => t.category === cat);
      const baseAngle = ci * quadrantSize;
      items.forEach((item, i) => {
        item.angle = baseAngle + ((i + 0.5) / Math.max(items.length, 1)) * quadrantSize;
      });
    }

    // Pre-compute stable x, y, size using deterministic hash
    return detected.map((tech) => {
      const h = hashStr(tech.name);
      const jitter = ((h % 1000) / 1000 - 0.5) * RING_W * 0.4;
      const ringR = MAX_R - tech.ring * RING_W - RING_W * 0.5;
      const r = Math.max(15, Math.min(MAX_R - 10, ringR + jitter));
      const rad = (tech.angle * Math.PI) / 180;
      return {
        ...tech,
        x: CX + Math.cos(rad) * r,
        y: CY + Math.sin(rad) * r,
        size: Math.max(6, Math.min(14, tech.confidence * 18)),
      };
    });
  }, [tree, languages]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setMousePos({ x: e.clientX + 12, y: e.clientY + 12 });
  }, []);

  const hoveredItem = hoveredName ? techs.find((t) => t.name === hoveredName) : null;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.title}>
          <Radar size={16} />
          Technology Radar
        </span>
        <div className={styles.legend}>
          {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
            <span key={cat} className={styles.legendItem}>
              <span className={styles.legendDot} style={{ background: color }} />
              {cat}
            </span>
          ))}
        </div>
        <span className={styles.stats}>{techs.length} technologies detected</span>
      </div>

      <div className={styles.radarWrap} onMouseMove={handleMouseMove}>
        <svg ref={svgRef} viewBox="0 0 700 700" className={styles.svg}>
          {/* Ring backgrounds */}
          {[3, 2, 1, 0].map((ring) => (
            <circle
              key={ring}
              cx={CX} cy={CY}
              r={MAX_R - ring * RING_W}
              fill="none"
              stroke="var(--border)"
              strokeWidth="1"
              opacity="0.5"
            />
          ))}

          {/* Ring fills */}
          {[3, 2, 1, 0].map((ring) => (
            <circle
              key={`fill-${ring}`}
              cx={CX} cy={CY}
              r={MAX_R - ring * RING_W}
              fill={RING_COLORS[ring]}
              opacity="0.04"
            />
          ))}

          {/* Quadrant lines */}
          {[0, 90, 180, 270].map((angle) => {
            const rad = (angle * Math.PI) / 180;
            return (
              <line
                key={angle}
                x1={CX} y1={CY}
                x2={CX + Math.cos(rad) * MAX_R}
                y2={CY + Math.sin(rad) * MAX_R}
                stroke="var(--border)"
                strokeWidth="1"
                opacity="0.3"
              />
            );
          })}

          {/* Ring labels */}
          {RING_LABELS.map((label, i) => (
            <text
              key={label}
              x={CX + 4}
              y={CY - (MAX_R - i * RING_W) + 16}
              fill="var(--text-muted)"
              fontSize="13"
              fontWeight="500"
              opacity="0.7"
            >
              {label}
            </text>
          ))}

          {/* Category labels */}
          {(['Languages', 'Frameworks', 'Tools', 'Infrastructure'] as const).map((label, i) => {
            const angle = ((i * 90 + 45) * Math.PI) / 180;
            return (
              <text
                key={label}
                x={CX + Math.cos(angle) * (MAX_R + 24)}
                y={CY + Math.sin(angle) * (MAX_R + 24)}
                fill="var(--text-muted)"
                fontSize="14"
                fontWeight="700"
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {label}
              </text>
            );
          })}

          {/* Tech blips - stable positions */}
          {techs.map((tech) => {
            const isHovered = hoveredName === tech.name;

            return (
              <g
                key={tech.name}
                onMouseEnter={() => setHoveredName(tech.name)}
                onMouseLeave={() => setHoveredName(null)}
                style={{ cursor: 'pointer' }}
              >
                {isHovered && (
                  <circle cx={tech.x} cy={tech.y} r={tech.size + 6} fill={tech.color} opacity="0.2" />
                )}
                <circle
                  cx={tech.x} cy={tech.y} r={tech.size}
                  fill={tech.color}
                  opacity={isHovered ? 1 : 0.8}
                  stroke={isHovered ? '#fff' : 'none'}
                  strokeWidth="2"
                />
                {(tech.size > 5 || isHovered) && (
                  <text
                    x={tech.x}
                    y={tech.y + tech.size + 14}
                    fill="var(--text-primary)"
                    fontSize="12"
                    textAnchor="middle"
                    fontWeight={isHovered ? '700' : '500'}
                  >
                    {tech.name}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {hoveredItem && (
        <div
          className={styles.tooltip}
          style={{ left: mousePos.x, top: mousePos.y }}
        >
          <div className={styles.tooltipTitle}>
            <span className={styles.tooltipDot} style={{ background: hoveredItem.color }} />
            {hoveredItem.name}
          </div>
          <div className={styles.tooltipMeta}>
            <span>Category: {hoveredItem.category}</span>
            <span>Ring: {RING_LABELS[hoveredItem.ring]}</span>
            <span>Confidence: {(hoveredItem.confidence * 100).toFixed(0)}%</span>
          </div>
        </div>
      )}
    </div>
  );
}
