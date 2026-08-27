import { Application, FrontendSession } from 'pinus';
import { getRoomManager } from '../../../services/RoomManager';

export default function (app: Application) {
  return new Handler(app);
}

/**
 * 斗地主人机桌（1 真人 + 2 AI）
 * 路由前缀：connector.ddzHandler.*
 *
 * - create / joinQuick  开局
 * - bid                 叫分 0-3
 * - play                出牌 { cardIds: string[] }
 * - pass                不出
 * - hint                提示
 * - state               拉状态
 */
export class Handler {
  constructor(private app: Application) {}

  async create(msg: any, session: FrontendSession) {
    if (!session.uid) return { code: 401, msg: '请先 connector.entryHandler.enter' };
    const rm = getRoomManager();
    try {
      const room = await rm.createDdzRoom({
        uid: session.uid,
        name: session.get('name') || '茶馆',
        roomId: msg?.roomId || 'novice',
        currency: session.get('currency') || 'ingot',
      });
      session.set('ddzRoomId', room.id);
      session.push('ddzRoomId', () => {});
      return { code: 200, room: room.publicState(session.uid) };
    } catch (e: any) {
      return { code: 500, msg: e?.message || 'create failed' };
    }
  }

  async joinQuick(msg: any, session: FrontendSession) {
    return this.create(msg, session);
  }

  async bid(msg: any, session: FrontendSession) {
    const room = this.needRoom(session);
    if ((room as any).code) return room;
    try {
      (room as any).bid(session.uid!, Number(msg?.score ?? 0));
      return { code: 200, room: (room as any).publicState(session.uid!) };
    } catch (e: any) {
      return { code: 400, msg: e?.message || 'bid failed' };
    }
  }

  async play(msg: any, session: FrontendSession) {
    const room = this.needRoom(session);
    if ((room as any).code) return room;
    try {
      const cardIds = Array.isArray(msg?.cardIds) ? msg.cardIds.map(String) : [];
      (room as any).play(session.uid!, cardIds);
      return { code: 200, room: (room as any).publicState(session.uid!) };
    } catch (e: any) {
      return { code: 400, msg: e?.message || 'play failed' };
    }
  }

  async pass(_msg: any, session: FrontendSession) {
    const room = this.needRoom(session);
    if ((room as any).code) return room;
    try {
      (room as any).pass(session.uid!);
      return { code: 200, room: (room as any).publicState(session.uid!) };
    } catch (e: any) {
      return { code: 400, msg: e?.message || 'pass failed' };
    }
  }

  async hint(_msg: any, session: FrontendSession) {
    const room = this.needRoom(session);
    if ((room as any).code) return room;
    try {
      const cards = (room as any).hint(session.uid!);
      return { code: 200, cards, room: (room as any).publicState(session.uid!) };
    } catch (e: any) {
      return { code: 400, msg: e?.message || 'hint failed' };
    }
  }

  async state(_msg: any, session: FrontendSession) {
    const room = this.needRoom(session);
    if ((room as any).code) return room;
    return { code: 200, room: (room as any).publicState(session.uid!) };
  }

  private needRoom(session: FrontendSession) {
    if (!session.uid) return { code: 401, msg: '未登录' };
    const roomId = session.get('ddzRoomId');
    const room = roomId ? getRoomManager().get(roomId) : getRoomManager().findByUid(session.uid);
    if (!room) return { code: 404, msg: '不在房间内，请先 create' };
    session.set('ddzRoomId', room.id);
    return room;
  }
}
