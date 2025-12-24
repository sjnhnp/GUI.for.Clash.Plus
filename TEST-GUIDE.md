# 测试您的 Sub-Rule 配置

## 修复内容总结

已经修复了 GUI for Clash 中对 Clash Mihomo `Sub-Rule` 语法的支持。现在您的配置应该可以正常工作了。

## 需要做什么

### 1. 重新构建应用

打开终端并执行：

```powershell
# 进入前端目录
cd frontend

# 安装依赖（如果还没安装）
npm install

# 构建前端
npm run build

# 返回项目根目录
cd ..

# 构建整个应用
wails build
```

### 2. 测试您的配置

使用以下配置进行测试（这是您提供的配置）：

```yaml
rules:
  - RULE-SET,privateip,DIRECT,no-resolve
  
  - PROCESS-NAME,Zoom.exe,DIRECT
  - PROCESS-NAME,aomhost64.exe,DIRECT
  - PROCESS-NAME,CptHost.exe,DIRECT
  - PROCESS-NAME,zWebview2Agent.exe,DIRECT
  
  - PROCESS-NAME,ChatGPT.exe,ai
  - PROCESS-NAME,ChatGPT,ai
  - RULE-SET,ai,ai
  - DOMAIN-SUFFIX,gravatar.com,ai
  - DOMAIN-SUFFIX,wp.com,ai
  - DOMAIN-SUFFIX,oaistatic.com,ai
  - DOMAIN-SUFFIX,oaiusercontent.com,ai
  
  # 这些规则现在应该可以正常工作了 ✅
  - AND,((DST-PORT,443/udp)),Sub-Rule,(QUIC_CHECK)
  
  - DOMAIN-SUFFIX,telegram.org,PROXY
  - RULE-SET,telegramip,PROXY,no-resolve
  - DOMAIN-SUFFIX,github.com,PROXY
  
  - DOMAIN,board.zash.run.place,DIRECT
  - DOMAIN,clash.razord.top,DIRECT
  - DOMAIN,yacd.haishan.me,DIRECT
  
  - RULE-SET,fakeip-filter,DIRECT
  - RULE-SET,adsqf,REJECT
  - RULE-SET,microsoft-cn,DIRECT
  - DOMAIN-SUFFIX,dl.google.com,PROXY
  - RULE-SET,google-cn,DIRECT
  
  - RULE-SET,youtube,media
  - DOMAIN-KEYWORD,www.google,PROXY
  
  - RULE-SET,proxy,PROXY
  - RULE-SET,cn,DIRECT
  - RULE-SET,cnip,DIRECT
  
  - MATCH,PROXY

sub-rules:
  QUIC_CHECK:
    - RULE-SET,cn,DIRECT
    - RULE-SET,cnip,DIRECT
    - RULE-SET,ai,ai
    - DOMAIN-SUFFIX,cloudflare.com,ai
    - DOMAIN-SUFFIX,wp.com,ai
    - DOMAIN-SUFFIX,gravatar.com,ai
    - DOMAIN-SUFFIX,sentry.io,ai
    - MATCH,REJECT
```

### 3. 验证步骤

1. **启动修复后的 GUI for Clash**
2. **加载您的配置文件**  
   - 配置应该正常加载，不会报错
   - Sub-Rule 规则应该显示为 `LOGIC` 类型
   
3. **检查规则显示**
   - 在规则列表中，`AND,((DST-PORT,443/udp)),Sub-Rule,(QUIC_CHECK)` 应该正确显示
   - 不应该有任何警告或错误标记
   
4. **保存并检查生成的配置**
   - 保存配置
   - 查看生成的 YAML 文件（通常在 `data/profiles/` 或类似目录）
   - 确认 `sub-rules` 块存在且内容正确
   
5. **测试运行**
   - 启动 Clash 核心
   - 测试 QUIC 流量（UDP 443 端口）是否按预期被处理

## 支持的 Sub-Rule 语法

现在以下所有语法都应该被正确支持：

```yaml
# 简化语法（端口+协议）
- AND,((DST-PORT,443/udp)),Sub-Rule,(QUIC_CHECK)

# 完整语法
- AND,((NETWORK,UDP),(DST-PORT,443)),Sub-Rule,(QUIC_CHECK)

# 复杂逻辑组合
- AND,((NETWORK,UDP),(DST-PORT,443),(NOT,((RULE-SET,private)))),Sub-Rule,(QUIC_CHECK)

# OR 逻辑
- OR,((DST-PORT,80),(DST-PORT,443)),Sub-Rule,(HTTP_CHECK)

# 嵌套逻辑
- AND,((OR,((DST-PORT,80),(DST-PORT,443))),(NETWORK,TCP)),Sub-Rule,(WEB_CHECK)
```

## 故障排除

### 如果规则仍然不显示

1. **检查浏览器控制台**（如果是 Web 界面）
   - 查看是否有 JavaScript 错误
   
2. **检查日志文件**
   - 查看 GUI for Clash 的日志
   - 查看 Clash 核心的日志
   
3. **验证配置格式**
   - 确认 YAML 格式正确（缩进、冒号等）
   - 确认 sub-rules 块的名称与规则中引用的名称一致

### 如果构建失败

1. **清理并重新构建**
```powershell
cd frontend
rm -r node_modules
npm install
npm run build
```

2. **检查 TypeScript 错误**
```powershell
npm run type-check
```

## 额外说明

### 关于 443/udp 语法

`DST-PORT,443/udp` 是 Clash Mihomo 的简化写法，相当于：
```yaml
AND,((NETWORK,UDP),(DST-PORT,443))
```

两种写法现在都被支持。

### 关于 sub-rules 配置

`sub-rules` 是一组可重用的规则集：
- 可以被多个主规则引用
- 提供更好的配置组织和复用
- 在 GUI 中会被保存到 `profile.subRulesConfig`

## 需要帮助？

如果遇到问题，请提供：
1. 具体的错误信息（截图或文本）
2. 您的配置文件（可以脱敏）
3. GUI for Clash 的日志文件
4. Clash 核心的日志文件
