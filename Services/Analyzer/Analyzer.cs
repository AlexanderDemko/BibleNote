using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using BibleNote.Domain.Contracts;
using BibleNote.Domain.Entities;
using BibleNote.Services.Analyzer.Models;
using BibleNote.Services.Contracts;
using BibleNote.Services.VerseParsing.Models.ParseResult;
using BibleNote.Services.VerseProcessing.Contracts;
using Microsoft.Extensions.DependencyInjection;

namespace BibleNote.Services.Analyzer
{
    class Analyzer : IAnalyzer
    {
        readonly IOrderedEnumerable<IDocumentParseResultProcessing> documentParseResultProcessing;
        private readonly ITrackingDbContext dbContext;

        public Analyzer(IServiceProvider serviceProvider, ITrackingDbContext dbContext)
        {
            this.dbContext = dbContext;
            documentParseResultProcessing = serviceProvider
                .GetServices<IDocumentParseResultProcessing>()
                .OrderBy(rp => rp.Order);
        }

        public async Task<AnalysisSession> AnalyzeAsync<T>(
            INavigationProvider<T> navigationProvider,
            AnalyzerOptions options,
            Action<T, DocumentParseResult> documentProcessedHandler = null,
            CancellationToken cancellationToken = default)
            where T : IDocumentId
        {
            var analysisSession = new AnalysisSession()
            {
                StartTime = DateTime.Now,
                NavigationProviderId = navigationProvider.Id
            };

            dbContext.AnalysisSessions.Add(analysisSession);
            await dbContext.SaveChangesAsync(cancellationToken);

            var documents = await navigationProvider.LoadDocuments(
                analysisSession,
                newOnly: options.Depth == AnalyzeDepth.NewOnly,
                updateDb: true,
                cancellationToken);

            foreach (var document in documents)
            {
                var provider = navigationProvider.GetProvider(document);

                if (provider.IsReadonly)
                    document.SetReadonly();     // todo: вроде как это лишнее, потому что FileNavigationProvider.IsReadonly должен быть true в таком случае

                var parseResult = await provider.ParseDocumentAsync(document);

                foreach (var processor in documentParseResultProcessing)
                {
                    await processor.ProcessAsync(document.DocumentId, parseResult, cancellationToken);
                }

                documentProcessedHandler?.Invoke(document, parseResult);
            }

            analysisSession.FinishTime = DateTime.Now;
            await dbContext.SaveChangesAsync(cancellationToken);

            return analysisSession;
        }
    }
}
