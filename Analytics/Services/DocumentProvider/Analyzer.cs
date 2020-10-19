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

        public Analyzer(IServiceProvider ServiceProvider)
        {
            this.documentParseResultProcessing = ServiceProvider
                .GetServices<IDocumentParseResultProcessing>()
                .OrderBy(rp => rp.Order);
        }

        public async Task Analyze<T>(
            INavigationProvider<T> navigationProvider,
            AnalyzerOptions options,
            CancellationToken cancellationToken = default)
            where T : IDocumentId
        {
            var documents = await navigationProvider.LoadDocuments(newOnly: options.Depth == AnalyzeDepth.NewOnly, updateDb: true, cancellationToken);

            foreach (var document in documents)
            {
                var provider = navigationProvider.GetProvider(document);

                if (provider.IsReadonly)
                    document.SetReadonly();     // todo: вроде как это лишнее, потому что FileNavigationProvider.IsReadonly должен быть true в таком случае

                var parseResult = provider.ParseDocument(document);

                foreach (var processor in this.documentParseResultProcessing)
                {
                    await processor.Process(document.DocumentId, parseResult);
                }
            }
        }
    }
}
