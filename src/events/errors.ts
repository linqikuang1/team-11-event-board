export type EventError =
  | { name: "Forbidden"; message: string }
  | { name: "EventNotFound"; message: string }
  | { name: "ValidationError"; message: string; fields?: Record<string, string> }
  | { name: "UneditableStatus"; message: string }
  | { name: "UnexpectedDependencyError"; message: string }
  | { name: "EventFull"; message: string }
  | { name: "InvalidTransition"; message: string };

export const Forbidden = (message: string): EventError => ({
  name: "Forbidden",
  message,
});

export const EventNotFound = (message: string): EventError => ({
  name: "EventNotFound",
  message,
});

export const ValidationError = (message: string, fields?: Record<string, string>): EventError => ({
  name: "ValidationError",
  message,
  fields,
});

export const UneditableStatus = (message: string): EventError => ({
  name: "UneditableStatus",
  message,
});

export const EventFull = (message: string): EventError => ({
  name: "EventFull",
  message,
});
 
export const InvalidTransition = (message: string): EventError => ({
  name: "InvalidTransition",
  message,
});

export const UnexpectedDependencyError = (message: string): EventError => ({
  name: "UnexpectedDependencyError",
  message,
});