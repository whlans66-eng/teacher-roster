// ========================================
// 派課管理日期過濾診斷工具
// ========================================
// 在 Console 中執行這個腳本來診斷日期過濾問題

console.log('🔍 === 派課日期過濾診斷 ===\n');

// 1. 檢查當前日期範圍
console.log('📅 當前日期範圍：');
console.log('  開始日期:', currentCourseStartDate);
console.log('  結束日期:', currentCourseEndDate);
console.log('  格式:', typeof currentCourseStartDate);
console.log('');

// 2. 檢查所有派課數據的日期
console.log('📦 所有派課數據的日期：');
const allDates = courseAssignments.map(c => ({
  name: c.name,
  date: c.date,
  dateType: typeof c.date,
  teacherId: c.teacherId
}));
console.table(allDates);
console.log('');

// 3. 檢查 11/3 的數據
console.log('🎯 檢查 11/3 (2025-11-03) 的數據：');
const nov3Data = courseAssignments.filter(c => {
  const match1 = c.date === '2025-11-03';
  const match2 = c.date.includes('11-03') || c.date.includes('11/03');
  return match1 || match2;
});
console.log('  找到', nov3Data.length, '筆 11/3 的數據');
if (nov3Data.length > 0) {
  console.table(nov3Data);
} else {
  console.log('  ❌ 沒有找到 11/3 的數據');
  console.log('  可能的原因：');
  console.log('    1. 日期格式不是 2025-11-03');
  console.log('    2. 數據還沒有儲存');
  console.log('    3. 數據沒有正確載入');
}
console.log('');

// 4. 測試日期比較
console.log('🧪 測試日期比較：');
if (nov3Data.length > 0) {
  const testDate = nov3Data[0].date;
  console.log('  測試日期:', testDate);
  console.log('  開始日期:', currentCourseStartDate);
  console.log('  結束日期:', currentCourseEndDate);
  console.log('');
  console.log('  比較結果：');
  console.log('    testDate >= startDate:', testDate >= currentCourseStartDate);
  console.log('    testDate <= endDate:', testDate <= currentCourseEndDate);
  console.log('    在範圍內:', testDate >= currentCourseStartDate && testDate <= currentCourseEndDate);
} else {
  console.log('  ⚠️ 沒有 11/3 的數據可供測試');
}
console.log('');

// 5. 如果有選擇師資，測試過濾
if (currentCourseTeacherId) {
  console.log('👤 當前選擇的師資:', currentCourseTeacherId);
  console.log('');

  // 測試過濾
  const filtered = courseAssignments.filter(course => {
    const matchTeacher = Number(course.teacherId) === Number(currentCourseTeacherId);
    const inDateRange = (!currentCourseStartDate || !currentCourseEndDate) ||
                       (course.date >= currentCourseStartDate && course.date <= currentCourseEndDate);
    return matchTeacher && inDateRange;
  });

  console.log('🎯 過濾結果:', filtered.length, '筆課程');
  if (filtered.length > 0) {
    console.table(filtered.map(c => ({
      name: c.name,
      date: c.date,
      time: c.time,
      type: c.type
    })));
  }

  // 檢查該師資的 11/3 數據
  const teacherNov3 = nov3Data.filter(c => Number(c.teacherId) === Number(currentCourseTeacherId));
  console.log('');
  console.log('📌 該師資的 11/3 數據:', teacherNov3.length, '筆');
  if (teacherNov3.length > 0) {
    console.table(teacherNov3);

    // 檢查為什麼被過濾掉
    if (filtered.length === 0 || !filtered.some(c => c.date === '2025-11-03')) {
      console.log('');
      console.log('❌ 11/3 的數據被過濾掉了！');
      console.log('可能原因：');

      // 檢查日期比較
      const testDate = teacherNov3[0].date;
      if (testDate < currentCourseStartDate) {
        console.log('  ✗ 日期小於開始日期');
        console.log('    課程日期:', testDate);
        console.log('    開始日期:', currentCourseStartDate);
      }
      if (testDate > currentCourseEndDate) {
        console.log('  ✗ 日期大於結束日期');
        console.log('    課程日期:', testDate);
        console.log('    結束日期:', currentCourseEndDate);
      }
    }
  }
} else {
  console.log('⚠️ 尚未選擇師資');
}

console.log('');
console.log('💡 建議：');
console.log('  1. 檢查日期格式是否為 YYYY-MM-DD');
console.log('  2. 檢查日期範圍設置是否正確');
console.log('  3. 手動設置日期範圍測試：');
console.log('     currentCourseStartDate = "2025-11-01";');
console.log('     currentCourseEndDate = "2025-11-30";');
console.log('     updateCourseView();');
console.log('');
