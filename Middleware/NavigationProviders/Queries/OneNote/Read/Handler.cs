using AutoMapper;
using BibleNote.Domain.Contracts;
using BibleNote.Middleware.NavigationProviders.SharedViewModels;
using MediatR;
using System.Threading;
using System.Threading.Tasks;

namespace BibleNote.Middleware.NavigationProviders.Queries.OneNote.Read
{
    public class Handler : IRequestHandler<Request, OneNoteNavigationProviderVm>
    {
        private readonly IReadOnlyDbContext dbContext;
        private readonly IMapper mapper;

        public Handler(IReadOnlyDbContext dbContext, IMapper mapper)
        {
            this.dbContext = dbContext;
            this.mapper = mapper;
        }

        public async Task<OneNoteNavigationProviderVm> Handle(Request request, CancellationToken cancellationToken)
        {
            var providerInfo = await this.dbContext.NavigationProvidersInfo
                .Where(p => p.Id == request.NavigationProviderId)
                .SingleOrDefaultAsync(cancellationToken);

            return this.mapper.Map<OneNoteNavigationProviderVm>(providerInfo);
        }
    }
}
