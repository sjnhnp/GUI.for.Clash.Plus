# GUI for Clash - 修复完成报告

## 修复内容总结

已完成两个关键修复：

### 1. ✅ 正确支持 Clash Mihomo SUB-RULE 语法

#### 问题
之前误解了 Sub-Rule 的语法，实际上正确的 Clash Mihomo 语法是：

```yaml
# ✅ 正确语法
- SUB-RULE,(AND,((DST-PORT,443/udp))),QUIC_CHECK

# ❌ 错误语法（不被内核支持）
- AND,((DST-PORT,443/udp)),Sub-Rule,(QUIC_CHECK)
```

#### 语法格式
```
SUB-RULE,(逻辑条件),sub规则名称
```

其中：
- `SUB-RULE` 是规则类型
- `(逻辑条件)` 是匹配条件，如 `(AND,((DST-PORT,443/udp)))`
- `sub规则名称` 是引用的 sub-rules 块名称，如 `QUIC_CHECK`

#### 修复详情

**修改文件 1: `frontend/src/utils/restorer.ts`**

在解析 YAML 配置时：
```typescript
// 检测 SUB-RULE 类型（基于规则类型而非文本搜索）
const upperType = type.toUpperCase()
const isSubRule = upperType === 'SUB-RULE'

// SUB-RULE 不使用 proxy 参数（最后部分是 sub-rule 名称）
if (!isSubRule) {
  _proxy = getRuleProxy(proxy)
} else {
  _proxy = '' // 标记为有效但不需要 proxy
}
```

**修改文件 2: `frontend/src/utils/generator.ts`**

在生成规则时：
```typescript
// 检测 SUB-RULE 类型（payload 以 SUB-RULE, 开头）
const isLogicSubRule = type === RuleType.Logic && /^SUB-RULE,/i.test(payload)
if (!isLogicSubRule) {
  ruleStr += ',' + proxyStr
}
```

**修改文件 3: `frontend/src/utils/restorer.ts`**

添加 sub-rules 配置块支持：
```typescript
// 在 profile 初始化时
subRulesConfig: {},

// 在配置恢复时
} else if (field === 'sub-rules') {
  profile.subRulesConfig = value
}
```

#### 测试配置

```yaml
rules:
  - RULE-SET,privateip,DIRECT,no-resolve
  - PROCESS-NAME,ChatGPT.exe,ai
  
  # ✅ 正确的 SUB-RULE 语法
  - SUB-RULE,(AND,((DST-PORT,443/udp))),QUIC_CHECK
  - SUB-RULE,(AND,((NETWORK,UDP),(DST-PORT,443))),QUIC_CHECK
  
  - DOMAIN-SUFFIX,google.com,PROXY
  - MATCH,PROXY

sub-rules:
  QUIC_CHECK:
    - RULE-SET,cn,DIRECT
    - RULE-SET,cnip,DIRECT
    - RULE-SET,ai,ai
    - DOMAIN-SUFFIX,cloudflare.com,ai
    - MATCH,REJECT
```

---

### 2. ✅ 动态版本号注入

#### 问题
GUI 标题始终显示 `v1.16.0`，即使通过 GitHub Actions 构建不同版本也不会改变。

原因：版本号硬编码在 `bridge/bridge.go` 文件中。

#### 修复方案

**修改文件: `bridge/bridge.go`**

将硬编码的版本号改为可通过 ldflags 注入的变量：

```go
// Version can be set at build time via -ldflags
var Version = "v1.16.0"  // 默认值

var Env = &EnvResult{
    // ...
    AppVersion:  Version,  // 使用变量
    // ...
}
```

**修改文件: `.github/workflows/release.yml`**

在 Windows 和 macOS 构建步骤中添加版本号获取和注入：

**Windows 构建：**
```powershell
# 获取版本号
- name: Get Version
  shell: pwsh
  run: |
    if ("${{ github.event_name }}" -eq "push") {
      "VERSION=${{ github.ref_name }}" | Out-File -FilePath $env:GITHUB_ENV -Append
    } else {
      # 从输入或自动递增获取版本号
      $inputVer = "${{ github.event.inputs.version }}"
      if ($inputVer) {
        "VERSION=$inputVer" | Out-File -FilePath $env:GITHUB_ENV -Append
      } else {
        # 自动递增 patch 版本
        $latestTag = git describe --tags --match "v[0-9]*" --abbrev=0 2>$null
        # ... (版本递增逻辑)
      }
    }

# 构建时注入版本号
$ldflags = "-X 'github.com/GUI-for-Cores/GUI.for.Clash/bridge.Version=$env:VERSION'"
~/go/bin/wails build -ldflags $ldflags ...
```

**macOS 构建：**
```bash
# 获取版本号
- name: Get Version
  run: |
    if [ "${{ github.event_name }}" == "push" ]; then
      echo "VERSION=${{ github.ref_name }}" >> $GITHUB_ENV
    else
      # ... (类似逻辑)
    fi

# 构建时注入版本号
LDFLAGS="-X 'github.com/GUI-for-Cores/GUI.for.Clash/bridge.Version=$VERSION'"
~/go/bin/wails build -ldflags "$LDFLAGS" ...
```

#### 版本号逻辑

1. **推送 tag 时**：使用 tag 作为版本号（如 `v1.17.0`）
2. **手动触发并指定版本**：使用指定的版本号
3. **手动触发未指定版本**：自动递增 patch 版本（如 `v1.16.0` → `v1.16.1`）

#### 验证

构建完成后，打开应用，窗口标题应显示正确的版本号，例如：
```
GUI.for.Clash v1.17.0
```

而不是固定的 `v1.16.0`。

---

## 使用说明

### 1. 本地开发
修改后的代码仍然可以正常本地开发：
```bash
cd frontend
npm run build
cd ..
wails dev  # 或 wails build
```

本地构建将使用默认版本 `v1.16.0`。

### 2. GitHub Actions 构建

#### 方法 1：推送 tag
```bash
git tag v1.17.0
git push origin v1.17.0
```

GitHub Actions 会自动构建，版本号为 `v1.17.0`。

#### 方法 2：手动触发
1. 进入 GitHub Actions 页面
2. 选择 "Build GUI.for.Clash" workflow
3. 点击 "Run workflow"
4. 可选：输入版本号（如 `v1.17.1`），或留空自动递增

#### 方法 3：修改代码并提交
如果不创建 tag，也可以直接在 Actions 页面手动触发构建。

### 3. 验证构建
下载生成的 zip 文件，解压并运行，检查：
1. ✅ 窗口标题显示正确版本号
2. ✅ SUB-RULE 规则正确解析
3. ✅ sub-rules 配置块正常工作

---

## 文件清单

### 修改的文件
1. `frontend/src/utils/restorer.ts` - 修复 SUB-RULE 解析和 sub-rules 恢复
2. `frontend/src/utils/generator.ts` - 修复 SUB-RULE 生成
3. `bridge/bridge.go` - 版本号变量化
4. `.github/workflows/release.yml` - 添加版本号注入逻辑

### TypeScript Lint 错误说明
以下 lint 错误是项目原有的，不是本次修改引入：
- `Cannot find module 'yaml'` - 项目已有的类型定义问题
- `Type 'Set<string>' can only be iterated...` - TypeScript 编译配置问题

这些不影响实际运行。

---

## 测试建议

### SUB-RULE 测试
使用以下配置测试：

```yaml
rules:
  - SUB-RULE,(AND,((DST-PORT,443/udp))),QUIC_CHECK
  - SUB-RULE,(OR,((DST-PORT,80),(DST-PORT,443))),HTTP_CHECK
  - MATCH,PROXY

sub-rules:
  QUIC_CHECK:
    - RULE-SET,cn,DIRECT
    - RULE-SET,cnip,DIRECT
    - MATCH,REJECT
  HTTP_CHECK:
    - RULE-SET,cn,DIRECT
    - MATCH,PROXY
```

验证点：
1. ✅ 规则显示为 LOGIC 类型
2. ✅ 完整规则文本正确显示
3. ✅ sub-rules 块正确保存和恢复
4. ✅ 生成的 YAML 配置正确

### 版本号测试
1. 本地构建：版本应为 `v1.16.0`
2. GitHub Actions 构建：版本应为指定或自动生成的版本
3. 窗口标题应显示正确版本号

---

## 总结

本次修复解决了两个关键问题：

1. **SUB-RULE 语法支持** - 现在正确支持 Clash Mihomo 的 `SUB-RULE,(条件),名称` 语法
2. **动态版本号** - GitHub Actions 构建的版本会在应用标题中正确显示

这些修复不会影响现有功能，向后兼容所有其他规则类型。

如有任何问题，请查看相关文件的注释或提issue。
