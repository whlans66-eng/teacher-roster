# Course Management 重构快速参考

## 🎯 新增功能一览

### 1. 师资侧边栏 (左侧 1/4 屏幕)
**位置**: 页面左侧固定栏
**功能**:
- 实时搜索师资
- 快速过滤（全部/已达标/未达标）
- 点击选择师资进行筛选
- 显示本月时数进度

**相关函数**:
- `renderSidebarTeachers()` - 渲染师资列表
- `filterSidebarTeachers()` - 搜索过滤
- `filterByStatus(status)` - 状态过滤

---

### 2. 动态统计卡片
**位置**: 主内容区顶部
**功能**:
- 总课程数、总时数、本月时数
- 根据筛选条件自动变色

**相关函数**:
- `updateStatCardColors()` - 更新卡片颜色
- `updateStatistics()` - 更新统计数据

---

### 3. SVG 甜甜圈图
**位置**: 课程类型分布区域
**功能**:
- 可视化课程类型占比
- 中心显示总数
- 悬停提示详情

**相关函数**:
- `renderDonutChart()` - 渲染甜甜圈图

---

### 4. 个人剩余时数卡片
**位置**: 选择师资后显示
**功能**:
- 紫色渐变背景
- 环形进度图
- 显示剩余时数

**相关函数**:
- `renderRemainingHoursCard()` - 渲染时数卡片

---

### 5. 行事历展开/收合
**位置**: 行事历标题右侧
**功能**:
- 点击按钮展开/收合
- 流畅动画过渡

**相关函数**:
- `toggleCalendar()` - 切换展开状态

---

### 6. 课程评鉴系统
**位置**: 课程详情 Modal → 课程评鉴按钮
**功能**:
- 5 星整体评分
- 5 项详细评分（1-5 分）
- 文字评语
- 自动计算综合得分和等级

**相关函数**:
- `openEvaluationModal()` - 打开评鉴窗口
- `submitEvaluation()` - 提交评鉴
- `updateEvaluationSummary()` - 更新摘要

---

## 🎨 设计系统

### Slate 色系
```
slate-50:  #f8fafc  (背景)
slate-100: #f1f5f9  (次级背景)
slate-200: #e2e8f0  (边框)
slate-300: #cbd5e1  (输入框边框)
slate-600: #475569  (次要文字)
slate-700: #334155  (主要文字)
slate-800: #1e293b  (深色文字)
slate-900: #0f172a  (最深文字)
```

### 圆角系统
```
rounded-xl:  12px
rounded-2xl: 16px
rounded-3xl: 20px/24px
```

### 阴影系统
```
卡片: 0 1px 3px rgba(15, 23, 42, 0.08)
悬停: 0 4px 12px rgba(15, 23, 42, 0.12)
```

---

## 📝 关键调用链

### 页面初始化
```
init()
  ↓
renderCalendar()
renderSidebarTeachers()
renderDonutChart()
renderRemainingHoursCard()
updateStatistics()
```

### 选择师资
```
selectTeacher(teacherId)
  ↓
updateStatistics()
renderAllCourseViews()
  ↓
renderCalendar()
renderDonutChart()
renderSidebarTeachers()
renderRemainingHoursCard()
updateStatCardColors()
```

### 更新数据
```
saveData()
  ↓
renderAllCourseViews()
  ↓
renderCalendar()
renderDonutChart()
renderSidebarTeachers()
updateStatistics()
```

---

## 🔧 重要变量

```javascript
// 师资侧边栏
sidebarFilterStatus: 'all' | '达标' | '未达标'

// 行事历
isCalendarExpanded: boolean

// 评鉴数据
evaluationData: {
  courseId: number,
  overallRating: 1-5,
  contentScore: 1-5,
  methodScore: 1-5,
  interactionScore: 1-5,
  materialScore: 1-5,
  timeScore: 1-5,
  comment: string
}
```

---

## 📦 数据存储

```javascript
// localStorage keys
'teachers'           - 师资列表
'courseAssignments'  - 课程分配
'calendarEvents'     - 行事历事件
'courseEvaluations'  - 课程评鉴
```

---

## 🚨 注意事项

1. **备份文件**: 已创建 3 个备份
   - course-management.html.backup
   - course-management.html.bak2

2. **浏览器兼容性**:
   - 需要支持 CSS backdrop-filter
   - 需要支持 Flexbox 和 Grid
   - 建议使用现代浏览器

3. **性能优化**:
   - SVG 图表比 Canvas 更轻量
   - CSS 动画比 JS 动画更流畅
   - 避免频繁的 DOM 操作

4. **响应式设计**:
   - lg:grid-cols-4 (桌面端)
   - grid-cols-1 (移动端)
   - 自动适配屏幕大小

---

## 📞 技术支持

如有问题，请检查：
1. 浏览器控制台是否有错误
2. localStorage 是否正常工作
3. 是否有权限访问 js/api.js 和 js/auth.js

---

*快速参考 - 版本 2.0*
*更新时间: $(date '+%Y-%m-%d %H:%M:%S')*
