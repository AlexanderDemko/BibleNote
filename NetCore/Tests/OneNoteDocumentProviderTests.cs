using System.Linq;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using BibleNote.Analytics.Providers.FileSystem.Navigation;
using BibleNote.Analytics.Providers.OneNote.Services;
using BibleNote.Analytics.Providers.OneNote.Contracts;
using BibleNote.Tests.Analytics.Mocks;
using BibleNote.Tests.Analytics.TestsBase;
using BibleNote.Analytics.Providers.OneNote.Navigation;
using BibleNote.Analytics.Services.DocumentProvider.Contracts;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.DependencyInjection;

namespace BibleNote.Tests.Analytics
{
    [TestClass]
    public class OneNoteDocumentProviderTests : DocumentParserTestsBase
    {
        private IDocumentProvider _documentProvider;

        [TestInitialize]
        public void Init()
        {
            base.Init(services => services
                .AddScoped<IOneNoteDocumentConnector, OneNoteDocumentConnector>()
                .AddScoped<IDocumentProvider, OneNoteProvider>());

            _documentProvider = ServiceProvider.GetService<IDocumentProvider>();
        }

        [TestCleanup]
        public void Done()
        {

        }

        //[TestMethod]
        [TestCategory("IgnoreOnCI")]
        public void ParseOneNote_TestCurrentPage()
        {   
            var log = ServiceProvider.GetService<ILogger>();

            using (var oneNoteApp = new OneNoteAppWrapper(log))
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
