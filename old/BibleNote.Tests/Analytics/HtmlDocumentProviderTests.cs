using System.Linq;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using BibleNote.Analytics.Services.Unity;
using Microsoft.Practices.Unity;
using FluentAssertions;
using BibleNote.Analytics.Contracts.Providers;
using BibleNote.Analytics.Providers.Html;
using BibleNote.Analytics.Providers.FileSystem.Navigation;
using BibleNote.Tests.Analytics.TestsBase;
using BibleNote.Analytics.Services.VerseProcessing;

namespace BibleNote.Tests.Analytics
{
    [TestClass]
    public class HtmlDocumentProviderTests : DocumentParserTestsBase
    {
        private IDocumentProvider _documentProvider;        

        [TestInitialize]
        public override void Init()
        {
            base.Init();

            DIContainer.Container.RegisterType<IHtmlDocumentConnector, HtmlDocumentConnector>();
            DIContainer.Container.RegisterType<IDocumentProvider, HtmlProvider>();
            
            _documentProvider = DIContainer.Resolve<IDocumentProvider>();            
        }

        [TestCleanup]
        public void Done()
        {

        }        

        [TestMethod]
        public void ParseHtml_Test1()
        {
            var parseResult = _documentProvider.ParseDocument(new FileDocumentId(0, @"..\..\Analytics\TestData\Html_1.html", true));
            
            CheckParseResults(parseResult.GetAllParagraphParseResults().ToList(),
                new string[] { "Ин 1:1" },
                new string[] { "Исх 12:27" },
                new string[] { "1Кор 5:7-9" },
                new string[] { "Ис 44" },
                new string[] { "Ис 44:24" },
                new string[] { "Евр 1:2", "Евр 1:10" },
                new string[] { "Ис 44:6" },
                new string[] { "Ин 1:17" },
                new string[] { "Ис 44:5" },
                new string[] { "Ис 44:6" });

            parseResult.VersesCount.Should().Be(13);

            //var _analyticsContext = new BibleNote.Analytics.Data.AnalyticsContext();
            //var folder = _analyticsContext.DocumentFolders.Add(new BibleNote.Analytics.Data.Entities.DocumentFolder() { Name = "Temp", Path = "Test", NavigationProviderName = "Html" });
            //var document = _analyticsContext.Documents.Add(new BibleNote.Analytics.Data.Entities.Document() { Name = "Temp", Path = "Test", Folder = folder});
            //_analyticsContext.SaveChanges();
            //new SaveVerseEntriesProcessing(null).Process(document.DocumentId, parseResult);
        }

        [TestMethod]
        public void ParseHtml_Test2()
        {
            var parseResult = _documentProvider.ParseDocument(new FileDocumentId(0, @"..\..\Analytics\TestData\Html_2.html", true));

            CheckParseResults(parseResult.GetAllParagraphParseResults().ToList(),
                new string[] { "Ин 1" },
                new string[] { "Ин 2" },
                new string[] { "Ин 1:3" },
                new string[] { "Ин 2:4" },
                new string[] { "Ин 1:1" },
                new string[] { "Ин 2:2" });
        }
    }
}
