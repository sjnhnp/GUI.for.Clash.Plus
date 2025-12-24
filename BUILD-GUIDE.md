# GUI for Clash - GitHub Actions 构建指南

## 🚀 构建方式

### 方式 1：推送 Tag（推荐用于正式发布）

**步骤：**
```bash
# 1. 确保代码已提交
git add .
git commit -m "Your changes"

# 2. 创建并推送 tag
git tag v1.17.0
git push origin v1.17.0
```

**结果：**
- ✅ 自动触发 GitHub Actions 构建
- ✅ 版本号设置为 `v1.17.0`
- ✅ 应用标题显示：`GUI.for.Clash v1.17.0`
- ✅ 自动创建 GitHub Release 并上传构建文件

---

### 方式 2：手动触发（用于测试或自定义版本）

#### 选项 A：指定版本号

**步骤：**
1. 进入 GitHub 仓库的 **Actions** 页面
2. 选择 **Build GUI.for.Clash** workflow
3. 点击 **Run workflow** 按钮
4. 在 **Version tag** 输入框中输入版本号，例如：`v1.17.1`
5. 点击绿色的 **Run workflow** 按钮

**结果：**
- ✅ 版本号设置为您输入的 `v1.17.1`
- ✅ 应用标题显示：`GUI.for.Clash v1.17.1`

#### 选项 B：自动递增版本号

**步骤：**
1. 进入 GitHub 仓库的 **Actions** 页面
2. 选择 **Build GUI.for.Clash** workflow
3. 点击 **Run workflow** 按钮
4. **留空** Version tag 输入框
5. 点击绿色的 **Run workflow** 按钮

**结果：**
- ✅ 自动检测最新 tag（例如 `v1.16.0`）
- ✅ 自动递增 patch 版本号为 `v1.16.1`
- ✅ 应用标题显示：`GUI.for.Clash v1.16.1`
- ℹ️ 构建日志会显示：`Auto-incremented version from v1.16.0 to v1.16.1`

---

## 📋 版本号规则

版本号格式：`vMAJOR.MINOR.PATCH`

**示例：** `v1.16.0`
- `1` - MAJOR（主版本号）
- `16` - MINOR（次版本号）
- `0` - PATCH（修订版本号）

**自动递增规则：**
- 仅递增 PATCH 版本号
- `v1.16.0` → `v1.16.1`
- `v1.16.5` → `v1.16.6`

**手动指定主/次版本号：**
- 如果需要升级 MAJOR 或 MINOR 版本，需要手动指定
- 例如：`v1.17.0` 或 `v2.0.0`

---

## 🔍 构建流程

### 1. Build-Frontend
- 构建 Vue 前端
- 使用 pnpm
- 生成 `frontend/dist` 供后续使用

### 2. Build-Windows
- 获取版本号（tag/手动输入/自动递增）
- 构建三个架构：
  - `amd64` (64位 Intel/AMD)
  - `arm64` (ARM64)
  - `386` (32位)
- 使用 `-ldflags` 注入版本号到 `bridge.Version`
- 打包为 `.zip` 文件

### 3. Build-macOS
- 获取版本号（tag/手动输入/自动递增）
- 构建两个架构：
  - `amd64` (Intel Mac)
  - `arm64` (Apple Silicon)
- 使用 `-ldflags` 注入版本号到 `bridge.Version`
- 打包为 `.zip` 文件

### 4. Release
- 收集所有构建文件
- 创建 GitHub Release
- 上传所有 `.zip` 文件

---

## ✅ 验证构建

### 检查构建日志

在 GitHub Actions 页面，展开 **Get Version** 步骤：

**Tag 触发时：**
```
VERSION=v1.17.0
```

**手动触发（指定版本）：**
```
VERSION=v1.17.1
```

**手动触发（自动递增）：**
```
Auto-incremented version from v1.16.0 to v1.16.1
VERSION=v1.16.1
```

### 检查构建文件

下载并解压生成的 `.zip` 文件，运行应用：

**Windows：**
```
GUI.for.Clash.exe
```

**macOS：**
```
GUI.for.Clash.app
```

打开后检查窗口标题是否显示正确的版本号。

---

## 🛠️ 本地开发

本地构建时，版本号使用默认值 `v1.16.0`（在 `bridge/bridge.go` 中定义）。

**本地构建：**
```bash
cd frontend
npm run build
cd ..
wails build
```

**修改默认版本号：**

编辑 `bridge/bridge.go`：
```go
var Version = "v1.17.0"  // 修改这里
```

---

## 📊 版本管理策略建议

### 开发阶段
- 使用手动触发 + 自动递增（`v1.16.1`, `v1.16.2`, ...）
- 用于测试和内部使用

### 正式发布
- 使用 tag 触发
- 明确指定版本号（`v1.17.0`, `v2.0.0`, etc.）
- 自动创建 Release 供用户下载

### 版本号语义
- **MAJOR**：重大架构变更、不兼容更新
- **MINOR**：新功能、小改进
- **PATCH**：Bug 修复、小调整

---

## 🚨 故障排除

### 问题：自动递增失败

**可能原因：** 没有任何 tag

**解决方案：**
```bash
# 创建初始 tag
git tag v1.0.0
git push origin v1.0.0
```

### 问题：版本号显示为 v0.0.1

**原因：** 仓库中没有符合 `v[0-9]*` 格式的 tag，使用默认的 `v0.0.0` 并递增。

**解决方案：** 推送一个正确格式的 tag

### 问题：构建失败显示 git 错误

**解决方案：** 已修复！现在使用 `fetch-depth: 0` 获取完整 git 历史。

---

## 📝 总结

| 触发方式 | 版本号来源 | 用途 |
|---------|----------|------|
| 推送 tag | Tag 名称 | ✅ 正式发布 |
| 手动 + 输入版本 | 手动指定 | ✅ 自定义版本测试 |
| 手动 + 留空 | 自动递增 | ✅ 开发测试 |

所有方式都会在应用标题中正确显示版本号！🎉
