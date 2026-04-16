import { CreateAdminUserService } from "./auth/AdminUserService";
import { CreateAuthController } from "./auth/AuthController";
import { CreateAuthService } from "./auth/AuthService";
import { CreateInMemoryUserRepository } from "./auth/InMemoryUserRepository";
import { CreatePasswordHasher } from "./auth/PasswordHasher";
import { CreateApp } from "./app";
import type { IApp } from "./contracts";
import { CreateLoggingService } from "./service/LoggingService";
import type { ILoggingService } from "./service/LoggingService";
import { CreateInMemoryEventRepository } from "./events/InMemoryEventRepository";
import { CreateInMemoryRsvpRepository } from "./events/InMemoryRsvpRepository";
import { CreateEventService } from "./events/EventService";
import { CreateEventController } from "./events/EventController";
import { CreateInMemoryCommentRepository } from "./comments/InMemoryCommentRepository";
import { CreateCommentService } from "./comments/CommentService";
import { CreateCommentController } from "./comments/CommentController";
import { CreateInMemorySavedEventRepository } from "./saved/InMemorySavedEventRepository";
import { CreateSavedEventService } from "./saved/SavedEventService";
import { CreateSavedEventController } from "./saved/SavedEventController";

export function createComposedApp(logger?: ILoggingService): IApp {
  const resolvedLogger = logger ?? CreateLoggingService();

  // Authentication & authorization wiring
  const authUsers = CreateInMemoryUserRepository();
  const passwordHasher = CreatePasswordHasher();
  const authService = CreateAuthService(authUsers, passwordHasher);
  const adminUserService = CreateAdminUserService(authUsers, passwordHasher);
  const authController = CreateAuthController(
    authService,
    adminUserService,
    resolvedLogger,
  );

  // Event wiring
  const eventRepository = CreateInMemoryEventRepository();
  const rsvpRepository = CreateInMemoryRsvpRepository();
  const eventService = CreateEventService(eventRepository, rsvpRepository);
  const eventController = CreateEventController(eventService, resolvedLogger);

  // Comment wiring
  const commentRepository = CreateInMemoryCommentRepository();
  const commentService = CreateCommentService(commentRepository, eventRepository);
  const commentController = CreateCommentController(commentService, resolvedLogger);

  // Saved event wiring
  const savedEventRepository = CreateInMemorySavedEventRepository();
  const savedEventService = CreateSavedEventService(savedEventRepository, eventRepository);
  const savedEventController = CreateSavedEventController(savedEventService, resolvedLogger);

  return CreateApp(authController, eventController, commentController, savedEventController, resolvedLogger);
}