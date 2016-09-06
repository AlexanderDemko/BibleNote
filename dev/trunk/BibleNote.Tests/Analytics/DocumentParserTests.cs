using System.Linq;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using BibleNote.Analytics.Services.Unity;
using BibleNote.Analytics.Models.Common;
using BibleNote.Analytics.Contracts.VerseParsing;
using BibleNote.Analytics.Contracts.Environment;
using Microsoft.Practices.Unity;
using HtmlAgilityPack;
using BibleNote.Analytics.Core.Helpers;
using BibleNote.Tests.Analytics.Mocks;
using System.IO;
using FluentAssertions;
using System;
using BibleNote.Analytics.Providers.HtmlProvider;
using BibleNote.Analytics.Contracts.Providers;
using BibleNote.Analytics.Providers.FileNavigationProvider;

namespace BibleNote.Tests.Analytics
{
    [TestClass]
    public class DocumentParserTests
    {
        private IDocumentProvider _documentProvider;        

        [TestInitialize]
        public void Init()
        {
            DIContainer.InitWithDefaults();
            DIContainer.Container.RegisterInstance<IConfigurationManager>(new MockConfigurationManager());

            _documentProvider = new HtmlProvider(DIContainer.Resolve<IDocumentParserFactory>());
        }

        [TestCleanup]
        public void Done()
        {

        }

        [TestMethod]
        public void ParseLocalHtmlFile()
        {
            var parseResult = _documentProvider.ParseDocument(new FileDocumentId(@"..\..\Analytics\TestData\HtmlDoc.html"));

            parseResult.ParagraphParseResults.Count().Should().Be(2);            
        }
    }
}
