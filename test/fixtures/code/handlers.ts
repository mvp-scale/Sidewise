// @ts-nocheck
import { db } from './db';
// function fake() { in a comment }
const RE = /[{]function/g;
export async function findUser(req: Request): Promise<User> {
  const id = req.query.id;
  const sql = `SELECT * FROM users WHERE id = ${id} AND x = '${ { a: 1 }.a }'`;
  return db.query(sql);
}

export const getOrder = async (id: string) => {
  const order = await db.orders.find(id);
  if (!order) throw new Error("no { order");
  return order;
};

const double = (x: number) => x * 2;

function helper(a: string, b = '}') {
  return a + b;
}

export class OrderService {
  private readonly cache = new Map<string, number>();
  constructor(private db: Db) {}
  async listOrders(user: string) {
    for (const o of await this.db.all(user)) log(o);
    return this.cache.get(user);
  }
  static create() { return new OrderService(db); }
}

export default function (req: Request) {
  return findUser(req);
}
