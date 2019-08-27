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
using System.Diagnostics;
using System;
using BibleNote.Analytics.Domain.Entities;

namespace BibleNote.Tests.Analytics
{
    [TestClass]
    public class OneNoteDocumentProviderTests : DbTestsBase
    {
        private IDocumentProvider documentProvider;
        private IOrderedEnumerable<IDocumentParseResultProcessing> documentParseResultProcessings;
        private Document document;

        [TestInitialize]
        public void Init()
        {
            base.Init(services => services
                .AddScoped<IOneNoteDocumentConnector, OneNoteDocumentConnector>()
                .AddScoped<IDocumentProvider, OneNoteProvider>());

            this.documentProvider = ServiceProvider.GetService<IDocumentProvider>();
            this.documentParseResultProcessings = ServiceProvider.GetServices<IDocumentParseResultProcessing>()
                .OrderBy(rp => rp.Order);

            this.document = this.AnalyticsContext.DocumentRepository.FirstOrDefault();
            if (this.document == null)
            {
                var folder = new DocumentFolder() { Name = "Temp", Path = "Test", NavigationProviderName = "Html" };
                this.document = new Document() { Name = "Temp", Path = "Test", Folder = folder };
                this.AnalyticsContext.DocumentRepository.ToTrackingRepository().Add(document);
                this.AnalyticsContext.SaveChanges();
            }
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
                    var parseResult = documentProvider.ParseDocument(documentId);

                    var sw = new Stopwatch();
                    sw.Start();

                    this.documentParseResultProcessings.First().Process(this.document.Id, parseResult);

                    sw.Stop();

                    sw.Restart();

                    this.documentParseResultProcessings.Skip(1).First().Process(this.document.Id, parseResult);
                    
                    sw.Stop();
                    throw new Exception($"Total: {sw.Elapsed.TotalSeconds}");
                }
            }
        }
    }
}
