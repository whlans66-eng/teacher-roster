/**
 * localStore.js — 本機開發模式的資料表存取
 *
 * 對應舊檔：js/api.js 的 loadArrayFromStorage (:423) 與各頁散落的
 * localStorage.getItem/setItem 呼叫。
 *
 * 只有 isLocal 為真時才會真的讀寫；線上環境所有函式都是 no-op，
 * 讓領域模組可以安心寫成「本機走這條、線上走 API」的雙分支。
 */

import { isLocal } from '../config.js';

export function readLocalTable(key, fallbackValue = null) {
  if (!isLocal) return fallbackValue;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallbackValue;
  } catch {
    return fallbackValue;
  }
}

export function writeLocalTable(key, value) {
  if (!isLocal) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 容量已滿或無痕模式
  }
}

export function removeLocalTable(key) {
  if (!isLocal) return;
  try {
    localStorage.removeItem(key);
  } catch {
    // 忽略
  }
}

/**
 * 資料表鍵名。沿用舊版既有的 localStorage 鍵，讓已經在本機有資料的
 * 開發者不會因為改名而「資料整批不見」。
 */
export const LOCAL_TABLES = {
  teachers: 'teachers',
  assignments: 'courseAssignments',
  courses: 'maritimeCourses',
  leaves: 'teacherLeaves',
  materials: 'teachingMaterials',
  comments: 'courseComments',
  permissions: 'permissions'
};
