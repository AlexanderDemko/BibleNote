using BibleNote.Analytics.Services.DocumentProvider.Contracts;
using BibleNote.Analytics.Services.DocumentProvider.Models;
using BibleNote.Analytics.Services.VerseProcessing.Contracts;
using Microsoft.Extensions.DependencyInjection;
using System.Linq;

namespace BibleNote.Analytics.Services.DocumentProvider
{
    class Analyzer : IAnalyzer
    {
        readonly IOrderedEnumerable<IDocumentParseResultProcessing> documentParseResultProcessing;

        INavigationProvider<IDocumentId> navigationProvider;
        AnalyzerOptions options;

        public Analyzer(ServiceProvider ServiceProvider)
        {
            this.documentParseResultProcessing = ServiceProvider
                .GetServices<IDocumentParseResultProcessing>()
                .OrderBy(rp => rp.Order);
        }

        public void Analyze(INavigationProvider<IDocumentId> navigationProvider, AnalyzerOptions options)
        {
            this.navigationProvider = navigationProvider;
            this.options = options;

            var documents = navigationProvider.GetDocuments(options.Depth == AnalyzeDepth.NewOnly);

            foreach (var document in documents)
            {
                var provider = this.navigationProvider.GetProvider(document);
                var parseResult = provider.ParseDocument(document);

                foreach (var processor in this.documentParseResultProcessing)
                {
                    processor.Process(document.DocumentId, parseResult);
                }
            }
        }
    }
}
