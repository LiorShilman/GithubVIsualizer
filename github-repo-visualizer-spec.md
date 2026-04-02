# GitHub Repository Visualizer — Project Specification
> כלי ויזואלי לניתוח ומיפוי קוד מ-GitHub, בנוי עם React + TypeScript + Claude Code

---

## תוכן עניינים

1. [סקירת הפרויקט](#סקירת-הפרויקט)
2. [ארכיטקטורה](#ארכיטקטורה)
3. [מבנה תיקיות](#מבנה-תיקיות)
4. [Stack טכנולוגי](#stack-טכנולוגי)
5. [פיצ'רים מרכזיים](#פיצרים-מרכזיים)
6. [GitHub API — אסטרטגיה](#github-api--אסטרטגיה)
7. [ממשק משתמש](#ממשק-משתמש)
8. [מצבי State](#מצבי-state)
9. [הגדרת סביבה](#הגדרת-סביבה)
10. [שלבי פיתוח מומלצים](#שלבי-פיתוח-מומלצים)
11. [הנחיות ל-Claude Code](#הנחיות-ל-claude-code)

---

## סקירת הפרויקט

כלי web שמקבל URL של GitHub repository, שולף את מבנה הקוד דרך GitHub API, ומציג אותו בשתי תצוגות ויזואליות משלימות:

- **עץ קבצים אינטראקטיבי** עם תצוגת קוד inline
- **גרף תלויות** (dependency graph) שמראה את הקשרים בין קבצים ותיקיות

**קהל יעד:** מפתחים שרוצים להבין במהירות codebase חדש או להציג קוד בצורה ויזואלית.

---

## ארכיטקטורה

```
┌─────────────────────────────────────────────┐
│                  React App                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │  Input   │  │ FileTree │  │  Graph   │  │
│  │  Panel   │  │  View    │  │  View    │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  │
│       │              │              │        │
│  ┌────▼──────────────▼──────────────▼─────┐ │
│  │            Global Store (Zustand)       │ │
│  └────────────────────┬────────────────────┘ │
│                       │                      │
│  ┌────────────────────▼────────────────────┐ │
│  │           GitHub API Service            │ │
│  │   (with token support + rate limiting)  │ │
│  └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

---

## מבנה תיקיות

```
github-visualizer/
├── public/
│   └── index.html
├── src/
│   ├── main.tsx                    # Entry point
│   ├── App.tsx                     # Root component + routing
│   │
│   ├── components/
│   │   ├── InputPanel/
│   │   │   ├── InputPanel.tsx      # URL input + token input + load button
│   │   │   └── InputPanel.module.css
│   │   │
│   │   ├── FileTree/
│   │   │   ├── FileTree.tsx        # Recursive tree renderer
│   │   │   ├── TreeNode.tsx        # Single node (file or folder)
│   │   │   ├── CodeViewer.tsx      # Syntax-highlighted code display
│   │   │   └── FileTree.module.css
│   │   │
│   │   ├── DependencyGraph/
│   │   │   ├── DependencyGraph.tsx # Main graph container
│   │   │   ├── GraphCanvas.tsx     # D3 / React Flow canvas
│   │   │   ├── GraphControls.tsx   # Zoom, filter, layout controls
│   │   │   └── DependencyGraph.module.css
│   │   │
│   │   ├── StatsBar/
│   │   │   └── StatsBar.tsx        # Stars, forks, language breakdown
│   │   │
│   │   └── shared/
│   │       ├── LoadingSpinner.tsx
│   │       ├── ErrorBanner.tsx
│   │       └── Tabs.tsx
│   │
│   ├── services/
│   │   ├── github.ts               # GitHub API calls (REST)
│   │   ├── fileParser.ts           # Parse imports/requires from file content
│   │   └── graphBuilder.ts         # Build graph data from tree + imports
│   │
│   ├── store/
│   │   └── useRepoStore.ts         # Zustand global state
│   │
│   ├── hooks/
│   │   ├── useRepo.ts              # Main data fetching hook
│   │   ├── useFileContent.ts       # Lazy file content loading
│   │   └── useGraphLayout.ts       # D3 force simulation hook
│   │
│   ├── types/
│   │   └── index.ts                # TypeScript interfaces
│   │
│   └── utils/
│       ├── fileIcons.ts            # Map extensions to icons/colors
│       ├── syntaxHighlight.ts      # Language detection for highlighting
│       └── rateLimit.ts            # API rate limit tracking
│
├── .env.example                    # VITE_GITHUB_TOKEN=ghp_...
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

## Stack טכנולוגי

| שכבה | טכנולוגיה | סיבה |
|------|-----------|------|
| Framework | React 18 + TypeScript | קומפוננטות + type safety |
| Build | Vite | מהיר, HMR, קל להגדרה |
| State | Zustand | פשוט, ללא boilerplate |
| Graph | React Flow | גרף אינטראקטיבי מוכן, קל לקסטום |
| Syntax Highlighting | Shiki | מדויק, תומך 100+ שפות |
| Styling | CSS Modules + CSS Variables | scoped, ללא dependency כבד |
| Icons | Lucide React | עקבי ו-tree-shakeable |
| HTTP | native fetch + SWR | caching אוטומטי לקריאות API |

> **לא** להשתמש ב-Redux, MUI, או Axios — מורכבות מיותרת לפרויקט זה.

---

## פיצ'רים מרכזיים

### 1. Input Panel
- שדה URL לrepository (ולידציה: חייב להיות `github.com/{owner}/{repo}`)
- שדה GitHub Token (אופציונלי, נשמר ב-localStorage, לא ב-URL)
- כפתור "טען" עם מצב loading
- תצוגת rate limit נוכחי (`X / 60` requests remaining)

### 2. Stats Bar
אחרי טעינה, מוצג בר עם:
- ⭐ Stars
- 🍴 Forks
- 📄 מספר קבצים
- 🔤 שפה עיקרית
- עוגת שפות לפי % (CSS pie chart פשוט)

### 3. File Tree View
- עץ רקורסיבי עם collapse/expand לתיקיות
- איקון + צבע לפי סוג קובץ (`.ts` = כחול, `.py` = צהוב, וכו')
- לחיצה על קובץ → טעינה lazy של התוכן
- CodeViewer עם:
  - Syntax highlighting (Shiki)
  - שם הקובץ + נתיב מלא
  - כפתור "פתח ב-GitHub"
  - מספרי שורות
  - הגבלה ל-500 שורות עם כפתור "טען הכל"

### 4. Dependency Graph
- כל קובץ = node
- קשתות (edges) = import/require relations (parsed מהקוד)
- צבע nodes לפי תיקייה
- גודל node לפי מספר importers (centrality)
- **Layout options:** Force-directed / Hierarchical / Circular
- **Interactivity:**
  - Hover → highlight edges + tooltip עם שם קובץ
  - לחיצה → קפיצה ל-File Tree + פתיחת הקוד
  - Zoom + Pan
  - חיפוש קובץ בגרף
- **Filters:**
  - סינון לפי סוג קובץ (רק `.ts`, רק `.css`, וכו')
  - הסתרת node-ים מבודדים (ללא edges)

### 5. Settings Panel (Sidebar)
- בחירת branch (default: `HEAD`)
- max files להצגה בגרף (slider: 20–200)
- toggle: הצג/הסתר קבצי config (`.json`, `.yml`, וכו')

---

## GitHub API — אסטרטגיה

### Endpoints בשימוש

```typescript
// 1. מידע כללי על ה-repo
GET https://api.github.com/repos/{owner}/{repo}

// 2. עץ קבצים מלא (recursive)
GET https://api.github.com/repos/{owner}/{repo}/git/trees/HEAD?recursive=1

// 3. תוכן קובץ ספציפי
GET https://api.github.com/repos/{owner}/{repo}/contents/{path}
```

### Rate Limiting

| מצב | מגבלה |
|-----|--------|
| ללא token | 60 req/hour |
| עם token | 5,000 req/hour |

**אסטרטגיה:**
1. תמיד הצג את המגבלה הנוכחית למשתמש (header: `X-RateLimit-Remaining`)
2. Cache קבצים שנטענו ב-sessionStorage (לא לטעון שוב באותה session)
3. טעינת תוכן קבצים **lazy בלבד** — רק כשהמשתמש לוחץ
4. הגבל parse של imports ל-50 קבצים ראשונים (ניתן לשנות בהגדרות)

### Token Setup
```
# .env.local (לא מועלה ל-git!)
VITE_GITHUB_TOKEN=ghp_your_token_here
```

---

## ממשק משתמש

### Layout

```
┌─────────────────────────────────────────────────────┐
│  🔍 [github.com/owner/repo        ] [🔑 token] [טען]│
│  ⭐ 12k  🍴 3.2k  📄 284 files  🔤 TypeScript       │
├──────────────────────────────────────────────────────┤
│  [🌲 עץ קבצים]  [🕸 גרף תלויות]                     │
├────────────┬─────────────────────────────────────────┤
│ 📁 src/    │  src/components/Button.tsx               │
│  📁 comp/  │  ─────────────────────────────────────  │
│   📄 Btn   │  1  import React from 'react'            │
│   📄 Input │  2  import styles from './Button.module' │
│ 📁 hooks/  │  3                                       │
│  📄 useRepo│  4  interface ButtonProps { ... }        │
│ 📄 App.tsx │  ...                                     │
└────────────┴─────────────────────────────────────────┘
```

### צבעי קבצים

```typescript
const EXT_COLORS: Record<string, string> = {
  ts: '#3178C6',   tsx: '#3178C6',
  js: '#F0DB4F',   jsx: '#61DAFB',
  py: '#3572A5',   rb: '#CC342D',
  go: '#00ADD8',   rs: '#DEA584',
  css: '#563D7C',  scss: '#CC6699',
  html: '#E34C26', vue: '#42B883',
  json: '#89D185', md: '#636363',
  sh: '#4EAA25',   yml: '#CB171E',
};
```

### Dark Mode
- CSS variables בלבד: `--bg-primary`, `--text-primary`, `--border`, `--accent`
- toggle בHeader, נשמר ב-localStorage
- Graph nodes משתמשים ב-opacity במקום background

---

## מצבי State

```typescript
// src/types/index.ts

interface RepoState {
  // Input
  repoUrl: string;
  token: string;
  
  // Loading
  status: 'idle' | 'loading' | 'success' | 'error';
  error: string | null;
  
  // Data
  repoInfo: GitHubRepo | null;
  tree: TreeNode[];           // raw flat tree from API
  nestedTree: NestedNode;     // built client-side
  
  // UI
  activeTab: 'tree' | 'graph';
  selectedFile: string | null;
  openFolders: Set<string>;
  fileContents: Map<string, string>;  // cache
  
  // Graph
  graphNodes: GraphNode[];
  graphEdges: GraphEdge[];
  graphFilter: GraphFilter;
  
  // Rate limit
  rateLimitRemaining: number;
  rateLimitReset: Date | null;
}

interface TreeNode {
  path: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
}

interface GraphNode {
  id: string;           // file path
  label: string;        // filename
  directory: string;    // parent folder
  extension: string;
  importCount: number;  // how many files import this
  x?: number;
  y?: number;
}

interface GraphEdge {
  source: string;  // importer path
  target: string;  // imported path
}
```

---

## הגדרת סביבה

### דרישות מקדימות
- Node.js 18+
- npm / pnpm
- חשבון GitHub (לtoken אופציונלי)

### התקנה

```bash
# 1. צור פרויקט חדש
npm create vite@latest github-visualizer -- --template react-ts
cd github-visualizer

# 2. התקן dependencies
npm install zustand swr @xyflow/react shiki lucide-react
npm install -D @types/node

# 3. הגדר env
cp .env.example .env.local
# ערוך .env.local והוסף את ה-token שלך

# 4. הרץ
npm run dev
```

### יצירת GitHub Token

1. עבור ל-[github.com/settings/tokens](https://github.com/settings/tokens)
2. לחץ **Generate new token (classic)**
3. סמן רק: `public_repo` (read-only)
4. העתק את ה-token ל-`.env.local`

---

## שלבי פיתוח מומלצים

### Phase 1 — Core Infrastructure (שעה 1)
- [ ] Vite + React + TypeScript setup
- [ ] Zustand store בסיסי
- [ ] GitHub API service עם error handling
- [ ] Input Panel + ולידציה

### Phase 2 — File Tree (שעה 2)
- [ ] שליפת tree מה-API
- [ ] בניית nested tree client-side
- [ ] TreeNode קומפוננטה רקורסיבית
- [ ] Lazy loading של תוכן קבצים

### Phase 3 — Code Viewer (שעה 3)
- [ ] Shiki integration
- [ ] Language detection לפי extension
- [ ] מספרי שורות
- [ ] כפתור "פתח ב-GitHub"

### Phase 4 — Dependency Graph (שעות 4–5)
- [ ] Parser בסיסי ל-imports (regex על JS/TS/Python)
- [ ] בניית graphNodes + graphEdges
- [ ] React Flow integration
- [ ] Hover + click interactions

### Phase 5 — Polish (שעה 6)
- [ ] Dark mode
- [ ] Rate limit indicator
- [ ] Settings panel
- [ ] Error states + empty states
- [ ] Mobile responsive (עץ קבצים בלבד)

---

## הנחיות ל-Claude Code

### Prompt פתיחה מומלץ

```
אני רוצה לבנות GitHub Repository Visualizer עם React + TypeScript + Vite.
הכלי מקבל URL של GitHub repo, שולף את המבנה דרך GitHub API, ומציג:
1. עץ קבצים אינטראקטיבי עם תצוגת קוד (syntax highlighting עם Shiki)
2. גרף תלויות עם React Flow שמראה import relations בין קבצים

התחל מ-Phase 1: צור את הפרויקט עם Vite, הגדר Zustand store,
כתוב את GitHub API service עם rate limit handling,
ובנה את InputPanel הבסיסי.

השתמש ב-CSS Modules לסטייל. אל תשתמש ב-Redux או MUI.
```

### כללים לשמור על איכות הקוד

1. **TypeScript strict mode** — אסור `any`, תמיד טיפוסים מפורשים
2. **Error boundaries** — כל view עטוף ב-ErrorBoundary
3. **Loading states** — כל async operation מציג spinner
4. **No prop drilling** — state גלובלי דרך Zustand בלבד
5. **Memoization** — `useMemo` על חישובי גרף (יקרים)
6. **Lazy imports** — `React.lazy` על DependencyGraph (כבד)

### Import Parser — פירוט

הפרסר צריך לזהות את הדפוסים הבאים:

```typescript
// JavaScript/TypeScript
import x from './module'
import { x } from '../utils'
import * as x from '@/services/api'
const x = require('./config')
export { x } from './types'

// Python
from .utils import helper
from ..models import User
import services.github

// CSS/SCSS
@import './variables'
@use '../mixins'
```

> **חשוב:** הפרסר אינו צריך להיות מושלם — הוא צריך להיות מהיר.
> הגבל ל-regex פשוט, לא AST מלא.

### טיפול בגרף גדול

עבור repos עם 500+ קבצים:
- הגבל הצגה ל-100 nodes (מסוננים לפי centrality)
- השתמש ב-virtualization של React Flow
- הצג warning למשתמש עם אפשרות להרחיב

---

## דוגמאות repos לבדיקה

| Repo | גודל | מתאים לבדיקת |
|------|------|---------------|
| `expressjs/express` | קטן | JavaScript imports |
| `facebook/jest` | בינוני | monorepo structure |
| `vitejs/vite` | בינוני | TypeScript + complex deps |
| `vercel/next.js` | גדול | stress test (גרף גדול) |
| `django/django` | גדול | Python imports |

---

*מסמך זה נוצר כ-blueprint לפיתוח עם Claude Code. עדכן בהתאם לצרכים שלך.*
