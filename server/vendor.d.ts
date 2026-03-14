declare module 'mysql2/promise' {
  export interface Pool {
    execute: (...args: any[]) => Promise<any>;
    query: (...args: any[]) => Promise<any>;
    getConnection: () => Promise<any>;
    end: () => Promise<void>;
    [key: string]: any;
  }
  export function createPool(config: any): Pool;
  export default function createPool(config: any): Pool;
}
