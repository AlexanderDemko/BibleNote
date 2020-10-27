using System.Linq;
using System.Threading.Tasks;
using BibleNote.Domain.Entities;
using BibleNote.Providers.FileSystem.DocumentId;
using BibleNote.Providers.Html;
using BibleNote.Providers.Html.Contracts;
using BibleNote.Services.DocumentProvider.Contracts;
using BibleNote.Services.VerseProcessing.Contracts;
using BibleNote.Tests.TestsBase;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace BibleNote.Tests
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
        public async Task Test1()
        {
            var parseResult = await this.documentProvider.ParseDocumentAsync(new FileDocumentId(0, @"..\..\..\TestData\Html_CheckFullPage.html", true));
            await this.documentParseResultProcessing.ProcessAsync(this.document.Id, parseResult);

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
