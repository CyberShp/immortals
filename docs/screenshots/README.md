# 浏览器验证

本次六图回归启动失败：系统 Chrome 在创建页面前 SIGABRT。没有截图通过证据，未伪造 PNG。自启 preview 已关闭。

`soak-report.json` 是明确标记未运行的记录，不是挂机通过报告。复跑脚本会覆盖它。

构建后自行启动 `npx vite preview --port 4173`，再执行：

```sh
node scripts/e2e.mjs http://localhost:4173
node scripts/e2e.mjs http://localhost:4173 --soak
```

脚本不会启动或关闭服务器；它只管理自己的独立无头 Chrome。
