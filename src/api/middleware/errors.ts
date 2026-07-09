import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";

export class HttpError extends Error {
  public constructor(
    public readonly statusCode: number,
    message: string,
    public readonly details: unknown = null
  ) {
    super(message);
  }
}

export const notFound = (resource: string): HttpError =>
  new HttpError(404, `${resource} not found`);

export const registerErrorHandler = (server: FastifyInstance, production: boolean): void => {
  server.setErrorHandler(
    (error: FastifyError | ZodError | HttpError, request: FastifyRequest, reply: FastifyReply) => {
      request.log.error({ err: error }, "API request failed");

      if (error instanceof ZodError) {
        void reply.status(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message: "Request validation failed",
            details: error.issues
          }
        });
        return;
      }

      if ("validation" in error && error.validation !== undefined) {
        void reply.status(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message: "Request validation failed",
            details: error.validation
          }
        });
        return;
      }

      const statusCode =
        error instanceof HttpError
          ? error.statusCode
          : typeof error.statusCode === "number"
            ? error.statusCode
            : 500;
      const message = statusCode >= 500 && production ? "Internal server error" : error.message;

      void reply.status(statusCode).send({
        error: {
          code: statusCode >= 500 ? "INTERNAL_ERROR" : "REQUEST_ERROR",
          message,
          ...(error instanceof HttpError && error.details !== null
            ? { details: error.details }
            : {}),
          ...(statusCode >= 500 || production ? {} : { stack: error.stack })
        }
      });
    }
  );

  server.setNotFoundHandler((request, reply) => {
    request.log.warn({ method: request.method, url: request.url }, "API route not found");
    void reply.status(404).send({
      error: {
        code: "NOT_FOUND",
        message: "Route not found"
      }
    });
  });
};
