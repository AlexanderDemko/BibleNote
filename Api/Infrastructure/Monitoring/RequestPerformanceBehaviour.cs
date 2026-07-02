using System.Diagnostics;
using System.Threading;
using System.Threading.Tasks;
using MediatR;
using Microsoft.Extensions.Logging;

namespace BibleNote.Infrastructure.Monitoring
{
    public class RequestPerformanceBehaviour<TRequest, TResponse> : IPipelineBehavior<TRequest, TResponse>
    {
        private readonly Stopwatch timer;
        private readonly ILogger<TRequest> logger;

        public RequestPerformanceBehaviour(ILogger<TRequest> logger)
        {
            timer = new Stopwatch();

            this.logger = logger;
        }

        public async Task<TResponse> Handle(TRequest request, CancellationToken cancellationToken, RequestHandlerDelegate<TResponse> next)
        {
            timer.Start();

            var response = await next();

            timer.Stop();

            if (timer.ElapsedMilliseconds > 500)
            {
                var name = typeof(TRequest).Name;

                logger.LogWarning("BibleNoteApp Long Running Request: {Name} ({ElapsedMilliseconds} milliseconds) {@Request}", name, timer.ElapsedMilliseconds, request);
            }

            return response;
        }
    }
}
