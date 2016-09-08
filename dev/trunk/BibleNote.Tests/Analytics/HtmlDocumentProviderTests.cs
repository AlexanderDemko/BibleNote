using System.Linq;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using BibleNote.Analytics.Services.Unity;
using BibleNote.Analytics.Contracts.Environment;
using Microsoft.Practices.Unity;
using BibleNote.Tests.Analytics.Mocks;
using FluentAssertions;
using BibleNote.Analytics.Providers.HtmlProvider;
using BibleNote.Analytics.Contracts.Providers;
using BibleNote.Analytics.Providers.FileNavigationProvider;

namespace BibleNote.Tests.Analytics
{
    [TestClass]
    public class HtmlDocumentProviderTests
    {
        private IDocumentProvider _documentProvider;        

        [TestInitialize]
        public void Init()
        {
            DIContainer.InitWithDefaults();
            DIContainer.Container.RegisterInstance<IConfigurationManager>(new MockConfigurationManager());
            DIContainer.Container.RegisterType<IHtmlDocumentReader, HtmlDocumentReader>();
            DIContainer.Container.RegisterType<IDocumentProvider, HtmlProvider>("Html");
            
            _documentProvider = DIContainer.Resolve<IDocumentProvider>("Html");
        }

        [TestCleanup]
        public void Done()
        {

        }

        //todo: [TestMethod]
        public void ParseLocalHtmlFile()
        {
            var parseResult = _documentProvider.ParseDocument(new FileDocumentId(@"..\..\Analytics\TestData\HtmlDoc.html"));

            parseResult.ParagraphParseResults.Count().Should().Be(2);            
        }
    }
}
