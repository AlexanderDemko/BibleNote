using System.Linq;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using BibleNote.Analytics.Services.Unity;
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
using BibleNote.Analytics.Services.VerseParsing;
using BibleNote.Analytics.Models.VerseParsing;

namespace BibleNote.Tests.Analytics
{
    [TestClass]
    public class DocumentParserTests
    {
        private IDocumentProviderInfo _documentProvider;
        private IDocumentParserFactory _documentParserFactory;
        private IVersePointerFactory _versePointerFactory;

        [TestInitialize]
        public void Init()
        {
            DIContainer.InitWithDefaults();
            DIContainer.Container.RegisterInstance<IConfigurationManager>(new MockConfigurationManager());

            _documentProvider = new MockDocumentProviderInfo();
            _documentParserFactory = DIContainer.Resolve<IDocumentParserFactory>();
            _versePointerFactory = DIContainer.Resolve<IVersePointerFactory>();
        }

        [TestCleanup]
        public void Done()
        {

        }

        [TestMethod]
        public void DocParser_TestScenario1()
        {
            var htmlDoc = new HtmlDocument();
            htmlDoc.LoadHtml("<div>Это <p>тестовая <font>Мк 5:</font>6-7!!</p> строка</div>");

            using (var docParser = _documentParserFactory.Create(_documentProvider))
            {
                docParser.ParseParagraph(htmlDoc.DocumentNode);

                docParser.DocumentParseResult.ParagraphParseResults.Count().Should().Be(1);
                docParser.DocumentParseResult.ParagraphParseResults[0].VerseEntries.Count.Should().Be(1);
                docParser.DocumentParseResult.ParagraphParseResults[0].VerseEntries[0].VersePointer.Should().Be(_versePointerFactory.CreateVersePointer("Мк 5:6-7"));
            }
        }

        [TestMethod]
        public void DocParser_TestScenario2()
        {
            var htmlDoc1 = new HtmlDocument();
            htmlDoc1.LoadHtml("<div>Это <p>тестовая <font>Мк 5:</font>6-7!!</p> Мк 5:8,10-11 строка</div>");

            var htmlDoc2 = new HtmlDocument();
            htmlDoc2.LoadHtml(":12 - вот");

            using (var docParser = _documentParserFactory.Create(_documentProvider))
            {
                using (docParser.ParseHierarchyElement(htmlDoc1.DocumentNode, ParagraphState.List))
                {
                    docParser.ParseParagraph(htmlDoc1.DocumentNode);

                    using (docParser.ParseHierarchyElement(htmlDoc2.DocumentNode, ParagraphState.ListElement))
                    {
                        docParser.ParseParagraph(htmlDoc2.DocumentNode);
                    }
                }

                docParser.DocumentParseResult.ParagraphParseResults.Count().Should().Be(2);
                docParser.DocumentParseResult.ParagraphParseResults[0].VerseEntries.Count.Should().Be(3);
                docParser.DocumentParseResult.ParagraphParseResults[1].VerseEntries.Count.Should().Be(1);
                docParser.DocumentParseResult.ParagraphParseResults[1].VerseEntries[0].VersePointer.Should().Be(_versePointerFactory.CreateVersePointer("Мк 5:12"));
            }
        }
    }
}
