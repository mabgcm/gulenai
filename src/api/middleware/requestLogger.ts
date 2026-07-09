import type { FastifyInstance } from "fastify";

export const registerRequestLogger = (server: FastifyInstance): void => {
  const starts = new WeakMap<object, bigint>();

  server.addHook("onRequest", (request, _reply, done) => {
    starts.set(request, process.hrtime.bigint());
    done();
  });

  server.addHook("onResponse", (request, reply, done) => {
    const started = starts.get(request) ?? process.hrtime.bigint();
    const latencyMs = Number(process.hrtime.bigint() - started) / 1_000_000;
    request.log.info(
      {
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        latencyMs: Number(latencyMs.toFixed(2))
      },
      "API request complete"
    );
    done();
  });
};
