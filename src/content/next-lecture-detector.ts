/**
 * Next Lecture Detector
 *
 * Task ID: T-20251223-act-011-build-preload
 *
 * Uses Udemy Curriculum API (preferred) to resolve the "next lecture" ID for the
 * current lecture page. Includes a best-effort UD global fallback.
 */

export interface NextLectureDetectionParams {
  /** Course id used for cache key; may be numeric id or course slug */
  courseId: string;
  /** Course slug from URL */
  courseSlug: string;
  /** Current lecture id from URL */
  currentLectureId: string;
  /** Optional AbortSignal */
  signal?: AbortSignal;
}

export interface NextLectureDetectionResult {
  /** Next lecture id if present */
  nextLectureId: string | null;
  /** Next lecture title if available */
  nextLectureTitle?: string;
  /** Whether current lecture is the last lecture in the course */
  isLastLecture: boolean;
  /** Detection method used */
  method: 'curriculum-api' | 'ud-fallback' | 'none';
  /** Error message (best-effort) */
  error?: string;
}

type CurriculumItem = {
  _class?: string;
  id?: number;
  title?: string;
  object_index?: number;
  sort_order?: number;
  is_published?: boolean;
};

const LOG_PREFIX = '[UdemyCaptionPlus][NextLecture]';

function log(...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.log(LOG_PREFIX, ...args);
}

function warn(...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.warn(LOG_PREFIX, ...args);
}

function isNumericId(value: string): boolean {
  return /^\d+$/.test(value);
}

function toCourseIdString(id: unknown): string | null {
  if (typeof id === 'number' && Number.isFinite(id)) return String(id);
  if (typeof id === 'string' && id.trim() !== '') return id.trim();
  return null;
}

function getNumericCourseIdFromPage(): string | null {
  // Method 1: UD global object
  try {
    const ud = (window as unknown as { UD?: any }).UD;
    const candidates = [
      ud?.config?.course?.id,
      ud?.config?.brand?.course?.id,
      ud?.course?.id,
      ud?.courseTakingData?.courseId,
      ud?.config?.lecture?.courseId,
    ];

    for (const candidate of candidates) {
      const id = toCourseIdString(candidate);
      if (id && isNumericId(id)) return id;
    }
  } catch {
    // ignore
  }

  // Method 2: Performance entries (network requests)
  try {
    const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    for (const entry of entries) {
      const url = entry?.name;
      if (typeof url !== 'string') continue;
      const match = url.match(/api-2\.0\/courses\/(\d+)/) || url.match(/subscribed-courses\/(\d+)/);
      if (match?.[1]) return match[1];
    }
  } catch {
    // ignore
  }

  // Method 3: Data attribute
  const courseElement = document.querySelector('[data-course-id]');
  const courseId = courseElement?.getAttribute('data-course-id') || '';
  if (courseId && isNumericId(courseId)) return courseId;

  return null;
}

async function resolveNumericCourseId(
  params: Pick<NextLectureDetectionParams, 'courseId' | 'courseSlug' | 'signal'>
): Promise<string | null> {
  if (isNumericId(params.courseId)) return params.courseId;

  const fromPage = getNumericCourseIdFromPage();
  if (fromPage) return fromPage;

  // Fallback: try resolving by slug (best-effort; may not work on all deployments)
  try {
    const url = `https://www.udemy.com/api-2.0/courses/${encodeURIComponent(params.courseSlug)}/?fields[course]=id`;
    const response = await fetch(url, { credentials: 'include', signal: params.signal });
    if (!response.ok) return null;
    const data = (await response.json()) as { id?: number | string } | null;
    const id = toCourseIdString(data?.id);
    if (id && isNumericId(id)) return id;
  } catch {
    // ignore
  }

  return null;
}

function getNextLectureIdFromUD(): { id: string; title?: string } | null {
  try {
    const ud = (window as unknown as { UD?: any }).UD;
    const candidates: Array<() => unknown> = [
      () => ud?.lecture?.nextLecture?.id,
      () => ud?.lectureInfo?.next?.id,
      () => ud?.courseTakingData?.nextLecture?.id,
      () => ud?.config?.lecture?.next?.id,
      () => ud?.videoPlayer?.nextLecture?.id,
      () => ud?.data?.nextLectureId,
    ];

    for (const fn of candidates) {
      const raw = fn();
      const id = toCourseIdString(raw);
      if (id && isNumericId(id)) {
        const title = toCourseIdString(ud?.lecture?.nextLecture?.title) || undefined;
        return { id, title };
      }
    }
  } catch {
    // ignore
  }

  return null;
}

async function fetchCurriculumNextLecture(params: NextLectureDetectionParams): Promise<NextLectureDetectionResult> {
  const numericCourseId = await resolveNumericCourseId(params);
  if (!numericCourseId) {
    return {
      nextLectureId: null,
      isLastLecture: false,
      method: 'none',
      error: 'Unable to resolve numeric courseId for curriculum API',
    };
  }

  const apiUrl =
    `https://www.udemy.com/api-2.0/courses/${numericCourseId}/subscriber-curriculum-items/` +
    `?page_size=1400` +
    `&fields[lecture]=title,object_index,is_published,sort_order` +
    `&fields[chapter]=title,object_index` +
    `&fields[quiz]=title,object_index` +
    `&fields[practice]=title,object_index` +
    `&caching_intent=True`;

  try {
    const response = await fetch(apiUrl, { credentials: 'include', signal: params.signal });
    if (!response.ok) {
      return {
        nextLectureId: null,
        isLastLecture: false,
        method: 'none',
        error: `Curriculum API request failed: ${response.status}`,
      };
    }

    const data = (await response.json()) as { results?: CurriculumItem[] } | null;
    const items = Array.isArray(data?.results) ? data!.results! : [];

    const lectures = items
      .filter((item) => item && item._class === 'lecture' && item.is_published !== false)
      .filter((item) => typeof item.id === 'number')
      .slice()
      .sort((a, b) => {
        const aIdx = typeof a.object_index === 'number' ? a.object_index : typeof a.sort_order === 'number' ? a.sort_order : 0;
        const bIdx = typeof b.object_index === 'number' ? b.object_index : typeof b.sort_order === 'number' ? b.sort_order : 0;
        return aIdx - bIdx;
      });

    const currentIndex = lectures.findIndex((l) => String(l.id) === params.currentLectureId);
    if (currentIndex < 0) {
      return {
        nextLectureId: null,
        isLastLecture: false,
        method: 'none',
        error: 'Current lecture not found in curriculum',
      };
    }

    if (currentIndex >= lectures.length - 1) {
      return {
        nextLectureId: null,
        isLastLecture: true,
        method: 'curriculum-api',
      };
    }

    const next = lectures[currentIndex + 1];
    return {
      nextLectureId: String(next.id),
      nextLectureTitle: typeof next.title === 'string' ? next.title : undefined,
      isLastLecture: false,
      method: 'curriculum-api',
    };
  } catch (error) {
    return {
      nextLectureId: null,
      isLastLecture: false,
      method: 'none',
      error: String(error),
    };
  }
}

/**
 * Detect the next lecture ID for the current lecture.
 */
export async function detectNextLecture(
  params: NextLectureDetectionParams
): Promise<NextLectureDetectionResult> {
  // Prefer Curriculum API for cross-section correctness.
  const viaApi = await fetchCurriculumNextLecture(params);
  if (viaApi.method === 'curriculum-api' && (viaApi.nextLectureId || viaApi.isLastLecture)) {
    log('Resolved via curriculum API:', viaApi.nextLectureId || '(last lecture)');
    return viaApi;
  }

  const udNext = getNextLectureIdFromUD();
  if (udNext) {
    log('Resolved via UD fallback:', udNext.id);
    return {
      nextLectureId: udNext.id,
      nextLectureTitle: udNext.title,
      isLastLecture: false,
      method: 'ud-fallback',
    };
  }

  if (viaApi.error) warn('Failed to resolve via API:', viaApi.error);
  return {
    nextLectureId: null,
    isLastLecture: false,
    method: 'none',
    error: viaApi.error,
  };
}

