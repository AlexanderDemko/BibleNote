using System.Threading.Tasks;
using BibleNote.Providers.Html;
using BibleNote.Providers.Html.Contracts;
using BibleNote.Services.Contracts;
using BibleNote.Tests.TestsBase;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace BibleNote.Tests
{
    [TestClass]
    public class HtmlDocumentProviderTests : FileDocumentParserTestsBase
    {
        private const string TempFolderName = "HtmlDocumentProviderTests";

        [TestInitialize]
        public void Init()
        {
            base.Init(TempFolderName, services => services
                .AddTransient<IHtmlDocumentConnector, HtmlDocumentConnector>()
                .AddTransient<IDocumentProvider, HtmlProvider>());            
        }

        [TestCleanup]
        public override void Cleanup()
        {
            base.Cleanup();
        }

        [TestMethod]
        public Task CheckTitle()
        {
            return TestFileAsync(@"..\..\..\TestData\Html_CheckTitle.html", true, false,
                new string[] { "Ин 1:1" });            
        }

        [TestMethod]
        public Task CheckPage()
        {
            return TestFileAsync(@"..\..\..\TestData\Html_CheckPage.html",
                new string[] { "Ин 1:1" },
                new string[] { "Исх 12:27" },
                new string[] { "Ин 1:50-2:3" },
                new string[] { "Ин 3:16", "1Кор 5:7-9" },
                new string[] { "Ис 44" },
                new string[] { "Ис 44:24" },
                new string[] { "Евр 1:2", "Евр 1:10" },
                new string[] { "Ис 44:6" },                
                new string[] { "Ис 44:5" },
                new string[] { "Ис 44:6" });            
        }

        [TestMethod]
        public Task CheckFullPage()
        {
            return TestFileAsync(@"..\..\..\TestData\Html_CheckFullPage.html",
                new string[] { "Ин 1:1" },
                new string[] { "Исх 12:27" },
                new string[] { "Ин 1:50-2:3" },
                new string[] { "Ин 3:16", "1Кор 5:7-9" },
                new string[] { "Ис 44" },
                new string[] { "Ис 44:24" },
                new string[] { "Евр 1:2", "Евр 1:10" },
                new string[] { "Ис 44:6" },
                new string[] { "Ин 1:17" },
                new string[] { "Ис 44:5" },
                new string[] { "Ис 44:6" });
        }

        [TestMethod]
        public Task CheckTable()
        {
            return TestFileAsync(@"..\..\..\TestData\Html_CheckTable.html", 
                new string[] { "Ин 1" },
                new string[] { "Ин 2" },
                new string[] { "Ин 1:3" },
                new string[] { "Ин 2:4" },
                new string[] { "Ин 1:1" },
                new string[] { "Ин 2:2" });
        }
    }
}
