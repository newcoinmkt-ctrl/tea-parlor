# Tea Parlor · Pinus 游戏服

基于 [node-pinus/pinus](https://github.com/node-pinus/pinus)（Pomelo 的 TypeScript 版）搭建的棋牌室游戏服务端。

本地已克隆源码：`external/pinus`（框架与官方示例）。

本目录是 **Tea Parlor 业务服**，在 Pinus 之上接入：

- 连接入口 `connector.entryHandler`
- 斗地主人机局 `connector.ddzHandler`（1 真人 + 2 AI）
- 后续可扩展德州 / 真金场 / 网关鉴权

## 目录

```text
apps/pinus-tea-parlor/
├── README.md
└── game-server/          # Pinus game-server
    ├── app.ts
    ├── preload.ts
    ├── config/           # master / servers / protos
    └── app/
        ├── servers/connector/handler/
        │   ├── entryHandler.ts
        │   └── ddzHandler.ts
        └── services/RoomManager.ts
```

框架源码与官方例子：

```text
external/pinus/                 # git clone 的 pinus 仓库
external/pinus/examples/        # simple-example / websocket-chat 等
```

## 安装与启动

```bash
cd /Users/newcoin/Desktop/棋牌室/apps/pinus-tea-parlor/game-server
npm install
npm start
```

成功日志类似：

```text
all servers startup in xxx ms
```

默认端口：

| 服务 | 端口 |
|------|------|
| master | 3005 |
| connector 对内 | 3150 |
| **客户端 WebSocket** | **3010** |

## 客户端协议（概要）

使用与 Pomelo 兼容的 JS 客户端（如 `pinus-robot-plugin` / pomelo-jsclient-websocket）。

1. 连接 `ws://127.0.0.1:3010`
2. `connector.entryHandler.enter` → `{ uid, name, currency }`
3. `connector.ddzHandler.create` → `{ roomId: 'novice' }` 开人机局
4. `connector.ddzHandler.bid` / `play` / `pass` / `hint` / `state`

### 示例消息

```js
// 进入
pomelo.request('connector.entryHandler.enter', { uid: 'u1', name: '老A' }, console.log);

// 开局
pomelo.request('connector.ddzHandler.create', { roomId: 'novice' }, console.log);

// 叫 3 分
pomelo.request('connector.ddzHandler.bid', { score: 3 }, console.log);

// 出牌
pomelo.request('connector.ddzHandler.play', { cardIds: ['3_0_1'] }, console.log);

// 不出
pomelo.request('connector.ddzHandler.pass', {}, console.log);
```

## 与 H5 大厅关系

| 模块 | 现状 | 与 Pinus |
|------|------|----------|
| `apps/web-lobby` | 大厅 + 牌桌；可切换 **本地人机 / Pinus 联网** | 主页「对局模式」切换；联网走 `public/pinus/pinusclient.js` |
| `packages/doudizhu-engine` | JJ 完整规则 + AI | **服务端 RoomManager 已动态加载** engine/ai/rules |
| `apps/pinus-tea-parlor` | **本服** | 实时对局权威状态 |

### H5 联网用法

1. 启动本游戏服（见上）  
2. 打开 H5：`http://127.0.0.1:5173/`  
3. 主页点 **对局模式** → 切到 `Pinus 联网`  
4. 进入斗地主场次开局（失败会自动回退本地人机）  

## 开发说明

- 协议兼容 Pomelo，可用官方 / 社区客户端  
- 完整框架编译见 `external/pinus/README.md`：`yarn && yarn run build`  
- 初始化空项目也可用：`npm i -g pinus && pinus init`  
- 本业务服依赖 npm 包 `pinus@^1.7.4`，无需每次编译整个 monorepo  
- 引擎路径：`packages/doudizhu-engine/src`（ESM，服务端用原生 `import()` 加载）

## 下一步

- [x] 引入完整 `@tea-parlor/doudizhu-engine`  
- [x] web-lobby 切换为 Pinus 客户端（可选模式）  
- [ ] connector 广播 `onRoomUpdate` push（减少轮询）  
- [ ] 德州 `texasHandler`  
- [ ] gate 服 + 多 connector 水平扩展  
