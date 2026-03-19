declare module '@trpc/client' {
  export class TRPCClientError extends Error {
    data?: any;
    [key: string]: any;
  }
  export function httpBatchLink(opts: any): any;
  export function httpLink(opts: any): any;
}

declare module '@trpc/react-query' {
  export function createTRPCReact<T>(): any;
}

declare module 'react-hook-form' {
  export type FieldValues = Record<string, any>;
  export type FieldPath<T> = string;
  export type ControllerProps<TFieldValues = FieldValues, TName = string> = any;
  export const Controller: any;
  export const FormProvider: any;
  export function useFormContext(): any;
  export function useFormState(opts?: any): any;
  export function useForm(opts?: any): any;
}
