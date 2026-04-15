import { ref } from 'vue';

export interface FetchLogEntry {
  label: string;
  startTime: number;
  endTime: number;
}

const logEntryList = ref<FetchLogEntry[]>([]);
let baseTime = 0;

export function useFetchLog() {
  return { logEntryList, resetLog, trackFetch };
}

export function resetLog() {
  logEntryList.value = [];
  baseTime = Date.now();
}

/**
 * 包裝 fetch 函式，自動記錄開始與結束時間。
 *
 * @example
 * const user = await trackFetch('User', () => fetchUser(1));
 */
export async function trackFetch<T>(
  label: string,
  fetcher: () => Promise<T>
): Promise<T> {
  if (baseTime === 0) {
    baseTime = Date.now();
  }

  const startTime = Date.now() - baseTime;
  const result = await fetcher();
  const endTime = Date.now() - baseTime;

  logEntryList.value.push({ label, startTime, endTime });
  return result;
}
