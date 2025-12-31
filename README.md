<div align="center">
  <img src="build/appicon.png" alt="GFC Plus" width="200">
  <h1>GFC Plus</h1>
  <p>基于 <a href="https://github.com/GUI-for-Cores/GUI.for.Clash">GUI-for-Cores/GUI.for.Clash</a> 的增强版 Fork</p>
  <p>A GUI program for mihomo (Clash.Meta) kernel, developed with Vue3 + Wails.</p>
</div>

## ✨ Fork 增强功能

### 🔧 Bug 修复（mihomo 支持但原版 GUI 不支持的配置）

| 修复项 | 问题描述 | 修复说明 |
|--------|----------|----------|
| **SUB-RULE 嵌套规则** | 原 GUI 不支持 SUB-RULE 语法，显示"策略组不存在"警告 | 完整支持 mihomo `SUB-RULE` 嵌套规则语法，包括 `AND`, `OR`, `NOT` 等复杂条件 |
| **自定义 GeoIP 配置** | `geodata-mode: false` 时使用 `mmdb` 格式，GUI 不识别 | 修复 GeoIP 配置读取逻辑，支持自定义 `geox-url` 下载 mmdb 文件 |
| **FakeIP Filter 规则集** | `fake-ip-filter` 中引用 `rule-set:xxx` 导致内核报错 | 自动将 DNS 配置中引用的规则集添加到 `rule-providers` |
| **Nameserver-Policy 数组格式** | `nameserver-policy` 的值原 GUI 只支持字符串 `"ip1,ip2"`，不支持数组 `[ip1, ip2]` | 支持 YAML 数组格式，如 `- system://` 和 `- 223.5.5.5` |
| **Mixin 规则集引用** | Mixin 中定义的规则集在 `fake-ip-filter` / `nameserver-policy` 中引用时未被包含 | 自动复制 mixin 中的规则集定义到生成的配置 |
| **DNS 规则集显示** | 仅用于 DNS 的规则集错误显示在 GUI 规则列表中 | 区分 DNS 规则集和路由规则集，仅显示路由规则 |
| **本地订阅恢复** | 本地订阅导入后配置无法正确恢复 | 修复本地订阅文件的备份和恢复逻辑 |
| **更新全部订阅错误提示** | "更新全部"时部分订阅失败仍显示成功，不显示错误详情 | 正确显示失败的订阅及错误原因，部分成功时显示警告 |
| **插件删除时组件残留** | 删除/卸载插件后，插件创建的概览页按钮仍然存在，需重启程序才消失 | 删除插件时自动调用 `onUninstall` 清理 UI 组件 |

### 🔌 预装增强版 Gists 同步插件

- **一键备份/恢复**：支持 GitHub Gists 备份所有配置
- **本地文件支持**：
  - 备份本地订阅源文件（`data/local/*.txt`）
  - 备份本地规则集源文件
  - 备份插件第三方依赖（`data/third/`）
- **开箱即用**：插件和 `crypto-js.js` 依赖已预打包，无需手动安装

### 📦 自定义插件仓库

- **独立插件仓库**：除官方 Plugin-Hub 外，还加载本项目自定义插件
- **修复版插件**：包含 `Clash API 仪表板 (修复版)`，配置更改后立即生效，无需重启内核
- **方便更新**：自定义插件可通过插件中心直接更新

### 🛡️ Windows 优化

- **默认管理员权限**：Windows 版本默认以管理员身份运行
- **TUN 模式开箱即用**：无需手动设置权限

### ⚙️ 配置优化

- **系统代理默认关闭**：避免首次启动自动设置系统代理
- **增加自定义GitHub加速地址**：解决第一次运行无法下载内核

### � 构建优化

- **GitHub Actions 自动构建**：支持 Windows 和 macOS 自动构建发布
- **版本号自动递增**：每次发布自动递增 patch 版本号
- **启动时间优化**：插件预打包，减少首次启动的网络请求


## 📖 文档

- [使用指南](https://gui-for-cores.github.io/guide/gfc/how-to-use)


## 🙏 致谢

- [GUI-for-Cores/GUI.for.Clash](https://github.com/GUI-for-Cores/GUI.for.Clash) - 原项目
- [MetaCubeX/mihomo](https://github.com/MetaCubeX/mihomo) - Clash.Meta 内核

## 📄 License

MIT License - 详见 [LICENSE](LICENSE)
