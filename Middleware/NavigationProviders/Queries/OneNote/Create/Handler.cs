using AutoMapper;
using BibleNote.Domain.Contracts;
using BibleNote.Domain.Entities;
using BibleNote.Domain.Enums;
using BibleNote.Providers.OneNote.Services.Models;
using BibleNote.Providers.OneNote.Services.NavigationProvider;
using MediatR;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace BibleNote.Middleware.NavigationProviders.Queries.OneNote.Create
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
            navigationProvider.Type = NavigationProviderType.OneNote;

            var providerParameters = new OneNoteNavigationProviderParameters
            {
                HierarchyItems = this.mapper.Map<List<OneNoteHierarchyInfo>>(request.HierarchyItems)
            };
            navigationProvider.ParametersRaw = providerParameters.GetParametersRaw();

            this.dbContext.NavigationProvidersInfo.Add(navigationProvider);
            return this.dbContext.SaveChangesAsync(cancellationToken);
        }
    }
}
