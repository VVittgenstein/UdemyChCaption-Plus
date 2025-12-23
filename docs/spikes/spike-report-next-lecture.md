# Spike Report: Udemy 页面课程列表结构分析 - 下一课 ID 获取方式

**Task ID:** T-20251223-act-002-spike-next-lecture
**Date:** 2025-12-23
**Status:** Completed
**Author:** Claude Code
**Verification Date:** 2025-12-23T16:30:00Z

---

## 1. 目标

分析 Udemy 课程播放页面的 DOM 结构和数据源，确定稳定获取"下一课"课时 ID 的方法，支持预加载功能的实现。

### 验收标准

- [x] 文档记录获取下一课 ID 的方式（DOM 选择器或页面内嵌数据）
- [x] 提供示例代码片段可稳定提取下一课 ID
- [x] 记录边界情况处理（最后一课、跨章节等）

**验收结论**: 3/3 通过，Curriculum API 方案验证成功

---

## 2. 技术背景

### 2.1 Udemy URL 结构

Udemy 课程页面 URL 格式：
```
https://www.udemy.com/course/{course-slug}/learn/lecture/{lecture-id}
```

例如：
```
https://www.udemy.com/course/2d-rpg-alexdev/learn/lecture/36963178
```

### 2.2 可能的数据源

1. **DOM 结构**
   - 课程侧边栏的课时列表
   - "下一课"导航按钮
   - 数据属性 (data-* attributes)

2. **页面内嵌数据**
   - `window` 全局变量（如 `__NEXT_DATA__`、`UD` 等）
   - JSON-LD 结构化数据
   - Script 标签内的 JSON 数据

3. **Network API**
   - 课程 curriculum API
   - 课时详情 API

---

## 3. 测试方法

### 3.1 测试环境

- **浏览器**: Chrome (最新稳定版)
- **测试页面**: https://www.udemy.com/course/2d-rpg-alexdev/learn/lecture/36963178
- **工具**: Chrome DevTools Console

### 3.2 测试脚本

请在 Udemy 课程视频页面的 DevTools Console 中执行以下脚本：

#### 脚本 1: 探索页面全局数据

```javascript
// Spike Test 1: 探索页面全局数据结构
(function exploreGlobalData() {
  console.log('='.repeat(60));
  console.log('[Spike] Exploring page global data...');
  console.log('='.repeat(60));

  const results = {
    timestamp: new Date().toISOString(),
    url: window.location.href,
    currentLectureId: window.location.pathname.match(/lecture\/(\d+)/)?.[1],
    dataSourcesFound: [],
    nextLectureData: null
  };

  // 检查常见的全局数据变量
  const globalVars = [
    'UD',
    '__NEXT_DATA__',
    '__NUXT__',
    'INITIAL_STATE',
    'pageData',
    'courseData',
    'udemy'
  ];

  for (const varName of globalVars) {
    if (window[varName]) {
      console.log(`[Found] window.${varName}:`, typeof window[varName]);
      results.dataSourcesFound.push(varName);

      // 深度探索 UD 对象
      if (varName === 'UD') {
        console.log('[UD] Keys:', Object.keys(window.UD));
        if (window.UD.config) {
          console.log('[UD.config] Keys:', Object.keys(window.UD.config));
        }
      }
    }
  }

  // 检查 JSON-LD 数据
  const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
  if (jsonLdScripts.length > 0) {
    console.log(`[Found] JSON-LD scripts: ${jsonLdScripts.length}`);
    results.dataSourcesFound.push('JSON-LD');
    jsonLdScripts.forEach((script, i) => {
      try {
        const data = JSON.parse(script.textContent);
        console.log(`[JSON-LD ${i}] Type:`, data['@type']);
      } catch (e) {
        console.log(`[JSON-LD ${i}] Parse error`);
      }
    });
  }

  // 检查 data-module-* 属性
  const modulesWithData = document.querySelectorAll('[data-module-id]');
  if (modulesWithData.length > 0) {
    console.log(`[Found] Elements with data-module-id: ${modulesWithData.length}`);
    results.dataSourcesFound.push('data-module-id');
  }

  // 检查 Redux store
  if (window.__REDUX_DEVTOOLS_EXTENSION__) {
    console.log('[Found] Redux DevTools detected');
  }

  // 尝试查找 React 组件数据
  const reactRoot = document.getElementById('udemy');
  if (reactRoot && reactRoot._reactRootContainer) {
    console.log('[Found] React root container');
    results.dataSourcesFound.push('React');
  }

  console.log('\n[Summary] Data sources found:', results.dataSourcesFound);
  return results;
})();
```

#### 脚本 2: 分析侧边栏课程列表 DOM

```javascript
// Spike Test 2: 分析侧边栏课程列表 DOM 结构
(function analyzeSidebarDOM() {
  console.log('='.repeat(60));
  console.log('[Spike] Analyzing sidebar curriculum DOM...');
  console.log('='.repeat(60));

  const results = {
    sidebarFound: false,
    lectureItems: [],
    currentLectureIndex: -1,
    nextLecture: null,
    prevLecture: null,
    selectors: {}
  };

  // 常见的侧边栏选择器
  const sidebarSelectors = [
    '[data-purpose="curriculum-section-container"]',
    '[class*="curriculum"]',
    '[class*="sidebar"]',
    '[class*="course-content"]',
    '.ud-accordion-panel',
    '[data-purpose="course-curriculum"]'
  ];

  // 查找侧边栏容器
  let sidebar = null;
  for (const selector of sidebarSelectors) {
    const el = document.querySelector(selector);
    if (el) {
      console.log(`[Found] Sidebar with selector: ${selector}`);
      sidebar = el;
      results.sidebarFound = true;
      results.selectors.sidebar = selector;
      break;
    }
  }

  if (!sidebar) {
    console.warn('[Warning] Sidebar not found with common selectors');
    console.log('[Tip] Try expanding the course content panel first');
  }

  // 查找课时链接/按钮
  const lectureSelectors = [
    '[data-purpose="curriculum-item-link"]',
    'a[href*="/lecture/"]',
    '[class*="curriculum-item"]',
    '[class*="lecture-item"]',
    '[data-purpose="item-container"]'
  ];

  let lectureElements = [];
  for (const selector of lectureSelectors) {
    const elements = document.querySelectorAll(selector);
    if (elements.length > 0) {
      console.log(`[Found] ${elements.length} lecture items with: ${selector}`);
      lectureElements = elements;
      results.selectors.lectureItem = selector;
      break;
    }
  }

  // 提取课时信息
  const currentUrl = window.location.href;
  const currentLectureId = currentUrl.match(/lecture\/(\d+)/)?.[1];
  console.log('[Current] Lecture ID:', currentLectureId);

  lectureElements.forEach((el, index) => {
    // 获取 href 或 data 属性中的 lecture ID
    let lectureId = null;
    let href = el.getAttribute('href') || el.querySelector('a')?.getAttribute('href');

    if (href) {
      lectureId = href.match(/lecture\/(\d+)/)?.[1];
    }

    // 检查 data 属性
    if (!lectureId) {
      lectureId = el.dataset?.lectureId || el.dataset?.id;
    }

    // 检查子元素
    if (!lectureId) {
      const dataEl = el.querySelector('[data-purpose="item-title"]') ||
                     el.querySelector('[data-purpose="lecture-title"]');
      if (dataEl) {
        // 可能在父元素的 data 属性中
        const parent = el.closest('[data-id]') || el.closest('[data-lecture-id]');
        if (parent) {
          lectureId = parent.dataset.id || parent.dataset.lectureId;
        }
      }
    }

    const lectureInfo = {
      index,
      id: lectureId,
      title: el.textContent?.trim().substring(0, 50),
      isCurrent: lectureId === currentLectureId || el.classList.contains('active') ||
                 el.getAttribute('aria-current') === 'true',
      element: el.tagName
    };

    results.lectureItems.push(lectureInfo);

    if (lectureInfo.isCurrent) {
      results.currentLectureIndex = index;
      console.log(`[Current] Index ${index}:`, lectureInfo.title);
    }
  });

  // 确定上一课和下一课
  if (results.currentLectureIndex > 0) {
    results.prevLecture = results.lectureItems[results.currentLectureIndex - 1];
    console.log('[Prev] Lecture:', results.prevLecture?.id, results.prevLecture?.title);
  }

  if (results.currentLectureIndex >= 0 &&
      results.currentLectureIndex < results.lectureItems.length - 1) {
    results.nextLecture = results.lectureItems[results.currentLectureIndex + 1];
    console.log('[Next] Lecture:', results.nextLecture?.id, results.nextLecture?.title);
  } else {
    console.log('[Info] This appears to be the last lecture in the section');
  }

  console.log('\n[Summary]');
  console.log('- Total lectures found:', results.lectureItems.length);
  console.log('- Current index:', results.currentLectureIndex);
  console.log('- Selectors:', results.selectors);

  return results;
})();
```

#### 脚本 3: 分析导航按钮

```javascript
// Spike Test 3: 分析下一课/上一课导航按钮
(function analyzeNavButtons() {
  console.log('='.repeat(60));
  console.log('[Spike] Analyzing navigation buttons...');
  console.log('='.repeat(60));

  const results = {
    nextButton: null,
    prevButton: null,
    nextLectureId: null,
    prevLectureId: null,
    selectors: {}
  };

  // 导航按钮选择器
  const navButtonSelectors = [
    // 下一课按钮
    {
      type: 'next',
      selectors: [
        '[data-purpose="go-to-next"]',
        '[data-purpose="next-item"]',
        'button[aria-label*="next"]',
        'a[aria-label*="next"]',
        '[class*="next-lecture"]',
        '[class*="next-button"]',
        'button:has(svg[name="next"])'
      ]
    },
    // 上一课按钮
    {
      type: 'prev',
      selectors: [
        '[data-purpose="go-to-previous"]',
        '[data-purpose="prev-item"]',
        'button[aria-label*="previous"]',
        'a[aria-label*="previous"]',
        '[class*="prev-lecture"]',
        '[class*="prev-button"]',
        'button:has(svg[name="previous"])'
      ]
    }
  ];

  for (const { type, selectors } of navButtonSelectors) {
    for (const selector of selectors) {
      try {
        const el = document.querySelector(selector);
        if (el) {
          console.log(`[Found] ${type} button with: ${selector}`);
          results.selectors[type] = selector;

          // 获取链接目标
          let href = el.getAttribute('href') || el.dataset?.href;

          // 如果是按钮，检查 onclick 或相关 data 属性
          if (!href && el.tagName === 'BUTTON') {
            // 检查 React props
            const reactKey = Object.keys(el).find(k => k.startsWith('__reactFiber'));
            if (reactKey) {
              console.log(`[${type}] Has React fiber - props may contain URL`);
            }

            // 检查 data 属性
            const dataUrl = el.dataset?.url || el.dataset?.targetUrl;
            if (dataUrl) {
              href = dataUrl;
            }
          }

          if (href) {
            const lectureId = href.match(/lecture\/(\d+)/)?.[1];
            if (type === 'next') {
              results.nextButton = el;
              results.nextLectureId = lectureId;
              console.log(`[Next] Lecture ID: ${lectureId}`);
            } else {
              results.prevButton = el;
              results.prevLectureId = lectureId;
              console.log(`[Prev] Lecture ID: ${lectureId}`);
            }
          } else {
            console.log(`[${type}] Button found but no direct href - may use JS navigation`);
            if (type === 'next') results.nextButton = el;
            else results.prevButton = el;
          }
          break;
        }
      } catch (e) {
        // selector may not be supported
      }
    }
  }

  // 如果没找到专门的按钮，检查播放器控制区域
  if (!results.nextButton) {
    const playerControls = document.querySelector('[class*="control-bar"]') ||
                          document.querySelector('[class*="video-controls"]');
    if (playerControls) {
      console.log('[Info] Checking player control bar for nav buttons...');
      const buttons = playerControls.querySelectorAll('button');
      buttons.forEach((btn, i) => {
        console.log(`  Button ${i}: ${btn.getAttribute('aria-label') || btn.className}`);
      });
    }
  }

  console.log('\n[Summary]');
  console.log('- Next lecture ID:', results.nextLectureId || 'Not directly extractable');
  console.log('- Prev lecture ID:', results.prevLectureId || 'Not directly extractable');

  return results;
})();
```

#### 脚本 4: 探索 UD 对象和 API 数据

```javascript
// Spike Test 4: 深度探索 UD 对象和 curriculum 数据
(function exploreUDObject() {
  console.log('='.repeat(60));
  console.log('[Spike] Exploring UD object and curriculum data...');
  console.log('='.repeat(60));

  const results = {
    udFound: false,
    curriculumData: null,
    nextLecture: null,
    courseInfo: null,
    apiEndpoints: []
  };

  // 检查 UD.lecture 或类似结构
  if (typeof UD !== 'undefined') {
    results.udFound = true;
    console.log('[Found] UD object');
    console.log('[UD] Top-level keys:', Object.keys(UD));

    // 常见的数据路径
    const paths = [
      'lecture',
      'course',
      'courseTakingData',
      'curriculum',
      'currentLecture',
      'videoPlayerInfo',
      'lectureInfo',
      'playerData',
      'data'
    ];

    for (const path of paths) {
      if (UD[path]) {
        console.log(`[UD.${path}] Keys:`, Object.keys(UD[path]));

        // 特别检查 curriculum 相关数据
        if (path.toLowerCase().includes('curriculum') ||
            path.toLowerCase().includes('lecture')) {
          results.curriculumData = UD[path];
        }
      }
    }

    // 检查 config
    if (UD.config) {
      console.log('[UD.config] Keys:', Object.keys(UD.config));
      if (UD.config.lecture) {
        console.log('[UD.config.lecture] Keys:', Object.keys(UD.config.lecture));
        results.courseInfo = UD.config.lecture;
      }
    }
  }

  // 检查 Performance 条目中的 API 调用
  if (window.performance) {
    const apiCalls = performance.getEntriesByType('resource')
      .filter(e => e.name.includes('api') || e.name.includes('curriculum'))
      .slice(0, 10);

    if (apiCalls.length > 0) {
      console.log('\n[API Calls Found]:');
      apiCalls.forEach(call => {
        console.log(' -', call.name.split('?')[0]);
        results.apiEndpoints.push(call.name);
      });
    }
  }

  // 查找内联脚本中的数据
  const scripts = document.querySelectorAll('script:not([src])');
  scripts.forEach((script, i) => {
    const content = script.textContent;
    if (content.includes('curriculum') || content.includes('nextLecture')) {
      console.log(`[Script ${i}] Contains curriculum/nextLecture data`);

      // 尝试提取 JSON
      const jsonMatch = content.match(/\{[\s\S]*"curriculum"[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const data = JSON.parse(jsonMatch[0]);
          console.log('[Inline JSON] Found curriculum data');
          results.curriculumData = data;
        } catch (e) {
          // 不是有效 JSON
        }
      }
    }
  });

  return results;
})();
```

#### 脚本 5: 通过网络请求获取 Curriculum

```javascript
// Spike Test 5: 探索 Curriculum API
(async function exploreCurriculumAPI() {
  console.log('='.repeat(60));
  console.log('[Spike] Exploring Curriculum API...');
  console.log('='.repeat(60));

  const results = {
    courseId: null,
    lectureId: null,
    curriculumItems: [],
    currentIndex: -1,
    nextLecture: null,
    apiUrl: null
  };

  // 从 URL 提取信息
  const urlMatch = window.location.href.match(/course\/([^\/]+)\/learn\/lecture\/(\d+)/);
  if (urlMatch) {
    results.courseSlug = urlMatch[1];
    results.lectureId = urlMatch[2];
    console.log('[URL] Course slug:', results.courseSlug);
    console.log('[URL] Current lecture ID:', results.lectureId);
  }

  // 尝试从 UD 对象获取 course ID
  if (typeof UD !== 'undefined') {
    const courseId = UD.config?.course?.id ||
                     UD.course?.id ||
                     UD.courseTakingData?.courseId;
    if (courseId) {
      results.courseId = courseId;
      console.log('[UD] Course ID:', courseId);
    }
  }

  // 常见的 Curriculum API 端点模式
  const apiPatterns = [
    `/api-2.0/courses/${results.courseId}/subscriber-curriculum-items/`,
    `/api-2.0/courses/${results.courseId}/curriculum-items/`,
    `/api-2.0/users/me/subscribed-courses/${results.courseId}/lectures/`
  ];

  console.log('\n[Potential API endpoints]:');
  apiPatterns.forEach(pattern => console.log(' -', pattern));

  // 检查是否有缓存的 curriculum 数据
  const findCurriculumInState = () => {
    // 检查 React state
    const reactElements = document.querySelectorAll('[class*="curriculum"]');
    for (const el of reactElements) {
      const reactKey = Object.keys(el).find(k => k.startsWith('__reactFiber'));
      if (reactKey) {
        let fiber = el[reactKey];
        let attempts = 0;
        while (fiber && attempts < 20) {
          if (fiber.memoizedState?.items || fiber.memoizedProps?.items) {
            return fiber.memoizedState?.items || fiber.memoizedProps?.items;
          }
          fiber = fiber.return;
          attempts++;
        }
      }
    }
    return null;
  };

  const curriculumFromState = findCurriculumInState();
  if (curriculumFromState) {
    console.log('[React] Found curriculum items in state:', curriculumFromState.length);
  }

  // 最终方案：解析侧边栏
  console.log('\n[Fallback] Parsing sidebar for curriculum data...');

  // 获取所有课时链接
  const lectureLinks = document.querySelectorAll('a[href*="/lecture/"]');
  const lectures = [];
  let currentIndex = -1;

  lectureLinks.forEach((link, index) => {
    const href = link.getAttribute('href');
    const lectureId = href.match(/lecture\/(\d+)/)?.[1];
    if (lectureId) {
      const lecture = {
        id: lectureId,
        href: href,
        title: link.textContent?.trim().substring(0, 60),
        index: lectures.length
      };

      // 检查是否当前课
      if (lectureId === results.lectureId) {
        currentIndex = lectures.length;
        lecture.isCurrent = true;
      }

      lectures.push(lecture);
    }
  });

  results.curriculumItems = lectures;
  results.currentIndex = currentIndex;

  if (currentIndex >= 0 && currentIndex < lectures.length - 1) {
    results.nextLecture = lectures[currentIndex + 1];
    console.log('\n[Result] Next lecture found:');
    console.log('  ID:', results.nextLecture.id);
    console.log('  Title:', results.nextLecture.title);
    console.log('  URL:', results.nextLecture.href);
  } else if (currentIndex === lectures.length - 1) {
    console.log('\n[Result] Current lecture is the LAST one');
  } else {
    console.log('\n[Warning] Could not determine current position');
  }

  console.log('\n[Summary]');
  console.log('- Total lectures found:', lectures.length);
  console.log('- Current index:', currentIndex);
  console.log('- Has next:', results.nextLecture !== null);

  return results;
})();
```

#### 脚本 6: 完整验证 - 获取下一课 ID 的可用方法

```javascript
// Spike Test 6: 完整验证流程 - 确定获取下一课 ID 的最佳方法
(async function fullNextLectureVerification() {
  console.log('='.repeat(70));
  console.log('[Spike] FULL VERIFICATION: Next Lecture ID Extraction Methods');
  console.log('='.repeat(70));

  const results = {
    timestamp: new Date().toISOString(),
    url: window.location.href,
    currentLectureId: null,
    methods: {
      sidebarDOM: { success: false, nextId: null, selectors: [] },
      navButton: { success: false, nextId: null, selector: null },
      globalData: { success: false, nextId: null, source: null },
      urlLinks: { success: false, nextId: null, count: 0 }
    },
    finalResult: null,
    edgeCases: {
      isLastLecture: false,
      crossSection: false
    }
  };

  // 获取当前 lecture ID
  results.currentLectureId = window.location.pathname.match(/lecture\/(\d+)/)?.[1];
  console.log('[Current] Lecture ID:', results.currentLectureId);

  // ==================== 方法 1: 侧边栏 DOM ====================
  console.log('\n--- Method 1: Sidebar DOM ---');

  const sidebarSelectors = [
    '[data-purpose="curriculum-section-container"]',
    '[class*="curriculum-item"]',
    '.ud-accordion-panel'
  ];

  let allLectureLinks = [];
  for (const selector of sidebarSelectors) {
    const container = document.querySelector(selector);
    if (container) {
      const links = container.querySelectorAll('a[href*="/lecture/"]');
      if (links.length > 0) {
        allLectureLinks = Array.from(links);
        results.methods.sidebarDOM.selectors.push(selector);
        break;
      }
    }
  }

  // 如果侧边栏没找到，尝试全局搜索
  if (allLectureLinks.length === 0) {
    allLectureLinks = Array.from(document.querySelectorAll('a[href*="/lecture/"]'));
  }

  // 去重并排序
  const lectureMap = new Map();
  allLectureLinks.forEach(link => {
    const id = link.href.match(/lecture\/(\d+)/)?.[1];
    if (id && !lectureMap.has(id)) {
      lectureMap.set(id, {
        id,
        href: link.href,
        title: link.textContent?.trim().substring(0, 50)
      });
    }
  });

  const lectures = Array.from(lectureMap.values());
  const currentIndex = lectures.findIndex(l => l.id === results.currentLectureId);

  if (currentIndex >= 0 && currentIndex < lectures.length - 1) {
    results.methods.sidebarDOM.success = true;
    results.methods.sidebarDOM.nextId = lectures[currentIndex + 1].id;
    console.log('[Sidebar] SUCCESS - Next ID:', results.methods.sidebarDOM.nextId);
  } else if (currentIndex === lectures.length - 1) {
    results.edgeCases.isLastLecture = true;
    console.log('[Sidebar] Current is LAST lecture');
  } else {
    console.log('[Sidebar] Could not find current lecture in list');
  }

  // ==================== 方法 2: 导航按钮 ====================
  console.log('\n--- Method 2: Navigation Button ---');

  const navSelectors = [
    '[data-purpose="go-to-next"]',
    'a[aria-label*="next" i]',
    'button[aria-label*="next" i]',
    '[class*="next"][href*="lecture"]'
  ];

  for (const selector of navSelectors) {
    try {
      const btn = document.querySelector(selector);
      if (btn) {
        const href = btn.getAttribute('href') || btn.dataset?.href;
        if (href) {
          const nextId = href.match(/lecture\/(\d+)/)?.[1];
          if (nextId) {
            results.methods.navButton.success = true;
            results.methods.navButton.nextId = nextId;
            results.methods.navButton.selector = selector;
            console.log('[NavButton] SUCCESS - Next ID:', nextId);
            break;
          }
        }
      }
    } catch (e) {}
  }

  if (!results.methods.navButton.success) {
    console.log('[NavButton] No direct href found on nav buttons');
  }

  // ==================== 方法 3: 全局数据 (UD object) ====================
  console.log('\n--- Method 3: Global Data (UD) ---');

  if (typeof UD !== 'undefined') {
    // 搜索可能包含 next lecture 的路径
    const searchPaths = [
      () => UD.lecture?.nextLecture?.id,
      () => UD.lectureInfo?.next?.id,
      () => UD.courseTakingData?.nextLecture?.id,
      () => UD.config?.lecture?.next?.id,
      () => UD.videoPlayer?.nextLecture?.id,
      () => UD.data?.nextLectureId
    ];

    for (const pathFn of searchPaths) {
      try {
        const nextId = pathFn();
        if (nextId) {
          results.methods.globalData.success = true;
          results.methods.globalData.nextId = String(nextId);
          results.methods.globalData.source = pathFn.toString().match(/UD\.([^)]+)/)?.[1];
          console.log('[GlobalData] SUCCESS - Next ID:', nextId);
          break;
        }
      } catch (e) {}
    }

    if (!results.methods.globalData.success) {
      console.log('[GlobalData] No next lecture ID found in UD object');
      // 输出 UD 结构供调试
      console.log('[GlobalData] UD keys for debugging:', Object.keys(UD));
    }
  } else {
    console.log('[GlobalData] UD object not found');
  }

  // ==================== 方法 4: 页面中所有 lecture 链接 ====================
  console.log('\n--- Method 4: All Lecture Links ---');

  results.methods.urlLinks.count = lectures.length;
  if (results.methods.sidebarDOM.success) {
    results.methods.urlLinks.success = true;
    results.methods.urlLinks.nextId = results.methods.sidebarDOM.nextId;
  }
  console.log('[URLLinks] Total unique lectures:', lectures.length);

  // ==================== 确定最佳方法 ====================
  console.log('\n' + '='.repeat(70));
  console.log('[FINAL RESULTS]');
  console.log('='.repeat(70));

  // 优先级: navButton > globalData > sidebarDOM > urlLinks
  let bestMethod = null;
  let nextLectureId = null;

  if (results.methods.navButton.success) {
    bestMethod = 'navButton';
    nextLectureId = results.methods.navButton.nextId;
  } else if (results.methods.globalData.success) {
    bestMethod = 'globalData';
    nextLectureId = results.methods.globalData.nextId;
  } else if (results.methods.sidebarDOM.success) {
    bestMethod = 'sidebarDOM';
    nextLectureId = results.methods.sidebarDOM.nextId;
  } else if (results.methods.urlLinks.success) {
    bestMethod = 'urlLinks';
    nextLectureId = results.methods.urlLinks.nextId;
  }

  results.finalResult = {
    bestMethod,
    nextLectureId,
    nextLectureUrl: nextLectureId ?
      window.location.href.replace(/lecture\/\d+/, `lecture/${nextLectureId}`) : null
  };

  console.log('\n[Best Method]:', bestMethod || 'NONE');
  console.log('[Next Lecture ID]:', nextLectureId || 'NOT FOUND');
  console.log('[Next Lecture URL]:', results.finalResult.nextLectureUrl || 'N/A');
  console.log('\n[Edge Cases]:');
  console.log('  - Is last lecture:', results.edgeCases.isLastLecture);
  console.log('  - Cross section:', results.edgeCases.crossSection);

  console.log('\n[Method Summary]:');
  Object.entries(results.methods).forEach(([method, data]) => {
    const status = data.success ? '✓' : '✗';
    console.log(`  ${status} ${method}: ${data.nextId || 'N/A'}`);
  });

  console.log('\n[Recommended Implementation]:');
  if (bestMethod === 'navButton') {
    console.log('  Use navigation button selector: ' + results.methods.navButton.selector);
  } else if (bestMethod === 'globalData') {
    console.log('  Use UD.' + results.methods.globalData.source);
  } else {
    console.log('  Parse lecture links from sidebar DOM');
  }

  return results;
})();
```

---

## 4. 预期数据结构

### 4.1 Udemy URL 模式

```
基础格式: /course/{slug}/learn/lecture/{lecture_id}

示例:
- /course/2d-rpg-alexdev/learn/lecture/36963178 (当前课)
- /course/2d-rpg-alexdev/learn/lecture/36963180 (下一课)
```

### 4.2 可能的 UD 对象结构

```javascript
// 预期可能存在的数据路径
UD.config.lecture.nextLecture = {
  id: "36963180",
  title: "..."
};

// 或
UD.courseTakingData = {
  currentLectureId: "36963178",
  curriculum: [
    { id: "36963176", type: "lecture" },
    { id: "36963178", type: "lecture" },  // current
    { id: "36963180", type: "lecture" },  // next
    ...
  ]
};
```

### 4.3 DOM 结构预期

```html
<!-- 侧边栏课程列表 -->
<div data-purpose="curriculum-section-container">
  <div class="curriculum-item">
    <a href="/course/slug/learn/lecture/36963176">Lecture 1</a>
  </div>
  <div class="curriculum-item active">
    <a href="/course/slug/learn/lecture/36963178">Lecture 2 (当前)</a>
  </div>
  <div class="curriculum-item">
    <a href="/course/slug/learn/lecture/36963180">Lecture 3 (下一课)</a>
  </div>
</div>

<!-- 导航按钮 -->
<a data-purpose="go-to-next" href="/course/slug/learn/lecture/36963180">
  Next
</a>
```

---

## 5. 边界情况处理

### 5.1 最后一课

当用户在章节或课程的最后一课时：

```javascript
function getNextLecture() {
  // ... 获取 lectures 列表和 currentIndex ...

  if (currentIndex === lectures.length - 1) {
    return {
      hasNext: false,
      isLastInSection: true,
      // 可选: 检查是否有下一个章节
      nextSection: findNextSection()
    };
  }

  return {
    hasNext: true,
    nextLectureId: lectures[currentIndex + 1].id
  };
}
```

### 5.2 跨章节

课程通常分多个 Section (章节)，需要处理跨章节情况：

```javascript
function getNextLectureWithSection() {
  const sections = document.querySelectorAll('[data-purpose="section-panel"]');

  // 找到当前课在哪个 section
  let currentSectionIndex = -1;
  let currentLectureInSection = -1;

  sections.forEach((section, sectionIndex) => {
    const lecturesInSection = section.querySelectorAll('a[href*="/lecture/"]');
    lecturesInSection.forEach((lecture, lectureIndex) => {
      if (lecture.href.includes(currentLectureId)) {
        currentSectionIndex = sectionIndex;
        currentLectureInSection = lectureIndex;
      }
    });
  });

  // 检查是否是 section 最后一课
  const currentSection = sections[currentSectionIndex];
  const lecturesInCurrentSection = currentSection.querySelectorAll('a[href*="/lecture/"]');

  if (currentLectureInSection === lecturesInCurrentSection.length - 1) {
    // 最后一课，需要获取下一个 section 的第一课
    if (currentSectionIndex < sections.length - 1) {
      const nextSection = sections[currentSectionIndex + 1];
      const firstLectureInNextSection = nextSection.querySelector('a[href*="/lecture/"]');
      return {
        nextLectureId: extractLectureId(firstLectureInNextSection.href),
        crossSection: true
      };
    }
  }

  // 同一 section 内的下一课
  return {
    nextLectureId: extractLectureId(lecturesInCurrentSection[currentLectureInSection + 1].href),
    crossSection: false
  };
}
```

### 5.3 非视频内容

课程可能包含非视频内容（测验、文章等），需要过滤：

```javascript
function getNextVideoLecture() {
  const lectures = getAllLectures();
  const currentIndex = getCurrentIndex();

  // 查找下一个视频类型的课时
  for (let i = currentIndex + 1; i < lectures.length; i++) {
    const lecture = lectures[i];
    // 检查是否是视频类型
    if (lecture.type === 'video' || lecture.hasVideo) {
      return lecture.id;
    }
  }

  return null; // 没有更多视频课时
}
```

---

## 6. 推荐实现方案

### 6.1 优先级策略

```javascript
/**
 * 获取下一课 ID 的推荐实现
 * 按优先级尝试多种方法，确保稳定性
 */
function getNextLectureId() {
  // 方法 1: 优先检查导航按钮 (最直接)
  const navButton = document.querySelector('[data-purpose="go-to-next"]');
  if (navButton?.href) {
    const id = navButton.href.match(/lecture\/(\d+)/)?.[1];
    if (id) return { id, method: 'navButton' };
  }

  // 方法 2: 检查全局 UD 对象 (如果有)
  if (typeof UD !== 'undefined') {
    const nextId = UD.config?.lecture?.nextLecture?.id ||
                   UD.lectureInfo?.next?.id;
    if (nextId) return { id: String(nextId), method: 'globalData' };
  }

  // 方法 3: 解析侧边栏 DOM (最可靠的备选)
  const currentId = window.location.pathname.match(/lecture\/(\d+)/)?.[1];
  const lectureLinks = document.querySelectorAll('a[href*="/lecture/"]');
  const lectures = [];

  lectureLinks.forEach(link => {
    const id = link.href.match(/lecture\/(\d+)/)?.[1];
    if (id && !lectures.find(l => l.id === id)) {
      lectures.push({ id, href: link.href });
    }
  });

  const currentIndex = lectures.findIndex(l => l.id === currentId);
  if (currentIndex >= 0 && currentIndex < lectures.length - 1) {
    return { id: lectures[currentIndex + 1].id, method: 'sidebarDOM' };
  }

  // 没找到下一课
  return { id: null, method: 'none', isLast: currentIndex === lectures.length - 1 };
}
```

### 6.2 Content Script 集成示例

```javascript
// src/content/next-lecture-detector.ts

interface NextLectureResult {
  hasNext: boolean;
  lectureId: string | null;
  lectureUrl: string | null;
  method: 'navButton' | 'globalData' | 'sidebarDOM' | 'none';
  isLastInSection: boolean;
  isLastInCourse: boolean;
}

export function detectNextLecture(): NextLectureResult {
  const result: NextLectureResult = {
    hasNext: false,
    lectureId: null,
    lectureUrl: null,
    method: 'none',
    isLastInSection: false,
    isLastInCourse: false
  };

  const currentLectureId = window.location.pathname.match(/lecture\/(\d+)/)?.[1];
  if (!currentLectureId) return result;

  // 尝试获取下一课
  const nextLecture = getNextLectureId();

  if (nextLecture.id) {
    result.hasNext = true;
    result.lectureId = nextLecture.id;
    result.lectureUrl = window.location.href.replace(
      /lecture\/\d+/,
      `lecture/${nextLecture.id}`
    );
    result.method = nextLecture.method;
  } else {
    result.isLastInSection = nextLecture.isLastInSection || false;
    result.isLastInCourse = nextLecture.isLast || false;
  }

  return result;
}
```

---

## 7. 验证结论

### 7.1 技术可行性: 待验证

| 方案 | 预期可行性 | 稳定性 | 推荐度 |
|------|-----------|--------|--------|
| 导航按钮 | 高 | 中等 | ★★★★☆ |
| UD 全局对象 | 中 | 低 | ★★★☆☆ |
| 侧边栏 DOM | 高 | 高 | ★★★★★ |
| API 请求 | 高 | 高 | ★★★☆☆ |

### 7.2 推荐策略

1. **首选**: 解析侧边栏 DOM 中的 lecture 链接
   - 最稳定，不依赖 Udemy 内部数据结构
   - 可处理跨章节情况

2. **备选**: 导航按钮的 href 属性
   - 如果存在，是最直接的方法
   - 可能不包含跨章节信息

3. **降级**: 全局 UD 对象
   - 依赖 Udemy 内部实现，可能随更新失效

---

## 8. 下一步行动

1. **[用户操作]** 在 Udemy 测试页面执行上述 6 个脚本
2. **[记录]** 将实际测试结果更新到本文档第 9 节
3. **[确定方案]** 基于测试结果确定最佳实现方法
4. **[解除阻塞]** 验证通过后更新 record.json 状态
5. **[推进开发]** 为预加载模块 (ACT-011) 提供接口设计

---

## 9. 实际测试记录

### 9.1 测试环境

- 测试日期: 2025-12-23
- Chrome 版本: 最新稳定版
- 测试 URL: https://www.udemy.com/course/2d-rpg-alexdev/learn/lecture/36963178
- 课程 ID: 5059176

### 9.2 测试结果

| 测试项 | 结果 | 备注 |
|--------|------|------|
| 全局数据探索 | ✅ 成功 | UD 对象存在，但不含 curriculum 数据 |
| 侧边栏 DOM 分析 | ⚠️ 部分 | 只加载当前章节的 4 个项目，不含完整列表 |
| 导航按钮分析 | ⚠️ 部分 | `go-to-next` 按钮存在，但无直接 href |
| UD 对象探索 | ❌ 失败 | UD 对象不含 lecture/curriculum 数据 |
| Curriculum API | ✅ **成功** | 获取到 224 个课程项目，完整可用 |
| 完整验证流程 | ✅ 成功 | API 方案验证通过 |

### 9.3 Console 输出记录

#### 初始测试 (脚本 6)
```
[Current] Lecture ID: 36963178
[Sidebar] Current is LAST lecture (注：侧边栏折叠导致)
[URLLinks] Total unique lectures: 0
[Best Method]: NONE
```

#### 增强探索
```
[Found] [data-purpose="sidebar"] {visible: true, children: 1}
[Found] [data-purpose="curriculum-section-container"] {visible: true, children: 21}
[Links] Found 0 unique lecture links (注：Udemy 不使用 <a> 标签)
[Data-Purpose] Relevant attributes: {go-to-next: 1, curriculum-item-0-0: 1, ...}
```

#### 针对性探索 (最终验证)
```
[NextBtn] Found!
  Tag: DIV
  Class: item-link next-and-previous--button---fNLz next-and-previous--next--8Avih
  href: null
  [React Props]: tabIndex, onClick, data-purpose, ...

[Items] Found 4 curriculum items
  curriculum-item-0-0: "1. Important to know - Mindset of the ..."
  curriculum-item-0-1: "2. Important to know - Bugs and Q&A..."
  curriculum-item-0-2: "3. Important to know - Pep talk..."

[API] SUCCESS! Results: 224 items
[API] Current lecture at index 0: Important to know - Mindset of the course
[API] NEXT LECTURE: {id: 36963182, title: 'Important to know - Bugs and Q&A', index: 2}
```

### 9.4 确认的方案

- **最终采用方案**: **Curriculum API** (首选)
- **API 端点**: `https://www.udemy.com/api-2.0/courses/{courseId}/subscriber-curriculum-items/`
- **课程 ID 获取**: 从 Network 请求或 URL 模式匹配
- **备选方案**: DOM 解析 `[data-purpose^="curriculum-item-"]`

### 9.5 验证的数据结构

#### API 响应结构
```javascript
{
  "results": [
    {
      "_class": "lecture",
      "id": 36963178,
      "title": "Important to know - Mindset of the course",
      "object_index": 1,
      "is_published": true,
      "sort_order": 1,
      "asset": { ... }
    },
    {
      "_class": "lecture",
      "id": 36963182,
      "title": "Important to know - Bugs and Q&A",
      "object_index": 2,
      // ... 下一课
    },
    // ... 共 224 项
  ]
}
```

#### 课程项类型
- `_class: "lecture"` - 视频/文档课时
- `_class: "chapter"` - 章节标题
- `_class: "quiz"` - 测验
- `_class: "practice"` - 练习

### 9.6 关键发现

1. **Udemy 不使用传统 `<a>` 标签**
   - 课程导航使用 React 组件 + onClick
   - `go-to-next` 按钮是 `<div role="link">` 而非 `<a>`

2. **侧边栏懒加载**
   - 只渲染当前章节的课程项
   - 完整课程数据需要通过 API 获取

3. **API 是最可靠方案**
   - 返回完整课程结构 (224 项)
   - 包含所有类型：lecture, chapter, quiz, practice
   - 包含排序信息 (object_index, sort_order)

4. **课程 ID 获取方式**
   - 从 Network 请求: `api-2.0/courses/5059176/`
   - 或从 UD.Config 解析

---

## 10. 推荐实现代码

### 10.1 完整的下一课 ID 获取模块

```typescript
// src/content/next-lecture-detector.ts

interface LectureInfo {
  id: number;
  title: string;
  objectIndex: number;
  type: 'lecture' | 'chapter' | 'quiz' | 'practice';
}

interface NextLectureResult {
  hasNext: boolean;
  currentLecture: LectureInfo | null;
  nextLecture: LectureInfo | null;
  isLastInCourse: boolean;
  method: 'api' | 'dom' | 'none';
  courseId: string | null;
}

/**
 * 从当前页面 URL 提取课程 slug 和 lecture ID
 */
function parseCurrentUrl(): { courseSlug: string; lectureId: string } | null {
  const match = window.location.pathname.match(/\/course\/([^\/]+)\/learn\/lecture\/(\d+)/);
  if (!match) return null;
  return { courseSlug: match[1], lectureId: match[2] };
}

/**
 * 获取课程 ID (从 API 请求或页面数据)
 */
async function getCourseId(): Promise<string | null> {
  // 方法 1: 从 Performance API 查找已有的课程 API 请求
  const apiCalls = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
  for (const call of apiCalls) {
    const match = call.name.match(/api-2\.0\/courses\/(\d+)/);
    if (match) return match[1];
  }

  // 方法 2: 从课程页面发起一个小请求来获取 course ID
  const urlInfo = parseCurrentUrl();
  if (!urlInfo) return null;

  try {
    const response = await fetch(
      `https://www.udemy.com/api-2.0/courses/${urlInfo.courseSlug}/?fields[course]=id`,
      { credentials: 'include' }
    );
    if (response.ok) {
      const data = await response.json();
      return String(data.id);
    }
  } catch (e) {
    console.error('[NextLecture] Failed to get course ID:', e);
  }

  return null;
}

/**
 * 通过 Curriculum API 获取下一课信息 (推荐方案)
 */
async function getNextLectureViaAPI(courseId: string, currentLectureId: string): Promise<NextLectureResult> {
  const result: NextLectureResult = {
    hasNext: false,
    currentLecture: null,
    nextLecture: null,
    isLastInCourse: false,
    method: 'api',
    courseId
  };

  const apiUrl = `https://www.udemy.com/api-2.0/courses/${courseId}/subscriber-curriculum-items/` +
    `?page_size=1400&fields[lecture]=title,object_index,is_published,sort_order,asset` +
    `&fields[chapter]=title,object_index&fields[quiz]=title,object_index` +
    `&fields[practice]=title,object_index&caching_intent=True`;

  try {
    const response = await fetch(apiUrl, { credentials: 'include' });
    if (!response.ok) {
      console.error('[NextLecture] API request failed:', response.status);
      return result;
    }

    const data = await response.json();
    const items: any[] = data.results || [];

    // 过滤出 lecture 类型的项目
    const lectures = items.filter(item => item._class === 'lecture');

    // 查找当前课程的索引
    const currentIndex = lectures.findIndex(l => String(l.id) === currentLectureId);

    if (currentIndex >= 0) {
      result.currentLecture = {
        id: lectures[currentIndex].id,
        title: lectures[currentIndex].title,
        objectIndex: lectures[currentIndex].object_index,
        type: 'lecture'
      };

      if (currentIndex < lectures.length - 1) {
        result.hasNext = true;
        result.nextLecture = {
          id: lectures[currentIndex + 1].id,
          title: lectures[currentIndex + 1].title,
          objectIndex: lectures[currentIndex + 1].object_index,
          type: 'lecture'
        };
      } else {
        result.isLastInCourse = true;
      }
    }
  } catch (e) {
    console.error('[NextLecture] API error:', e);
  }

  return result;
}

/**
 * 主入口函数: 获取下一课信息
 */
export async function detectNextLecture(): Promise<NextLectureResult> {
  const urlInfo = parseCurrentUrl();
  if (!urlInfo) {
    return {
      hasNext: false,
      currentLecture: null,
      nextLecture: null,
      isLastInCourse: false,
      method: 'none',
      courseId: null
    };
  }

  const courseId = await getCourseId();
  if (!courseId) {
    console.warn('[NextLecture] Could not determine course ID');
    return {
      hasNext: false,
      currentLecture: null,
      nextLecture: null,
      isLastInCourse: false,
      method: 'none',
      courseId: null
    };
  }

  return await getNextLectureViaAPI(courseId, urlInfo.lectureId);
}

/**
 * 构建下一课的 URL
 */
export function buildNextLectureUrl(nextLectureId: number): string {
  const currentUrl = window.location.href;
  return currentUrl.replace(/\/lecture\/\d+/, `/lecture/${nextLectureId}`);
}
```

### 10.2 使用示例

```typescript
// 在 Content Script 中使用
import { detectNextLecture, buildNextLectureUrl } from './next-lecture-detector';

async function preloadNextLecture() {
  const result = await detectNextLecture();

  if (result.hasNext && result.nextLecture) {
    console.log('Next lecture:', result.nextLecture.title);
    console.log('Next lecture ID:', result.nextLecture.id);
    console.log('Next lecture URL:', buildNextLectureUrl(result.nextLecture.id));

    // 触发预加载逻辑...
  } else if (result.isLastInCourse) {
    console.log('This is the last lecture in the course');
  }
}
```

### 10.3 边界情况处理

| 场景 | 处理方式 |
|------|---------|
| 最后一课 | `isLastInCourse: true`, `nextLecture: null` |
| 跨章节 | API 返回完整列表，自动处理 |
| 非视频内容 | 可通过 `_class` 字段过滤 |
| API 失败 | 返回 `method: 'none'`，调用方可降级处理 |
| 课程 ID 未知 | 先通过 slug 查询 course ID |

---

## 11. 结论与下一步

### 11.1 Spike 结论

| 维度 | 结论 |
|------|------|
| 技术可行性 | ✅ 完全可行 |
| 推荐方案 | Curriculum API |
| API 稳定性 | 高 (Udemy 官方 API) |
| 实现复杂度 | 低 |

### 11.2 解除的阻塞

- **DEP-003** (Udemy Web 前端): `pending_verification` → `verified`
- **T-20251223-act-011-build-preload**: 可以开始实现

### 11.3 下一步行动

1. 将 `next-lecture-detector.ts` 集成到扩展架构中
2. 在预加载模块 (ACT-011) 中调用此接口
3. 添加缓存机制避免重复 API 请求
4. 监控 API 变化，建立回归测试

---

## 附录 A: 快速测试命令

复制以下代码到 Udemy 课程页 Console 一键测试：

```javascript
// 一键完整测试 (脚本 6)
// 复制 "脚本 6: 完整验证" 的全部内容到 Console 执行
```

## 附录 B: 相关文件

- [spike-report-track-inject.md](./spike-report-track-inject.md) - Track 注入 Spike 报告
- [record.json](./record.json) - 任务追踪文件
