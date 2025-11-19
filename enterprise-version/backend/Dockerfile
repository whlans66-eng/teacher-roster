# =====================================================
# 建置階段
# =====================================================
FROM node:18-alpine AS builder

WORKDIR /app

# 複製 package 檔案
COPY package*.json ./

# 安裝所有依賴（包含 devDependencies）
RUN npm ci

# 複製原始碼
COPY . .

# 建置 TypeScript
RUN npm run build

# =====================================================
# 生產階段
# =====================================================
FROM node:18-alpine

WORKDIR /app

# 建立非 root 用戶
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# 複製 package 檔案
COPY package*.json ./

# 只安裝生產依賴
RUN npm ci --only=production && npm cache clean --force

# 從建置階段複製編譯後的檔案
COPY --from=builder /app/dist ./dist

# 建立必要的目錄
RUN mkdir -p uploads logs && \
    chown -R nodejs:nodejs /app

# 切換到非 root 用戶
USER nodejs

# 暴露端口
EXPOSE 3001

# 健康檢查
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3001/health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1))"

# 啟動應用
CMD ["node", "dist/server.js"]
