# 科学·物理知识图谱

一个纯静态的科学、物理学习与诊断网站。首页默认进入**小学科学**，也可以切换到**物理**；包含知识点目录、局部先修图、自适应诊断、孩子档案和本机错题本。

在线地址：<https://physicalmap.pages.dev/>

## 保留范围

| 学科 | 知识点 | 先修关系 | 题目 | 课标条目 |
| --- | ---: | ---: | ---: | ---: |
| 科学（教科版小学一至六年级） | 269 | 337 | 1076 | 28 |
| 物理（人教版初中八、九年级及高中必修、选择性必修） | 269 | 637 | 1076 | 197 |
| 合计 | 538 | 974 | 2152 | 225 |

本分支已移除其他学科的数据、入口与页面文案。物理数据原来指向数学知识点的 `mathLinks` 字段也已移除；两科分别建图，没有跨学科先修边。

## 来源与许可

本项目修改自 [xiaoyang111222/cn-math-taxonomy](https://github.com/xiaoyang111222/cn-math-taxonomy)，保留原项目的科学、物理数据与核心图谱、诊断功能。感谢原作者及贡献者。

原项目与本修改版采用 **Creative Commons Attribution–NonCommercial 4.0 International（CC BY-NC 4.0）**，完整条款见 [LICENSE](LICENSE)。使用或再分发时请保留原项目署名和许可说明；商业使用须另行取得授权。

> 知识点粒度、课标转述、先修关系和诊断题答案仍需一线教师审核，不应把自动诊断结果当作正式评价。标有「待核」的内容应以官方教材和课程标准为准。

## 本地修改

无需 Node.js 依赖或构建步骤。在项目根目录运行：

```bash
python -m http.server 8765
```

然后打开 <http://localhost:8765/>。不要直接通过 `file://` 打开，否则浏览器会阻止 JSON 数据加载。

主要文件：

```text
index.html + assets/home.js       首页、学科切换、实时统计与年级入口
explore/                          知识点目录与局部先修图
diagnose/                         自适应诊断与结果分享
children/                         本机孩子档案、盲区与历史
wrongbook/                        本机错题本
assets/                           共用样式与脚本
data/topics.json                  科学、物理知识点
data/dependencies.json            先修关系
data/questions.json               题库
data/cn-curriculum-standards.json 课标条目
tests/                            两科范围与交互测试
```

档案、诊断记录和错题只保存在当前浏览器的 `localStorage`，不会自动同步到其他设备。清除浏览器数据或更换设备前，请在档案页“导出全部学习数据”；备份包含错题、两科诊断进度、薄弱台账及进度归档，支持旧版档案备份导入。遇到同学科进度冲突会保留双方，详见[备份规则](docs/pwa.md)。

诊断确认题数为 2、3、4（默认 3），旧设置中的 5 题会兼容为 4。统计默认关闭，采集地址留空。课标来源和待核状态见[课标说明](docs/standards-mapping.md)，本轮没有新增逐页内容核验。

## 验证与部署

```bash
npm test
```

可另行运行 `CHROME=/usr/bin/chromium npm run test:browser` 检查真实浏览器备份流程。

默认测试与 `.github/workflows/ci.yml` 对齐，覆盖数据、175 道题目配图、答案格式、诊断引擎、档案备份、错题本及历史兼容。自动核验通过不等同于学科内容经教师审核。

本项目可直接部署到 Cloudflare Pages：连接本仓库的 `main` 分支，框架选择「无」，构建命令使用 `exit 0`，输出目录使用 `/`。推送到 `main` 后，Cloudflare Pages 会自动构建并更新网站。

建议先在独立分支检查修改与预览，再合并到正式分支。手动部署脚本 `scripts/deploy-cf.sh` 已指向 `physicalmap`，但必须显式配置自己的 `CLOUDFLARE_ACCOUNT_ID` 与 `CLOUDFLARE_API_TOKEN`；它会发布到正式站点，不应当作本地预览命令。
