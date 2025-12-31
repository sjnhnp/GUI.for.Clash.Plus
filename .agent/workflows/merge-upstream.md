---
description: 合并上游 GUI.for.Clash 项目的更新，同时保留所有自定义修改
---

# 合并上游更新工作流

这个工作流用于将上游 `GUI-for-Cores/GUI.for.Clash` 的更新合并到本 fork 项目，同时确保所有自定义修改不丢失。

## 项目信息

- **Fork 仓库**: `sjnhnp/gfc`
- **上游仓库**: `GUI-for-Cores/GUI.for.Clash`
- **上游 remote 名称**: `upstream`

## 本项目的自定义修改清单（合并时需要保留）

以下是需要特别注意保留的自定义功能：

1. **GitHub 代理镜像加速** (`githubProxy`)
   - 文件: `frontend/src/views/SettingsView/components/components/AdvancedSettings.vue`
   - 文件: `frontend/src/stores/appSettings.ts`
   - 文件: `frontend/src/hooks/useCoreBranch.ts`
   - 文件: `frontend/src/lang/locale/zh.ts`, `en.ts`
   - 文件: `frontend/src/types/app.d.ts`

2. **SUB-RULE 语法支持修复**
   - 文件: `frontend/src/utils/generator.ts`
   - 文件: `frontend/src/utils/restorer.ts`
   - 文件: `frontend/src/views/ProfilesView/components/RulesConfig.vue`

3. **fake-ip-filter 规则集支持**
   - 文件: `frontend/src/utils/generator.ts`
   - 文件: `frontend/src/utils/restorer.ts`

4. **Gist 同步插件预装**
   - 文件: `frontend/src/stores/plugins.ts`
   - 文件: `frontend/public/plugins/plugin-sync-configuration-gists-enhanced.js`
   - 文件: `frontend/public/plugins/crypto-js.js`

5. **自定义插件仓库**
   - 文件: `frontend/src/stores/plugins.ts` (添加第三方插件源加载 + 删除插件时调用 onUninstall)
   - 文件: `plugins/custom.json` (自定义插件列表)
   - 文件: `plugins/plugin-clash-api-dashboard-fixed.js` (修复版面板插件)

6. **GitHub Actions 自定义构建**
   - 文件: `.github/workflows/release.yml`
   - 文件: `.github/workflows/rolling-release.yml`

7. **Windows 休眠/唤醒后自动重启内核** (`onSystemResume`)
   - 文件: `bridge/power_windows.go` - Windows 电源事件监听
   - 文件: `bridge/power_others.go` - 非 Windows 平台占位
   - 文件: `frontend/src/App.vue` - 前端事件处理
   - 文件: `frontend/src/views/SettingsView/components/components/BehaviorSettings.vue` - 设置界面
   - 文件: `frontend/src/stores/appSettings.ts` - 设置存储
   - 文件: `frontend/src/types/app.d.ts` - 类型定义
   - 文件: `frontend/src/lang/locale/zh.ts`, `en.ts` - 翻译
   - 文件: `main.go` - 启动电源监听

8. **性能优化**
   - 虚拟滚动: `frontend/src/components/Table/index.vue`
   - shallowRef 优化: `frontend/src/views/HomeView/components/ConnectionsController.vue`
   - WebSocket 节流: `frontend/src/views/HomeView/components/GroupsController.vue`

9. **构建兼容性修复**
   - Rolldown-Vite 兼容: `frontend/vite.config.ts`
   - 32位 Windows 溢出修复: `bridge/power_windows.go`

10. **版本自动递增逻辑**
   - 基于最近创建的 tag 递增: `.github/workflows/release.yml`

11. **GFC Plus 品牌重命名**
    - 应用标题: `frontend/.env` (VITE_APP_TITLE, VITE_APP_NAME)
    - 类型定义: `frontend/env.d.ts` (VITE_APP_NAME)
    - 环境变量导出: `frontend/src/utils/env.ts` (APP_NAME)
    - 更新检查文件名: `frontend/src/stores/app.ts` (使用 APP_NAME)
    - Wails 配置: `wails.json`
    - README: `README.md`
    - Gist 插件识别: `frontend/public/plugins/plugin-sync-configuration-gists-enhanced.js`
    - 构建输出文件名: `.github/workflows/release.yml`

12. **订阅更新全部错误提示改进**
    - 文件: `frontend/src/stores/subscribes.ts` (返回所有结果含失败信息)
    - 文件: `frontend/src/views/SubscribesView/index.vue` (显示失败的订阅错误)

13. **其他自定义**
    - 关于页面版本号修改: `frontend/src/views/AboutView.vue`
    - Go 后端修改: `bridge/bridge.go`, `bridge/io.go`
    - Windows 管理员权限: `build/windows/wails.exe.manifest`

## 合并步骤

// turbo
1. 获取上游最新代码
```bash
git fetch upstream
```

// turbo
2. 查看上游有哪些新提交（与当前分支的共同祖先比较）
```bash
git log $(git merge-base main upstream/main)..upstream/main --oneline
```

// turbo
3. 查看可能有冲突的文件（两边都修改过的）
```bash
# 获取上游修改的文件列表
git diff --name-only $(git merge-base main upstream/main)..upstream/main > %TEMP%\upstream.txt
# 获取本地修改的文件列表  
git diff --name-only $(git merge-base main upstream/main)..HEAD > %TEMP%\local.txt
# 对比找出两边都修改的文件
```

4. 创建临时分支进行合并测试
```bash
git checkout -b temp-merge-test
git merge upstream/main --no-commit --no-ff
```

5. 如果有冲突，需要手动解决：
   - 查看冲突文件: `git diff --name-only --diff-filter=U`
   - 对于每个冲突文件，需要保留本项目的自定义修改，同时接受上游的改进
   - 特别注意上面"自定义修改清单"中的文件

6. 解决冲突后，标记为已解决并提交
```bash
git add <conflicted-files>
git commit -m "Merge upstream/main: <描述上游更新内容>"
```

7. 验证自定义功能是否保留（搜索关键代码）
```bash
# 验证 GitHub 代理功能
grep -r "githubProxy" frontend/src/
# 验证 SUB-RULE 支持
grep -r "SUB-RULE" frontend/src/
# 验证 Gist 插件
ls frontend/public/plugins/
# 验证休眠唤醒功能
grep -r "onSystemResume" frontend/src/ bridge/
# 验证性能优化（虚拟滚动）
grep -r "virtualScroll\|shallowRef" frontend/src/components/Table/ frontend/src/views/HomeView/
```

8. 如果验证通过，合并到 main 分支
```bash
git checkout main
git merge temp-merge-test
git branch -d temp-merge-test
```

9. 推送到 GitHub
```bash
git push origin main
```

## 回滚方法

如果合并后发现问题，可以回滚：
```bash
git reset --hard HEAD~1
git push origin main --force
```

## 注意事项

- 合并前确保本地没有未提交的修改
- 如果上游有大规模重构（如组件拆分），需要将自定义代码迁移到新的文件结构
- 合并后建议在本地测试构建是否正常
