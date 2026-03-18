declare module 'mysql2/promise' {
  export interface Pool {
    execute<T = any>(...args: any[]): Promise<T>;
    query<T = any>(...args: any[]): Promise<T>;
    getConnection(): Promise<PoolConnection>;
    end(): Promise<void>;
    [key: string]: any;
  }

  export interface PoolConnection {
    execute<T = any>(...args: any[]): Promise<T>;
    query<T = any>(...args: any[]): Promise<T>;
    release(): void;
    beginTransaction(): Promise<void>;
    commit(): Promise<void>;
    rollback(): Promise<void>;
    [key: string]: any;
  }

  export interface Connection {
    execute<T = any>(...args: any[]): Promise<T>;
    query<T = any>(...args: any[]): Promise<T>;
    release(): void;
    [key: string]: any;
  }

  export function createPool(config: any): Pool;
  export function createConnection(config: any): Promise<Connection>;

  const mysql: {
    Pool: Pool;
    Connection: Connection;
    createPool: typeof createPool;
    createConnection: typeof createConnection;
  };

  export default mysql;
}
