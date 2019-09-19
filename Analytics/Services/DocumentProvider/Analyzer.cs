using BibleNote.Analytics.Services.DocumentProvider.Contracts;
using BibleNote.Analytics.Services.DocumentProvider.Models;
using BibleNote.Analytics.Services.VerseProcessing.Contracts;
using Microsoft.Extensions.DependencyInjection;
using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Services.DocumentProvider
{
    class Analyzer : IAnalyzer
    {
        readonly IOrderedEnumerable<IDocumentParseResultProcessing> documentParseResultProcessing;

        INavigationProvider<IDocumentId> navigationProvider;
        AnalyzerOptions options;

        public Analyzer(IServiceProvider ServiceProvider)
        {
            this.documentParseResultProcessing = ServiceProvider
                .GetServices<IDocumentParseResultProcessing>()
                .OrderBy(rp => rp.Order);
        }

        public async Task Analyze(
            INavigationProvider<IDocumentId> navigationProvider, 
            AnalyzerOptions options, 
            CancellationToken cancellationToken = default)
        {
            this.navigationProvider = navigationProvider;
            this.options = options;

            var documents = await navigationProvider.GetDocuments(options.Depth == AnalyzeDepth.NewOnly, cancellationToken);

            foreach (var document in documents)
            {
                var provider = this.navigationProvider.GetProvider(document);
                var parseResult = provider.ParseDocument(document);

                foreach (var processor in this.documentParseResultProcessing)
                {
                    await processor.Process(document.DocumentId, parseResult);
                }
            }
        }        
    }
}
