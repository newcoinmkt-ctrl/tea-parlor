# openinggame/qp 候选评估

评估日期：2026-08-15

仓库：https://github.com/openinggame/qp

本地隔离目录：`external/github-candidates/openinggame-qp`

Commit：`8f249ff4c73dd692ff62ace94ca470cc47ddb014`

本地留档：只保留本评估文档和上游 `README.md`。评估完成后已删除 `mysqldb.tar.gz`、`mongodb.tar.gz`、`GameScreenshot/`、`docker-compose.yml` 及嵌套 `.git`（含数据库归档与不明来源截图，禁止复用）。

## 结论

状态：`quarantine`

评分：`0/12`

本仓库不适合直接合并到当前棋牌室正式源码。仓库没有提供可审计的游戏源码、规则引擎或前端源码，主要内容是 Docker 编排、闭源容器镜像引用、数据库归档和截图素材。当前项目要求游戏通过统一 Game Adapter 接入，游戏服务只能产出结算意图，钱包入账由 wallet-service 完成；该候选无法验证这些边界。

## 已检查内容

- 发现文件：`README.md`、`docker-compose.yml`、`GameScreenshot/`、`mysqldb.tar.gz`、`mongodb.tar.gz`。
- 未发现 `LICENSE` 文件。
- 未发现可直接适配的规则引擎源码、H5 源码或单元测试。
- `docker-compose.yml` 依赖闭源 `openinggame/web:v1` 和 `openinggame/server:v1` 镜像。
- 数据库归档是运行数据目录，不是迁移脚本或可审计 schema。

## 风险

- License 缺失，不能确认代码、素材、截图或数据库内容可复用。
- Web/Server 为闭源镜像，无法审计安全、规则公平性、钱包边界或后门风险。
- 数据库归档可能包含账号、配置、凭据、日志或其他运行数据，不应导入当前项目。
- Compose 文件包含硬编码服务凭据，并挂载 Docker socket，安全风险高。
- README 描述的是完整 H5 棋牌游戏平台，与当前项目的纯规则引擎、Game Adapter、影子积分账本边界不一致。
- 截图和 UI 资产来源不明，存在 IP/品牌素材风险。

## 可参考范围

- 仅可参考公开截图与 README 中的产品信息架构，例如大厅、房间、活动入口的层级关系。
- 参考时必须重新绘制自有 UI，不复制图片、图标、角色、牌桌、牌面或品牌化表达。

## 禁止合入范围

- 不合入 `openinggame/web:v1`、`openinggame/server:v1` 或任何闭源镜像。
- 不导入 `mysqldb.tar.gz`、`mongodb.tar.gz` 中的数据。
- 不复用截图素材、角色形象、牌桌、牌面或其他无法确认授权的资产。
- 不接入候选项目中的账号、币、注册、充值、提现或余额逻辑。

## 后续建议

继续使用当前项目已建立的 `packages/doudizhu-engine`、`packages/game-adapter`、`apps/wallet-service` 和 H5 大厅/牌桌实现。若要吸收该候选的视觉方向，只把它作为参考图，按当前项目规则重做自有前端组件，并补 Playwright 移动端和桌面截图验证。
