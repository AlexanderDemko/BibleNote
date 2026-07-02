using AutoMapper;
using BibleNote.Domain.Contracts;
using BibleNote.Domain.Entities;
using MediatR;
using System.Threading;
using System.Threading.Tasks;

namespace BibleNote.Middleware.NavigationProviders.Commands.OneNote.Create
{
    public class Handler : IRequestHandler<Request, int>
    {
        private readonly ITrackingDbContext dbContext;
        private readonly IMapper mapper;

        public Handler(ITrackingDbContext dbContext, IMapper mapper)
        {
            this.dbContext = dbContext;
            this.mapper = mapper;
        }

        public Task<int> Handle(Request request, CancellationToken cancellationToken)
        {
            var navigationProvider = this.mapper.Map<NavigationProviderInfo>(request.NavigationProvider);
            this.dbContext.NavigationProvidersInfo.Add(navigationProvider);
            return this.dbContext.SaveChangesAsync(cancellationToken);
        }
    }
}
