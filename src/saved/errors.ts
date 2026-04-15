export type SavedEventError =
  | { name: "EventNotFound"; message: string }
  | { name: "EventNotSaveable"; message: string }
  | { name: "Forbidden"; message: string }
  | { name: "ValidationError"; message: string }
  | { name: "UnexpectedDependencyError"; message: string };

export const EventNotFound = (message: string): SavedEventError => ({
  name: "EventNotFound",
  message,
});

export const EventNotSaveable = (message: string): SavedEventError => ({
  name: "EventNotSaveable",
  message,
});

export const Forbidden = (message: string): SavedEventError => ({
  name: "Forbidden",
  message,
});

export const ValidationError = (message: string): SavedEventError => ({
  name: "ValidationError",
  message,
});

export const UnexpectedDependencyError = (message: string): SavedEventError => ({
  name: "UnexpectedDependencyError",
  message,
});
