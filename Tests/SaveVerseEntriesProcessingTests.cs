using BibleNote.Analytics.Domain.Entities;
using BibleNote.Analytics.Providers.FileSystem.DocumentId;
using BibleNote.Analytics.Providers.Html;
using BibleNote.Analytics.Providers.Html.Contracts;
using BibleNote.Analytics.Services.DocumentProvider.Contracts;
using BibleNote.Analytics.Services.VerseProcessing.Contracts;
using BibleNote.Tests.Analytics.TestsBase;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using System.Linq;
using System.Threading.Tasks;

namespace BibleNote.Tests.Analytics
{
    [TestClass]
    public class SaveVerseEntriesProcessingTests : DbTestsBase
    {
        private IDocumentProvider documentProvider;
        private IDocumentParseResultProcessing documentParseResultProcessing;
        private Document document;

        [TestInitialize]
        public async Task Init()
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
                this.AnalyticsContext.DocumentRepository.Add(document);
                await this.AnalyticsContext.SaveChangesAsync();
            }
        }

        [TestCleanup]
        public override void Cleanup()
        {
            base.Cleanup();
        }

        [TestMethod]
        public void Test1()
        {
            var parseResult = this.documentProvider.ParseDocument(new FileDocumentId(0, @"..\..\..\TestData\Html_CheckFullPage.html", true));
            this.documentParseResultProcessing.Process(this.document.Id, parseResult);

            this.AnalyticsContext.VerseEntryRepository
                .Where(v => v.DocumentParagraph.DocumentId == this.document.Id)
                .Count()
                .Should()
                .Be(19);

            this.AnalyticsContext.DocumentParagraphRepository
                .Where(p => p.DocumentId == this.document.Id)
                .Count()
                .Should()
                .Be(11);
        }
    }
}
