using System.Threading;
using System.Threading.Tasks;
using MediatR.Pipeline;
using Microsoft.Extensions.Logging;

namespace BibleNote.Infrastructure.Logging
{
    public class RequestLogger<TRequest> : IRequestPreProcessor<TRequest>
    {
        private readonly ILogger logger;

        public RequestLogger(ILogger<TRequest> logger)
        {
            this.logger = logger;
        }

        public Task Process(TRequest request, CancellationToken cancellationToken)
        {
            var name = typeof(TRequest).Name;

            logger.LogInformation("BibleNoteApp Request: {Name} {@Request}", name, request);

            return Task.CompletedTask;
        }
    }
}
