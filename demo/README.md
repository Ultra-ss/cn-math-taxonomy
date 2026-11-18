# 宣传演示分支

固定入口：https://promotion-demo.physicalmap.pages.dev/

本分支只发布到 Cloudflare Pages 的 `promotion-demo` 预览环境，不合并到 `main`。
正式网页 https://physicalmap.pages.dev/ 保持原有代码、功能和数据。
两个网址的本地账号、进度、服装、浏览器缓存按 origin 隔离。

演示页首访同步载入 `seed.js`，后续保留本机演示操作。
页眉“演示工具 → 恢复演示预设”可重新载入 89.96% 通关进度与全套服装。
该操作仅修改演示网址的已列明学习数据键，保留主题设置与其他存储。
演示环境不注册离线 Service Worker，也不加载访问统计和安装提示。

更新正式功能后可将 `main` 合并到本分支，保留演示 head 脚本和隔离策略。
更新题目或知识点后运行 `node scripts/promotion-demo-data.js demo/seed.json`，
再用 `seed.json` 生成 `window.CnmPromotionSeed = <JSON>;` 的 `seed.js`。
生成器的默认数据时间固定，以便复现；运行操作只影响演示账号。

本地预览必须使用独立 origin `http://127.0.0.1:8774`：

```
python3 -m http.server 8774 --bind 127.0.0.1
node tests/test_promotion_demo_data.js
node tests/test_promotion_demo_bootstrap.js
```

禁止使用 `scripts/deploy-cf.sh` 发布演示：该脚本以正式 `main` 为目标。
仅推送 `promotion-demo` 分支，并验证 Cloudflare 的预览检查与分支别名。
