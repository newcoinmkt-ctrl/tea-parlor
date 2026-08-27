/**
 * Tea Parlor 棋牌室 — Pinus 游戏服入口
 * 基于 https://github.com/node-pinus/pinus 的 simple-example 改造
 */
import { pinus } from 'pinus';
import { preload } from './preload';
import { createBasePlugin } from 'pinus-base-plugin';

preload();

const app = pinus.createApp();
app.set('name', 'tea-parlor-pinus');

app.configure('production|development', 'connector', function () {
  app.set('connectorConfig', {
    connector: pinus.connectors.hybridconnector,
    heartbeat: 30,
    useDict: true,
    useProtobuf: true,
  });
});

// 可选官方插件
try {
  app.use(createBasePlugin());
} catch (e) {
  console.warn('[tea-parlor] base-plugin skip', (e as Error).message);
}

app.start();

console.log('[tea-parlor-pinus] starting… connector clientPort 3010, master 3005');
