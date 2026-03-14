declare module '@dnd-kit/core' {
  export type DragEndEvent = any;
  export type DragStartEvent = any;
  export type DragOverEvent = any;
  export const DndContext: any;
  export const closestCenter: any;
  export const closestCorners: any;
  export const KeyboardSensor: any;
  export const PointerSensor: any;
  export const MouseSensor: any;
  export const TouchSensor: any;
  export function useSensor(sensor: any, options?: any): any;
  export function useSensors(...sensors: any[]): any;
  export const DragOverlay: any;
}

declare module '@dnd-kit/sortable' {
  export function useSortable(args: any): any;
  export const SortableContext: any;
  export const sortableKeyboardCoordinates: any;
  export const verticalListSortingStrategy: any;
  export const horizontalListSortingStrategy: any;
  export const rectSortingStrategy: any;
  export function arrayMove<T>(array: T[], from: number, to: number): T[];
}

declare module '@dnd-kit/utilities' {
  export const CSS: any;
}
