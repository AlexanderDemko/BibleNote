using System.Linq;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using BibleNote.Analytics.Providers.OneNote.Services;
using BibleNote.Analytics.Providers.OneNote.Contracts;
using BibleNote.Tests.Analytics.TestsBase;
using BibleNote.Analytics.Providers.OneNote.Navigation;
using BibleNote.Analytics.Services.DocumentProvider.Contracts;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.DependencyInjection;
using BibleNote.Analytics.Services.VerseProcessing.Contracts;

namespace BibleNote.Tests.Analytics
{
    [TestClass]
    public class OneNoteDocumentProviderTests : DbTestsBase
    {
        private IDocumentProvider _documentProvider;
        private IDocumentParseResultProcessing documentParseResultProcessing;

        [TestInitialize]
        public void Init()
        {
            base.Init(services => services
                .AddScoped<IOneNoteDocumentConnector, OneNoteDocumentConnector>()
                .AddScoped<IDocumentProvider, OneNoteProvider>());

            _documentProvider = ServiceProvider.GetService<IDocumentProvider>();

            this.documentParseResultProcessing = ServiceProvider.GetServices<IDocumentParseResultProcessing>()
               .OrderBy(rp => rp.Order)
               .Skip(1)
               .First();
        }

        [TestCleanup]
        public void Done()
        {

        }

        [TestMethod]        
        public void TestCurrentPage()
        {   
            var log = ServiceProvider.GetService<ILogger<OneNoteDocumentProviderTests>>();

            using (var oneNoteApp = new OneNoteAppWrapper(log))
            {
                var currentPageId = oneNoteApp.GetCurrentPageId();

                if (!string.IsNullOrEmpty(currentPageId))
                {
                    var documentId = new OneNoteDocumentId(0, currentPageId);
                    var parseResult = _documentProvider.ParseDocument(documentId);
                    this.documentParseResultProcessing.Process(documentId.DocumentId, parseResult);
                }
            }
        }
    }
}
