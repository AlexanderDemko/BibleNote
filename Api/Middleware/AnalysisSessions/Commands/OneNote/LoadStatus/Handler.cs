using AutoMapper;
using BibleNote.Domain.Contracts;
using BibleNote.Middleware.AnalysisSessions.SharedViewModels;
using BibleNote.Providers.OneNote.Services.NavigationProvider;
using BibleNote.Services.Contracts;
using MediatR;
using System;
using System.Threading;
using System.Threading.Tasks;

namespace BibleNote.Middleware.AnalysisSessions.Commands.OneNote.LoadStatus
{
    public class Handler : IRequestHandler<Request, AnalysisSessionVm>
    {
        private readonly IAnalysisSessionsService analysisSessionsService;
        private readonly ITrackingDbContext dbContext;
        private readonly OneNoteNavigationProvider oneNoteNavigationProvider;
        private readonly IMapper mapper;

        public Handler(
            IAnalysisSessionsService analysisSessionsService,
            ITrackingDbContext dbContext,
            OneNoteNavigationProvider oneNoteNavigationProvider,
            IMapper mapper)
        {
            this.analysisSessionsService = analysisSessionsService;
            this.dbContext = dbContext;
            this.oneNoteNavigationProvider = oneNoteNavigationProvider;
            this.mapper = mapper;
        }

        public async Task<AnalysisSessionVm> Handle(Request request, CancellationToken cancellationToken)
        {
            var analysisSession = await analysisSessionsService.GetActualSession(request.NavigationProviderId, cancellationToken);
            analysisSession.GetDocumentsInfoTime = DateTime.Now;
            await dbContext.SaveChangesAsync(cancellationToken);

            var navigationProviderInfo = await dbContext.NavigationProvidersInfo
                .Where(p => p.Id == request.NavigationProviderId)
                .SingleAsync(cancellationToken);
            oneNoteNavigationProvider.SetParameters(navigationProviderInfo);

            var documents = await oneNoteNavigationProvider.LoadDocuments(
                analysisSession,
                newOnly: false,
                updateDb: false,
                cancellationToken);

            return mapper.Map<AnalysisSessionVm>(analysisSession);
        }
    }
}