using AutoMapper;
using BibleNote.Domain.Contracts;
using MediatR;
using System.Threading;
using System.Threading.Tasks;

namespace BibleNote.Middleware.NavigationProviders.Commands.OneNote.Update
{
    public class Handler : IRequestHandler<Request>
    {
        private readonly ITrackingDbContext dbContext;
        private readonly IMapper mapper;

        public Handler(ITrackingDbContext dbContext, IMapper mapper)
        {
            this.dbContext = dbContext;
            this.mapper = mapper;
        }

        public async Task<Unit> Handle(Request request, CancellationToken cancellationToken)
        {
            var dbEntity = await this.dbContext.NavigationProvidersInfo
                .Where(p => p.Id == request.NavigationProvider.Id)
                .SingleAsync(cancellationToken);

            this.mapper.Map(request.NavigationProvider, dbEntity);
            await dbContext.SaveChangesAsync(cancellationToken);

            return Unit.Value;
        }
    }
}
