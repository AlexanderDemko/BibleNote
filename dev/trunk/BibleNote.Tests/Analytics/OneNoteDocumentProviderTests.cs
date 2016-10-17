using System.Linq;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using BibleNote.Analytics.Services.Unity;
using Microsoft.Practices.Unity;
using FluentAssertions;
using BibleNote.Analytics.Contracts.Providers;
using BibleNote.Analytics.Models.VerseParsing;
using BibleNote.Analytics.Contracts.VerseParsing;
using BibleNote.Analytics.Providers.FileSystem.Navigation;
using BibleNote.Analytics.Providers.OneNote.Services;
using BibleNote.Analytics.Providers.OneNote.Contracts;
using BibleNote.Tests.Analytics.Mocks;
using BibleNote.Tests.Analytics.TestsBase;
using BibleNote.Analytics.Providers.OneNote.Navigation;
using System.IO;
using BibleNote.Analytics.Core.Helpers;
using Newtonsoft.Json;

namespace BibleNote.Tests.Analytics
{
    [TestClass]
    public class OneNoteDocumentProviderTests : DocumentParserTestsBase
    {
        private IDocumentProvider _documentProvider;

        [TestInitialize]
        public override void Init()
        {
            base.Init();

            DIContainer.Container.RegisterType<IOneNoteDocumentConnector, MockOneNoteDocumentConnector>();
            DIContainer.Container.RegisterType<IDocumentProvider, OneNoteProvider>();

            _documentProvider = DIContainer.Resolve<IDocumentProvider>();
        }

        [TestCleanup]
        public void Done()
        {

        }

        [TestMethod]
        public void ParseOneNote_Test1()
        {
            var parseResult = _documentProvider.ParseDocument(new FileDocumentId(0, @"..\..\Analytics\TestData\OneNote_1.html", true));
            //var s = JsonConvert.SerializeObject(parseResult.RootHierarchyResult); 

            CheckParseResults(parseResult.GetAllParagraphParseResults().ToList(),
                new string[] { "Ин 1:1" },
                new string[] { "Исх 12:27" },
                new string[] { "1Кор 5:7" },
                new string[] { "Ис 44" },
                new string[] { "Ис 44:24" },
                new string[] { "Евр 1:2", "Евр 1:10" },
                new string[] { "Ис 44:6" },
                new string[] { "Ин 1:17" },
                new string[] { "Ис 44:5" },
                new string[] { "Ис 44:6" });
        }

        [TestMethod]
        public void ParseOneNote_Test2()
        {
            var parseResult = _documentProvider.ParseDocument(new FileDocumentId(0, @"..\..\Analytics\TestData\OneNote_2.html", true));

            CheckParseResults(parseResult.GetAllParagraphParseResults().ToList(),
               new string[] { "Ин 1" },
               new string[] { "Ин 1:5" },
               new string[] { "Мк 2:5" },
               new string[] { "Ин 1:6" },
               new string[] { "Ин 1:7" },
               new string[] { "Ин 1:8" },
               new string[] { "Ин 1:9" });
        }

        [TestMethod]
        public void ParseOneNote_Test3()
        {
            var parseResult = _documentProvider.ParseDocument(new FileDocumentId(0, @"..\..\Analytics\TestData\OneNote_3.html", true));

            CheckParseResults(parseResult.GetAllParagraphParseResults().ToList(),
               new string[] { "1Пет 3:3" },
               new string[] { "1Пет 3:9" },
               new string[] { "Мф 1:1" },
               new string[] { "Мф 1:10" },
               new string[] { "1Пет 4:5" },
               new string[] { "1Пет 4:11" },
               new string[] { "Мк 2:2" },
               new string[] { "1Пет 4:12" },
               new string[] { "Лк 3-4" },
               new string[] { "Ин 5-6" },
               new string[] { "Мк 3:3" },
               new string[] { "Лк 3-4" });
        }

        //[TestMethod]
        [TestCategory("IgnoreOnCI")]
        public void ParseOneNote_TestCurrentPage()
        {
            DIContainer.Container.RegisterType<IOneNoteDocumentConnector, OneNoteDocumentConnector>();            
            _documentProvider = DIContainer.Resolve<IDocumentProvider>();

            using (var oneNoteApp = new OneNoteAppWrapper())
            {
                var currentPageId = oneNoteApp.GetCurrentPageId();

                if (!string.IsNullOrEmpty(currentPageId))
                {
                    var parseResult = _documentProvider.ParseDocument(new OneNoteDocumentId(0, currentPageId));
                    var i = parseResult.GetAllParagraphParseResults().Count();
                }
            }
        }
    }
}
