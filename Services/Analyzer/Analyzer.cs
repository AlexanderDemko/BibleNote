using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using BibleNote.Domain.Contracts;
using BibleNote.Domain.Entities;
using BibleNote.Domain.Enums;
using BibleNote.Services.Analyzer.Models;
using BibleNote.Services.Contracts;
using BibleNote.Services.VerseParsing.Models.ParseResult;
using BibleNote.Services.VerseProcessing.Contracts;
using Microsoft.Extensions.DependencyInjection;

namespace BibleNote.Services.Analyzer
{
    class Analyzer : IAnalyzer
    {
        readonly IOrderedEnumerable<IDocumentParseResultProcessing> documentParseResultProcessings;
        private readonly ITrackingDbContext dbContext;
        private readonly IAnalysisSessionsService analysisSessionsService;

        public Analyzer(
            ITrackingDbContext dbContext, 
            IAnalysisSessionsService analysisSessionsService,
            IEnumerable<IDocumentParseResultProcessing> documentParseResultProcessings)
        {
            this.dbContext = dbContext;
            this.analysisSessionsService = analysisSessionsService;
            this.documentParseResultProcessings = documentParseResultProcessings.OrderBy(rp => rp.Order);
        }

        public async Task<AnalysisSession> AnalyzeAsync<T>(
            INavigationProvider<T> navigationProvider,
            AnalyzerOptions options,
            Action<T, DocumentParseResult> documentProcessedHandler = null,
            CancellationToken cancellationToken = default)
            where T : IDocumentId
        {
            var analysisSession = await this.analysisSessionsService.GetActualSession(navigationProvider.Id, cancellationToken);
            analysisSession.StartTime = DateTime.Now;
            analysisSession.GetDocumentsInfoTime = DateTime.Now;
            analysisSession.Status = AnalysisSessionStatus.InProgress;
            await this.dbContext.SaveChangesAsync(cancellationToken);

            var documents = await navigationProvider.LoadDocuments(
                analysisSession,
                newOnly: options.Depth == AnalyzeDepth.NewOnly,
                updateDb: true,
                cancellationToken);

            var wasError = false;
            foreach (var document in documents)
            {
                try
                {
                    var provider = navigationProvider.GetProvider(document);

                    if (provider.IsReadonly)
                        document.SetReadonly();     // todo: вроде как это лишнее, потому что FileNavigationProvider.IsReadonly должен быть true в таком случае

                    var parseResult = await provider.ParseDocumentAsync(document);

                    foreach (var processor in documentParseResultProcessings)
                    {
                        await processor.ProcessAsync(document.DocumentId, parseResult, cancellationToken);
                    }

                    documentProcessedHandler?.Invoke(document, parseResult);
                }
                catch (Exception ex)
                {
                    wasError = true;
                    // todo: куда сохранить ошибку?
                }
            }

            analysisSession.FinishTime = DateTime.Now;
            analysisSession.Status = wasError ? AnalysisSessionStatus.CompletedWithErrors : AnalysisSessionStatus.Completed;
            await dbContext.SaveChangesAsync(cancellationToken);

            return analysisSession;
        }
    }
}
