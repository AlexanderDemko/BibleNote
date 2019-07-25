using System.Linq;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using FluentAssertions;
using BibleNote.Analytics.Providers.Html;
using BibleNote.Analytics.Providers.FileSystem.Navigation;
using BibleNote.Tests.Analytics.TestsBase;
using BibleNote.Analytics.Services.DocumentProvider.Contracts;
using BibleNote.Analytics.Providers.Html.Contracts;
using Microsoft.Extensions.DependencyInjection;
using BibleNote.Analytics.Services.VerseProcessing.Contracts;
using BibleNote.Analytics.Data.Entities;

namespace BibleNote.Tests.Analytics
{
    [TestClass]
    public class SaveVerseEntriesProcessingTests : DbTestsBase
    {
        private IDocumentProvider documentProvider;
        private IDocumentParseResultProcessing documentParseResultProcessing;        
        private Document document;

        [TestInitialize]
        public void Init()
        {
            base.Init(services => services
                .AddScoped<IHtmlDocumentConnector, HtmlDocumentConnector>()
                .AddScoped<IDocumentProvider, HtmlProvider>());

            this.documentProvider = ServiceProvider.GetService<IDocumentProvider>();
            this.documentParseResultProcessing = ServiceProvider.GetServices<IDocumentParseResultProcessing>()
                .OrderBy(rp => rp.Order)
                .First();

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
        public override void Cleanup()
        {
            base.Cleanup();
        }                        

        [TestMethod]
        public void ParseHtml_Test1()
        {
            var parseResult = this.documentProvider.ParseDocument(new FileDocumentId(0, @"..\..\..\TestData\Html_1.html", false));
            this.documentParseResultProcessing.Process(this.document.DocumentId, parseResult);

            this.AnalyticsContext.VerseEntryRepository
                .Where(v => v.DocumentParagraph.DocumentId == this.document.DocumentId)
                .Count()
                .Should()
                .Be(66);

            this.AnalyticsContext.DocumentParagraphRepository
                .Where(p => p.DocumentId == this.document.DocumentId)
                .Count()
                .Should()
                .Be(11);

            он анализирует стихи внутри <a href= 'bnVerse:Исаия 44:6' >
        }        
    }
}
