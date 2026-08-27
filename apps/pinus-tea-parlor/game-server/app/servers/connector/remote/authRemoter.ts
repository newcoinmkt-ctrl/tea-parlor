import { Application, FrontendSession } from 'pinus';

export default function (app: Application) {
  return new Remoter(app);
}

// 不强制 implements，避免 pinus 类型 index signature 报错
export class Remoter {
  constructor(private app: Application) {}

  async auth(_session: FrontendSession, token: string) {
    return { code: 200, token };
  }
}
