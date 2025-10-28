# 師資派課管理系統 - 整合指南

## 概述
本指南說明如何將以下功能整合到您的美觀介面中：
1. 行事曆視圖與管理
2. 智能衝堂檢查機制  
3. 派課與行事曆自動同步
4. 本週課表即時預覽

## 需要添加的代碼片段

### 1. 在 teachersData 後面添加行事曆數據結構

```javascript
// 行事曆事件資料
let calendarEvents = JSON.parse(localStorage.getItem('calendarEvents') || '[]');
let currentCalendarDate = new Date();
```

### 2. 修改 addCourse 函數，加入衝堂檢查

在原有的 addCourse 函數開頭添加：

```javascript
// 檢查是否有衝堂
const conflicts = checkTeacherConflict(currentTeacher, courseData.date, courseData.startTime, courseData.endTime);

if (conflicts.length > 0) {
    const conflictMessages = conflicts.map(c =>
        `- ${c.name} (${c.time}) [${c.type}] 來源：${c.source}`
    ).join('\n');

    const confirmMessage = `⚠️ 衝堂警告！\n\n該老師在此時段已有以下課程：\n${conflictMessages}\n\n是否仍要繼續派課？`;

    if (!confirm(confirmMessage)) {
        return; // 取消派課
    }
}
```

### 3. 在新增課程後添加行事曆同步

在 addCourse 函數中，teacher.courses.push(newCourse) 之後添加：

```javascript
// 同步到行事曆
calendarEvents.push({
    id: newCourse.id || Date.now(),
    date: courseData.date,
    title: `${courseData.name} - ${teacher.name}`,
    time: `${courseData.startTime}-${courseData.endTime}`,
    teacherId: currentTeacher,
    type: courseData.type,
    color: getCourseTypeColor(courseData.type),
    courseId: newCourse.id,
    source: 'course'
});
saveCalendarEvents();
```

### 4. 添加輔助函數

需要添加以下新函數：

- `checkTeacherConflict()` - 檢查老師衝堂
- `getCourseTypeColor()` - 獲取課程類型顏色
- `renderCalendar()` - 渲染行事曆
- `renderWeekSchedule()` - 渲染本週課表
- `saveCalendarEvents()` - 儲存行事曆數據

完整代碼請參考 integrated-functions.js
