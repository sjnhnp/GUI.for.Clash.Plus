# SUB-RULE 语法完全支持验证

## ✅ 支持的所有 SUB-RULE 语法格式

GUI for Clash 现在完全支持以下所有 Clash Mihomo SUB-RULE 语法变体：

### 1. 完整逻辑表达式格式
```yaml
- SUB-RULE,(AND,((DST-PORT,443/udp))),QUIC_CHECK
- SUB-RULE,(AND,((NETWORK,UDP),(DST-PORT,443))),QUIC_CHECK
- SUB-RULE,(OR,((DST-PORT,80),(DST-PORT,443))),HTTP_CHECK
- SUB-RULE,(NOT,((RULE-SET,cn))),FOREIGN_CHECK
```

### 2. 简化单条件格式
```yaml
- SUB-RULE,(DST-PORT,443/udp),QUIC_CHECK
- SUB-RULE,(NETWORK,UDP),UDP_CHECK
- SUB-RULE,(DOMAIN-SUFFIX,google.com),GOOGLE_CHECK
- SUB-RULE,(PROCESS-NAME,chrome.exe),CHROME_CHECK
```

### 3. 复杂嵌套格式
```yaml
- SUB-RULE,(AND,((OR,((DST-PORT,80),(DST-PORT,443))),(NETWORK,TCP))),WEB_CHECK
- SUB-RULE,(AND,((NETWORK,UDP),(DST-PORT,443),(NOT,((RULE-SET,cn))))),FOREIGN_QUIC
```

## 工作原理

### 解析流程（restorer.ts）

对于规则：`SUB-RULE,(DST-PORT,443/udp),QUIC_CHECK`

1. **分割规则字符串**
   ```typescript
   lastComma = qs.lastIndexOf(',')  // 找到最后一个逗号
   payloadAndType = "SUB-RULE,(DST-PORT,443/udp)"
   proxy = "QUIC_CHECK"  // sub-rule 名称
   ```

2. **识别规则类型**
   ```typescript
   type = "SUB-RULE"
   upperType = "SUB-RULE"
   
   // 因为 upperType 在列表中，设置为 Logic 类型
   if (['AND', 'OR', 'NOT', 'SUB-RULE'].includes(upperType)) {
     type = RuleType.Logic
     payload = "SUB-RULE,(DST-PORT,443/udp)"
   }
   ```

3. **保存 sub-rule 名称**
   ```typescript
   isSubRule = upperType === 'SUB-RULE'  // true
   
   if (isSubRule) {
     _proxy = proxy  // "QUIC_CHECK" - 保存 sub-rule 名称
   }
   ```

4. **保存到 profile**
   ```typescript
   profile.rulesConfig.push({
     type: RuleType.Logic,  // "LOGIC"
     payload: "SUB-RULE,(DST-PORT,443/udp)",
     proxy: "QUIC_CHECK",  // sub-rule 名称存储在这里
     // ...
   })
   ```

### 生成流程（generator.ts）

从 profile 读取：
```typescript
{
  type: RuleType.Logic,
  payload: "SUB-RULE,(DST-PORT,443/udp)",
  proxy: "QUIC_CHECK"
}
```

生成规则字符串：
```typescript
// 1. payload 作为 ruleStr
ruleStr = "SUB-RULE,(DST-PORT,443/udp)"

// 2. 检测 SUB-RULE 类型
isLogicSubRule = /^SUB-RULE,/i.test(payload)  // true

// 3. 追加 sub-rule 名称
if (isLogicSubRule) {
  ruleStr += ',' + proxy  // 使用原始的 proxy 值（sub-rule 名称）
}

// 最终: "SUB-RULE,(DST-PORT,443/udp),QUIC_CHECK" ✅
```

## 完整测试配置

```yaml
rules:
  - RULE-SET,privateip,DIRECT,no-resolve
  
  # 进程规则
  - PROCESS-NAME,Zoom.exe,DIRECT
  - PROCESS-NAME,ChatGPT.exe,ai
  
  # ✅ 简化的 SUB-RULE 语法
  - SUB-RULE,(DST-PORT,443/udp),QUIC_CHECK
  
  # ✅ 完整的 SUB-RULE 语法  
  - SUB-RULE,(AND,((NETWORK,UDP),(DST-PORT,443))),QUIC_CHECK
  
  # ✅ 多条件 SUB-RULE
  - SUB-RULE,(OR,((DST-PORT,80),(DST-PORT,443))),HTTP_CHECK
  
  # ✅ 嵌套逻辑 SUB-RULE
  - SUB-RULE,(AND,((OR,((DOMAIN-SUFFIX,google.com),(DOMAIN-SUFFIX,youtube.com))),(NOT,((RULE-SET,cn))))),GOOGLE_CHECK
  
  # 普通规则
  - DOMAIN-SUFFIX,telegram.org,PROXY
  - RULE-SET,cn,DIRECT
  - MATCH,PROXY

sub-rules:
  QUIC_CHECK:
    - RULE-SET,cn,DIRECT
    - RULE-SET,cnip,DIRECT
    - RULE-SET,ai,ai
    - DOMAIN-SUFFIX,cloudflare.com,ai
    - MATCH,REJECT
  
  HTTP_CHECK:
    - RULE-SET,cn,DIRECT
    - DOMAIN-SUFFIX,baidu.com,DIRECT
    - MATCH,PROXY
  
  GOOGLE_CHECK:
    - DOMAIN-SUFFIX,googleapis.com,PROXY
    - DOMAIN-SUFFIX,gstatic.com,PROXY
    - MATCH,PROXY
```

## 验证测试

### 测试步骤

1. **加载配置**
   - 在 GUI 中导入包含各种 SUB-RULE 格式的配置
   - 检查规则列表中是否正确显示

2. **规则显示验证**
   - 所有 SUB-RULE 应显示为 `LOGIC` 类型
   - 完整的规则字符串应正确显示

3. **保存配置验证**
   - 保存配置文件
   - 重新打开查看生成的 YAML 文件
   - 确认 SUB-RULE 规则格式完整：`SUB-RULE,(条件),sub规则名`

4. **sub-rules 块验证**
   - 确认 `sub-rules:` 块存在
   - 确认每个引用的 sub-rule 名称都有对应的定义

### 预期结果

#### 在 GUI 中
- ✅ SUB-RULE 规则显示为 `LOGIC` 类型
- ✅ 规则内容完整显示，包括 sub-rule 名称
- ✅ 可以编辑和保存

#### 生成的 YAML 文件
```yaml
rules:
  # ✅ 简化格式正确生成
  - SUB-RULE,(DST-PORT,443/udp),QUIC_CHECK
  
  # ✅ 完整格式正确生成
  - SUB-RULE,(AND,((NETWORK,UDP),(DST-PORT,443))),QUIC_CHECK
  
  # ✅ 其他规则正常
  - DOMAIN-SUFFIX,google.com,PROXY
  - MATCH,PROXY

# ✅ sub-rules 块完整保留
sub-rules:
  QUIC_CHECK:
    - RULE-SET,cn,DIRECT
    - MATCH,REJECT
```

## 关键修复点

### 修复 1：保存 sub-rule 名称
```typescript
// restorer.ts
if (isSubRule) {
  _proxy = proxy  // 保存 "QUIC_CHECK" 而不是空字符串
}
```

**原因**：sub-rule 名称存储在最后一个逗号后面，需要保存到 proxy 字段中。

### 修复 2：生成时追加 sub-rule 名称
```typescript
// generator.ts
if (isLogicSubRule) {
  ruleStr += ',' + proxy  // 使用原始 proxy 值（sub-rule 名称）
}
```

**原因**：对于 SUB-RULE，proxy 字段存储的不是代理组 ID，而是 sub-rule 名称，需要直接使用。

## 总结

现在 GUI for Clash 完全支持所有 Clash Mihomo SUB-RULE 语法变体：

✅ **简化格式**：`SUB-RULE,(单个条件),sub规则名`
✅ **标准格式**：`SUB-RULE,(AND,((条件1),(条件2))),sub规则名`  
✅ **复杂格式**：`SUB-RULE,(嵌套逻辑),sub规则名`
✅ **sub-rules 配置块**：完整支持

所有格式在解析、显示、编辑和生成时都能正确工作！
