import { CreateAdminUserService } from "./auth/AdminUserService";
import { CreateAuthController } from "./auth/AuthController";
import { CreateAuthService } from "./auth/AuthService";
import { CreateInMemoryUserRepository } from "./auth/InMemoryUserRepository";
import { CreatePasswordHasher } from "./auth/PasswordHasher";
import { CreateApp } from "./app";
import type { IApp } from "./contracts";
import { CreateLoggingService } from "./service/LoggingService";
import type { ILoggingService } from "./service/LoggingService";
import { CreatePrismaEventRepository } from "./events/PrismaEventRepository";
import { CreateInMemoryEventRepository } from "./events/InMemoryEventRepository";
import { CreateInMemoryRsvpRepository } from "./events/InMemoryRsvpRepository";
import { CreateEventService } from "./events/EventService";
import { CreateEventController } from "./events/EventController";
import { CreatePrismaCommentRepository } from "./comments/PrismaCommentRepository";
import { CreateCommentService } from "./comments/CommentService";
import { CreateCommentController } from "./comments/CommentController";
import { CreatePrismaSavedEventRepository } from "./saved/PrismaSavedEventRepository";
import { CreateInMemoryCommentRepository } from "./comments/InMemoryCommentRepository";
import { CreateInMemorySavedEventRepository } from "./saved/InMemorySavedEventRepository";
import { CreateSavedEventService } from "./saved/SavedEventService";
import { CreateSavedEventController } from "./saved/SavedEventController";
import { prisma } from "./prisma/client";

export function createComposedApp(logger?: ILoggingService): IApp {
  const resolvedLogger = logger ?? CreateLoggingService();

  const authUsers = CreateInMemoryUserRepository();
  const passwordHasher = CreatePasswordHasher();
  const authService = CreateAuthService(authUsers, passwordHasher);
  const adminUserService = CreateAdminUserService(authUsers, passwordHasher);
  const authController = CreateAuthController(authService, adminUserService, resolvedLogger);

  const eventRepository = CreatePrismaEventRepository(prisma);
  const rsvpRepository = CreateInMemoryRsvpRepository();
  const eventService = CreateEventService(eventRepository, rsvpRepository, authUsers);

  const savedEventRepository = CreatePrismaSavedEventRepository(prisma);
  const savedEventService = CreateSavedEventService(savedEventRepository, eventRepository);
  const eventController = CreateEventController(eventService, savedEventService, resolvedLogger);

  const commentRepository = CreatePrismaCommentRepository(prisma);
  const commentService = CreateCommentService(commentRepository, eventRepository);
  const commentController = CreateCommentController(commentService, resolvedLogger);

  const savedEventController = CreateSavedEventController(savedEventService, resolvedLogger);

  return CreateApp(authController, eventController, commentController, savedEventController, resolvedLogger);
}

export function createTestComposedApp(logger?: ILoggingService): IApp {
  const resolvedLogger = logger ?? CreateLoggingService();

  const authUsers = CreateInMemoryUserRepository();
  const passwordHasher = CreatePasswordHasher();
  const authService = CreateAuthService(authUsers, passwordHasher);
  const adminUserService = CreateAdminUserService(authUsers, passwordHasher);
  const authController = CreateAuthController(authService, adminUserService, resolvedLogger);

  const eventRepository = CreateInMemoryEventRepository();
  const rsvpRepository = CreateInMemoryRsvpRepository();
  const eventService = CreateEventService(eventRepository, rsvpRepository, authUsers);

  const savedEventRepository = CreateInMemorySavedEventRepository();
  const savedEventService = CreateSavedEventService(savedEventRepository, eventRepository);
  const eventController = CreateEventController(eventService, savedEventService, resolvedLogger);

  const commentRepository = CreateInMemoryCommentRepository();
  const commentService = CreateCommentService(commentRepository, eventRepository);
  const commentController = CreateCommentController(commentService, resolvedLogger);

  const savedEventController = CreateSavedEventController(savedEventService, resolvedLogger);

  return CreateApp(authController, eventController, commentController, savedEventController, resolvedLogger);
}