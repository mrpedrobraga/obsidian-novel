export type Success<T, E = undefined> = { success: true, value: T } | { success: false, value: E };
export function Success<T>(value: T): Success<T, any> { return { success: true, value } }
export function Failure(): Success<any, undefined> { return { success: false, value: undefined } }
export function FailureWith<E>(value: E): Success<any, E> { return { success: false, value } }
