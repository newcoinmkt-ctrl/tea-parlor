import { Application, FrontendSession } from 'pinus';
import { getRoomManager } from '../../../services/RoomManager';

export default function (app: Application) {
  return new Handler(app);
}

/**
 * 连接入口：登录、心跳探测
 * 路由：connector.entryHandler.entry / enter
 */
export class Handler {
  constructor(private app: Application) {}

  /** 连通性测试 */
  async entry(_msg: any, _session: FrontendSession) {
    return {
      code: 200,
      msg: 'tea-parlor pinus game server is ok',
      server: this.app.getServerId(),
      time: Date.now(),
    };
  }

  /**
   * 玩家进入
   * msg: { uid, name, currency?: 'ingot'|'crypto' }
   */
  async enter(msg: any, session: FrontendSession) {
    const uid = String(msg?.uid || msg?.userId || `guest_${Date.now()}`);
    const name = String(msg?.name || '茶馆').slice(0, 16);

    if (!session.uid) {
      // 绑定 session
      await this.bindSession(session, uid);
    }

    session.set('name', name);
    session.set('currency', msg?.currency === 'crypto' ? 'crypto' : 'ingot');
    session.pushAll(() => {});

    const rm = getRoomManager();
    rm.touchPlayer(uid, name);

    return {
      code: 200,
      uid,
      name,
      currency: session.get('currency'),
      msg: 'enter ok',
    };
  }

  private bindSession(session: FrontendSession, uid: string): Promise<void> {
    return new Promise((resolve, reject) => {
      session.bind(uid, (err) => {
        if (err) return reject(err);
        session.on('closed', this.onSessionClose.bind(this));
        resolve();
      });
    });
  }

  private onSessionClose(session: FrontendSession) {
    if (!session || !session.uid) return;
    try {
      getRoomManager().leave(session.uid);
    } catch (_) {}
  }
}
