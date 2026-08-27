/**
 * Tea Parlor · Colyseus 游戏服入口
 * 默认端口 2567（Colyseus 惯例）
 *
 * 框架源码克隆：external/colyseus
 * 运行依赖：npm 包 colyseus（业务服不必编译 monorepo）
 */
import http from 'http';
import express from 'express';
import cors from 'cors';
import colyseus from 'colyseus';
import wsTransport from '@colyseus/ws-transport';
import { DoudizhuRoom } from './rooms/DoudizhuRoom.js';

const { Server } = colyseus;
const { WebSocketTransport } = wsTransport;

const PORT = Number(process.env.PORT || process.env.COLYSEUS_PORT || 2567);
const HOST = process.env.COLYSEUS_HOST || '0.0.0.0';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'tea-parlor-colyseus',
    games: ['doudizhu'],
    port: PORT,
  });
});

app.get('/', (_req, res) => {
  res.type('html').send(`<!doctype html>
<html><head><meta charset="utf-8"><title>Tea Parlor Colyseus</title></head>
<body style="font-family:system-ui;padding:24px;background:#0b1a12;color:#f5f0e0">
  <h1>Tea Parlor · Colyseus</h1>
  <p>权威多人房游戏服已启动 · 端口 <b>${PORT}</b></p>
  <ul>
    <li>房间名：<code>doudizhu</code></li>
    <li>健康检查：<a href="/health" style="color:#9fefc0">/health</a></li>
    <li>H5 模式：大厅 → 对局模式 → <b>Colyseus 联网</b></li>
  </ul>
</body></html>`);
});

const httpServer = http.createServer(app);

const gameServer = new Server({
  transport: new WebSocketTransport({
    server: httpServer,
  }),
});

gameServer.define('doudizhu', DoudizhuRoom).enableRealtimeListing();

httpServer.listen(PORT, HOST, () => {
  console.log(`[colyseus] Tea Parlor game server listening on http://${HOST}:${PORT}`);
  console.log(`[colyseus] room: doudizhu · engine: packages/doudizhu-engine`);
  console.log(`[colyseus] health: http://127.0.0.1:${PORT}/health`);
});
