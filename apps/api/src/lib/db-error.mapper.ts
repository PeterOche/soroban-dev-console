import {
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";

export function mapPrismaError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case "P2002": {
        // Unique constraint failed
        const target = (error.meta?.target as string[])?.join(", ") || "field";
        throw new ConflictException({
          code: "UNIQUE_CONSTRAINT_VIOLATION",
          message: `Entity with this ${target} already exists.`,
          details: error.meta,
        });
      }
      case "P2025": {
        // Record not found
        throw new NotFoundException({
          code: "RECORD_NOT_FOUND",
          message: "The requested record was not found.",
        });
      }
      case "P2003": {
        // Foreign key constraint failed
        throw new ConflictException({
          code: "FOREIGN_KEY_VIOLATION",
          message: "Related record not found or operation violates integrity constraints.",
        });
      }
      default:
        break;
    }
  }

  if (error instanceof Error) {
    throw new InternalServerErrorException({
      code: "DATABASE_ERROR",
      message: error.message,
    });
  }

  throw new InternalServerErrorException("An unexpected database error occurred.");
}

/**
 * Decorator to automatically map Prisma errors to Domain errors
 */
export function MapDbErrors() {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      try {
        return await originalMethod.apply(this, args);
      } catch (error) {
        mapPrismaError(error);
      }
    };

    return descriptor;
  };
}
