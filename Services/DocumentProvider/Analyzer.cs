using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using BibleNote.Domain.Contracts;
using BibleNote.Domain.Entities;
using BibleNote.Services.DocumentProvider.Contracts;
using BibleNote.Services.DocumentProvider.Models;
using BibleNote.Services.VerseProcessing.Contracts;
using Microsoft.Extensions.DependencyInjection;

namespace BibleNote.Services.DocumentProvider
{
    class Analyzer : IAnalyzer
    {
        readonly IOrderedEnumerable<IDocumentParseResultProcessing> documentParseResultProcessing;
        private readonly ITrackingDbContext dbContext;

        public Analyzer(IServiceProvider serviceProvider, ITrackingDbContext dbContext)
        {
            this.dbContext = dbContext;
            this.documentParseResultProcessing = serviceProvider
                .GetServices<IDocumentParseResultProcessing>()
                .OrderBy(rp => rp.Order);
        }

        public async Task<AnalysisSession> AnalyzeAsync<T>(
            INavigationProvider<T> navigationProvider,
            AnalyzerOptions options,
            CancellationToken cancellationToken = default)
            where T : IDocumentId
        {
            var analysisSession = new AnalysisSession()
            {
                StartTime = DateTime.Now,
                NavigationProviderId = navigationProvider.Id 
            };

            this.dbContext.AnalysisSessions.Add(analysisSession);
            await this.dbContext.SaveChangesAsync();

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

                foreach (var processor in this.documentParseResultProcessing)
                {
                    await processor.ProcessAsync(document.DocumentId, parseResult);
                }
            }

            return analysisSession;
        }
    }
}
