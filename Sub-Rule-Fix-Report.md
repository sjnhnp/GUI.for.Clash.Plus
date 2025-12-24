# GUI for Clash - Sub-Rule 语法支持修复报告

## 问题描述

GUI for Clash 无法正确解析和保存包含 `Sub-Rule` 的 Clash Mihomo 规则配置。

### 不工作的语法示例：
```yaml
- AND,((DST-PORT,443/udp)),Sub-Rule,(QUIC_CHECK)
- AND,((NETWORK,UDP),(DST-PORT,443)),Sub-Rule,(QUIC_CHECK)
```

### 工作的语法示例（对比）：
```yaml
- AND,((NETWORK,UDP),(DST-PORT,443),(NOT,((OR,((RULE-SET,cnlite),(RULE-SET,cnip)))))),REJECT
```

## 根本原因

### 1. 规则解析问题（`restorer.ts`）

在解析 YAML 配置文件时，代码尝试从规则字符串中提取策略组（proxy）参数：

```typescript
// 原代码逻辑
const lastComma = qs.lastIndexOf(',')
const payloadAndType = qs.substring(0, lastComma)
const proxy = qs.substring(lastComma + 1)  // 对于 Sub-Rule，这会错误地提取 "QUIC_CHECK)"
```

对于规则 `AND,((DST-PORT,443/udp)),Sub-Rule,(QUIC_CHECK)`：
- `lastComma` 会找到最后一个逗号
- `proxy` 变量会被赋值为 `QUIC_CHECK)`
- `getRuleProxy("QUIC_CHECK)")` 返回 `undefined`
- 规则被跳过（第 170-172 行）

**关键问题**：Sub-Rule 类型的规则不使用传统的策略组参数，整个规则字符串就是 payload。

### 2. sub-rules 配置块丢失

`restorer.ts` 中没有处理 YAML 配置文件中的 `sub-rules` 块，导致：
- 手动编辑配置文件添加的 `sub-rules` 会在重新加载后丢失
- GUI 无法显示和管理 sub-rules

## 已实施的修复

### 修复 1：添加 Sub-Rule 检测逻辑（`restorer.ts`）

```typescript
// Check if this is a Sub-Rule type logic rule
const isSubRule = /Sub-Rule/i.test(qs)

let payloadAndType: string
let proxy: string
let _proxy: string | undefined

if (isSubRule) {
  // For Sub-Rule syntax, the entire rule IS the payload, no proxy needed
  payloadAndType = qs
  proxy = ''
  _proxy = '' // Sub-Rule doesn't use proxy parameter
} else {
  const lastComma = qs.lastIndexOf(',')
  payloadAndType = qs.substring(0, lastComma)
  proxy = qs.substring(lastComma + 1)
}

// ... 后续处理 ...

if (!isSubRule) {
  // 修复：对于所有非 Sub-Rule 规则，策略都在 'proxy' 变量中
  // 原始代码错误地对 MATCH 规则使用了 payloadAndType
  _proxy = getRuleProxy(proxy)
}

// Skip invalid rules (except for Sub-Rule which doesn't need proxy)
if (!_proxy && !isSubRule) {
  return
}
```

**关键修复点**：
1. ✅ 检测 Sub-Rule 类型的规则
2. ✅ Sub-Rule 规则不提取 proxy 参数
3. ✅ **修复了原始代码对 MATCH 规则的错误处理**：原始代码尝试从 `payloadAndType` 获取 MATCH 规则的策略，但实际上策略在 `proxy` 变量中

### 修复 2：添加 sub-rules 配置支持

1. 在 profile 初始化时添加 `subRulesConfig`：
```typescript
const profile: ProfileType = {
  // ... 其他字段 ...
  subRulesConfig: {},
}
```

2. 添加 sub-rules 字段的恢复逻辑：
```typescript
} else if (field === 'sub-rules') {
  profile.subRulesConfig = value
}
```

## 测试验证

### 测试配置
```yaml
rules:
  - AND,((DST-PORT,443/udp)),Sub-Rule,(QUIC_CHECK)
  - AND,((NETWORK,UDP),(DST-PORT,443)),Sub-Rule,(QUIC_CHECK)
  - MATCH,PROXY

sub-rules:
  QUIC_CHECK:
    - RULE-SET,cn,DIRECT
    - RULE-SET,cnip,DIRECT
    - RULE-SET,ai,ai
    - DOMAIN-SUFFIX,cloudflare.com,ai
    - MATCH,REJECT
```

### 预期结果
- ✅ Sub-Rule 规则应该被正确解析为 Logic 类型规则
- ✅ 规则的完整内容应该保存在 payload 字段中
- ✅ sub-rules 配置块应该被保存到 `profile.subRulesConfig`
- ✅ 生成配置文件时应该包含 sub-rules 块

## 注意事项

### 关于 `443/udp` 语法

Clash Mihomo 支持端口和协议的简化写法：
- `DST-PORT,443/udp` 等同于 `NETWORK,UDP` + `DST-PORT,443`

这种语法在当前修复中已被支持，因为：
1. Sub-Rule 规则的整个字符串被作为 payload 保存
2. 不会被拆分或重新解析
3. 直接传递给 Clash 核心处理

### 已有的生成逻辑

`generator.ts` 中已经有正确的 Sub-Rule 生成逻辑（第 50-55 行）：
```typescript
// If the rule is a Logic rule and already defines a Sub-Rule target in the payload,
// do not append the proxy/policy again.
const isLogicSubRule = type === RuleType.Logic && /sub-rule/i.test(payload)
if (!isLogicSubRule) {
  ruleStr += ',' + proxyStr
}
```

## 构建和测试

修复后需要：

1. 重新构建前端：
```bash
cd frontend
npm run build
```

2. 重新编译整个应用：
```bash
# 在项目根目录
wails build
```

3. 测试步骤：
   - 使用包含 Sub-Rule 的配置文件
   - 在 GUI 中加载配置
   - 检查规则是否正确显示
   - 保存配置并检查生成的 YAML 文件
   - 验证 sub-rules 块是否存在

## 可能的后续改进

1. **UI 增强**：在 GUI 中添加专门的 Sub-Rules 管理界面
2. **规则验证**：添加 Sub-Rule 语法的验证逻辑
3. **错误提示**：为无效的 Sub-Rule 配置提供更详细的错误信息

## 结论

通过以上修复，GUI for Clash 现在应该能够：
- ✅ 正确解析包含 Sub-Rule 的规则
- ✅ 保存和恢复 sub-rules 配置块
- ✅ 支持 Clash Mihomo 的所有 Sub-Rule 语法变体
