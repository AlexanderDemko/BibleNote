using AutoMapper;
using BibleNote.Domain.Contracts;
using BibleNote.Middleware.AnalysisSessions.SharedViewModels;
using BibleNote.Providers.OneNote.Services.NavigationProvider;
using BibleNote.Services.Analyzer.Models;
using BibleNote.Services.Contracts;
using MediatR;
using System.Threading;
using System.Threading.Tasks;

namespace BibleNote.Middleware.AnalysisSessions.Commands.OneNote.Run
{
    public class Handler : IRequestHandler<Request, AnalysisSessionVm>
    {
        private readonly IAnalyzer analyzer;
        private readonly ITrackingDbContext dbContext;
        private readonly OneNoteNavigationProvider oneNoteNavigationProvider;
        private readonly IMapper mapper;

        public Handler(
            IAnalyzer analyzer,
            ITrackingDbContext dbContext,
            OneNoteNavigationProvider oneNoteNavigationProvider,
            IMapper mapper)
        {
            this.analyzer = analyzer;
            this.dbContext = dbContext;
            this.oneNoteNavigationProvider = oneNoteNavigationProvider;
            this.mapper = mapper;
        }

        public async Task<AnalysisSessionVm> Handle(Request request, CancellationToken cancellationToken)
        {
            var navigationProviderInfo = await dbContext.NavigationProvidersInfo
               .Where(p => p.Id == request.NavigationProviderId)
               .SingleAsync(cancellationToken);
            oneNoteNavigationProvider.SetParameters(navigationProviderInfo);

            var options = new AnalyzerOptions() { Depth = AnalyzeDepth.All };

            var analysisSession = await analyzer.AnalyzeAsync(oneNoteNavigationProvider, options, (documentId, parseResult) =>
            {
                //request.CallbackFunction
            }, cancellationToken);

            return mapper.Map<AnalysisSessionVm>(analysisSession);
        }
    }
}
