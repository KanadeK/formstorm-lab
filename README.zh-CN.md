# FormStorm Lab

FormStorm Lab 根据表单 schema 与真实 HTML 表单，生成可复现的验证边界、国际化、无障碍测试，并保存可重放证据。

当前状态：正在开发 `v0.1.0`。

## 安全边界

默认目标是随仓库提交的本地 fixture。外部目标必须显式加入精确 origin allowlist。FormStorm Lab 不读取 Cookie、持久浏览器资料或表单中的既有值，并默认阻止会改变外部状态的网络请求。

## 开发

```bash
npm ci
npm run verify
```

完整使用指南、真实截图、CLI 示例、架构、测试证据与发布链接将在文档里程碑补齐。

## 许可证

[MIT](LICENSE)
