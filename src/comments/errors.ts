export type CommentError =
  | { name: "CommentNotFound"; message: string }
  | { name: "EventNotFound"; message: string }
  | { name: "EventNotPublished"; message: string }
  | { name: "Forbidden"; message: string }
  | { name: "ValidationError"; message: string; fields?: Record<string, string> }
  | { name: "UnexpectedDependencyError"; message: string };

export const CommentNotFound = (message: string): CommentError => ({
  name: "CommentNotFound",
  message,
});

export const EventNotFound = (message: string): CommentError => ({
  name: "EventNotFound",
  message,
});

export const EventNotPublished = (message: string): CommentError => ({
  name: "EventNotPublished",
  message,
});

export const Forbidden = (message: string): CommentError => ({
  name: "Forbidden",
  message,
});

export const ValidationError = (message: string, fields?: Record<string, string>): CommentError => ({
  name: "ValidationError",
  message,
  fields,
});

export const UnexpectedDependencyError = (message: string): CommentError => ({
  name: "UnexpectedDependencyError",
  message,
});
