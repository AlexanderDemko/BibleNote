using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Threading.Tasks;
using BibleNote.Domain.Entities;
using BibleNote.Providers.OneNote.Contracts;
using BibleNote.Providers.OneNote.Services.DocumentProvider;
using BibleNote.Providers.OneNote.Services.NavigationProvider;
using BibleNote.Providers.OneNote.Services.NavigationProvider.Models;
using BibleNote.Services.DocumentProvider.Contracts;
using BibleNote.Services.DocumentProvider.Models;
using BibleNote.Services.VerseProcessing.Contracts;
using BibleNote.Tests.TestsBase;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace BibleNote.Tests
{
    [TestClass]
    public class OneNoteTests : DbTestsBase
    {
        private IDocumentProvider documentProvider;
        private IOneNoteAppWrapper oneNoteApp;
        private IAnalyzer analyzer;
        private IOrderedEnumerable<IDocumentParseResultProcessing> documentParseResultProcessings;
        private Document document;

        [TestInitialize]
        public async Task Init()
        {
            base.Init();

            this.documentProvider = ServiceProvider.GetService<OneNoteProvider>();
            this.oneNoteApp = ServiceProvider.GetService<IOneNoteAppWrapper>();
            this.analyzer = ServiceProvider.GetService<IAnalyzer>();
            this.documentParseResultProcessings = ServiceProvider.GetServices<IDocumentParseResultProcessing>()
                .OrderBy(rp => rp.Order);

            this.document = this.DbContext.DocumentRepository.FirstOrDefault();
            if (this.document == null)
            {
                var folder = new DocumentFolder() { Name = "Temp", Path = "Test", NavigationProviderId = 0 };
                this.document = new Document() { Name = "Temp", Path = "Test", Folder = folder };
                this.DbContext.DocumentRepository.Add(document);
                await this.DbContext.SaveChangesAsync();
            }
        }

        [TestCleanup]
        public void Done()
        {

        }

        [TestMethod]
        public async Task TestCurrentPage()
        {
            var log = ServiceProvider.GetService<ILogger<OneNoteTests>>();

            var currentPageId = await oneNoteApp.GetCurrentPageIdAsync();

            if (!string.IsNullOrEmpty(currentPageId))
            {
                var documentId = new OneNoteDocumentId(0, currentPageId);
                var parseResult = await documentProvider.ParseDocumentAsync(documentId);

                var sw = new Stopwatch();
                sw.Start();

                await this.documentParseResultProcessings.First().ProcessAsync(this.document.Id, parseResult);

                sw.Stop();

                sw.Restart();

                await this.documentParseResultProcessings.Skip(1).First().ProcessAsync(this.document.Id, parseResult);

                sw.Stop();
                //throw new Exception($"Total: {sw.Elapsed.TotalSeconds}");
            }
        }

        [TestMethod]
        public async Task TestAnalyzer()
        {
            var navigationProvider = ActivatorUtilities.CreateInstance<OneNoteNavigationProvider>(ServiceProvider);
            navigationProvider.Parameters.HierarchyItems = new List<OneNoteHierarchyInfo>() { new OneNoteHierarchyInfo() { Id = "", Type = OneNoteHierarchyType.Section, Name = "Test page" } };
            await this.analyzer.AnalyzeAsync(navigationProvider, new AnalyzerOptions()
            {
                Depth = AnalyzeDepth.All
            });
        }
    }
}
