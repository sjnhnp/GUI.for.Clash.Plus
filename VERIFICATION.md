# 规则解析逻辑验证

## 修复后的规则处理逻辑

### 测试用例

#### 1. Sub-Rule 规则
**输入**: `AND,((DST-PORT,443/udp)),Sub-Rule,(QUIC_CHECK)`

**处理流程**:
- ✅ `isSubRule = true` (检测到 "Sub-Rule")
- ✅ `payloadAndType = "AND,((DST-PORT,443/udp)),Sub-Rule,(QUIC_CHECK)"` (整个规则)
- ✅ `proxy = ""` (不需要)
- ✅ `_proxy = ""` (Sub-Rule 不使用 proxy)
- ✅ 不会被跳过
- ✅ `type = RuleType.Logic`
- ✅ `payload = "AND,((DST-PORT,443/udp)),Sub-Rule,(QUIC_CHECK)"`

**结果**: ✅ 成功解析

---

#### 2. MATCH 规则
**输入**: `MATCH,PROXY`

**处理流程**:
- ✅ `isSubRule = false` (没有 "Sub-Rule")
- ✅ `lastComma = 5` (逗号位置)
- ✅ `payloadAndType = "MATCH"`
- ✅ `proxy = "PROXY"`
- ✅ `type = "MATCH"`
- ✅ `payload = ""`
- ✅ `_proxy = getRuleProxy("PROXY")` = "PROXY" 或代理组ID
- ✅ 不会被跳过

**结果**: ✅ 成功解析

**对比原始错误代码**:
- ❌ 原始: `_proxy = getRuleProxy("MATCH")` = undefined → 规则被跳过
- ✅ 修复后: `_proxy = getRuleProxy("PROXY")` = "PROXY" → 正常解析

---

#### 3. 普通域名规则
**输入**: `DOMAIN-SUFFIX,google.com,PROXY`

**处理流程**:
- ✅ `isSubRule = false`
- ✅ `payloadAndType = "DOMAIN-SUFFIX,google.com"`
- ✅ `proxy = "PROXY"`
- ✅ `type = "DOMAIN-SUFFIX"`
- ✅ `payload = "google.com"`
- ✅ `_proxy = getRuleProxy("PROXY")`
- ✅ 不会被跳过

**结果**: ✅ 成功解析

---

#### 4. 规则集规则
**输入**: `RULE-SET,cn,DIRECT`

**处理流程**:
- ✅ `isSubRule = false`
- ✅ `payloadAndType = "RULE-SET,cn"`
- ✅ `proxy = "DIRECT"`
- ✅ `type = "RULE-SET"`
- ✅ `payload = "cn"`
- ✅ `_proxy = getRuleProxy("DIRECT")` = "DIRECT"
- ✅ 不会被跳过

**结果**: ✅ 成功解析

---

#### 5. 进程名规则
**输入**: `PROCESS-NAME,ChatGPT.exe,ai`

**处理流程**:
- ✅ `isSubRule = false`
- ✅ `payloadAndType = "PROCESS-NAME,ChatGPT.exe"`
- ✅ `proxy = "ai"`
- ✅ `type = "PROCESS-NAME"`
- ✅ `payload = "ChatGPT.exe"`
- ✅ `_proxy = getRuleProxy("ai")` = ai 代理组的 ID
- ✅ 不会被跳过

**结果**: ✅ 成功解析

---

#### 6. 复杂逻辑规则（不含 Sub-Rule）
**输入**: `AND,((NETWORK,UDP),(DST-PORT,443),(NOT,((OR,((RULE-SET,cnlite),(RULE-SET,cnip)))))),REJECT`

**处理流程**:
- ✅ `isSubRule = false` (只检测 "Sub-Rule" 字面量)
- ✅ `lastComma` 找到最后的逗号
- ✅ `payloadAndType = "AND,((NETWORK,UDP),(DST-PORT,443),(NOT,((OR,((RULE-SET,cnlite),(RULE-SET,cnip))))))"`
- ✅ `proxy = "REJECT"`
- ✅ `type = "AND"` → 被识别为 Logic 类型
- ✅ `payload = "AND,((NETWORK,UDP),(DST-PORT,443),...))"`
- ✅ `_proxy = getRuleProxy("REJECT")` = "REJECT"
- ✅ 不会被跳过

**结果**: ✅ 成功解析

---

## 修复前后对比

### 修复前（存在的问题）

| 规则类型 | 示例 | 状态 |
|---------|------|------|
| Sub-Rule | `AND,((DST-PORT,443/udp)),Sub-Rule,(QUIC_CHECK)` | ❌ 被错误跳过 |
| MATCH | `MATCH,PROXY` | ❌ 被错误跳过 |
| 其他规则 | `DOMAIN-SUFFIX,google.com,PROXY` | ✅ 正常 |

### 修复后

| 规则类型 | 示例 | 状态 |
|---------|------|------|
| Sub-Rule | `AND,((DST-PORT,443/udp)),Sub-Rule,(QUIC_CHECK)` | ✅ 正常解析 |
| MATCH | `MATCH,PROXY` | ✅ 正常解析 |
| 其他规则 | `DOMAIN-SUFFIX,google.com,PROXY` | ✅ 正常 |

---

## 核心修复

### 原始错误代码
```typescript
const _proxy = type === RuleType.Match ? getRuleProxy(payloadAndType) : getRuleProxy(proxy)
```

**问题**: 对于 MATCH 规则，尝试从 `payloadAndType`（即 "MATCH"）获取代理，但代理实际在 `proxy` 变量中。

### 修复后代码
```typescript
if (!isSubRule) {
  // For all non-SubRule rules, the proxy/policy is in the 'proxy' variable
  _proxy = getRuleProxy(proxy)
}
```

**改进**:
1. ✅ 统一处理：所有非 Sub-Rule 规则的代理都在 `proxy` 变量中
2. ✅ 修复 MATCH 规则的错误处理
3. ✅ 代码更简洁、逻辑更清晰

---

## sub-rules 配置块处理

**输入配置**:
```yaml
sub-rules:
  QUIC_CHECK:
    - RULE-SET,cn,DIRECT
    - RULE-SET,cnip,DIRECT
    - MATCH,REJECT
```

**处理流程**:
- ✅ 在 `restorer.ts` 中检测到 `sub-rules` 字段
- ✅ 直接赋值给 `profile.subRulesConfig`
- ✅ 在生成配置时，从 `profile.subRulesConfig` 输出到 `config['sub-rules']`

**结果**: ✅ sub-rules 配置完整保留

---

## 总结

该修复解决了**三个关键问题**：

1. ✅ **Sub-Rule 规则支持**: 正确识别和解析包含 `Sub-Rule` 的逻辑规则
2. ✅ **MATCH 规则修复**: 修正了原始代码中对 MATCH 规则的错误处理逻辑
3. ✅ **sub-rules 配置块**: 添加了对 sub-rules 配置块的完整支持

所有规则类型现在都能正确解析和保存。
