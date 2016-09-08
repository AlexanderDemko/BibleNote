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

        private static HtmlNode GetNode(string html)
        {
            var htmlDoc = new HtmlDocument();
            htmlDoc.LoadHtml(html);
            return htmlDoc.DocumentNode;
        }

        [TestMethod]
        public void DocParser_TestScenario1()
        {
            var node = GetNode("<div>Это <p>тестовая <font>Мк 5:</font>6-7!!</p> строка</div>");
            using (var docParser = _documentParserFactory.Create(_documentProvider))
            {
                docParser.ParseParagraph(node);

                docParser.DocumentParseResult.ParagraphParseResults.Count().Should().Be(1);
                docParser.DocumentParseResult.ParagraphParseResults[0].VerseEntries.Count.Should().Be(1);
                docParser.DocumentParseResult.ParagraphParseResults[0].VerseEntries[0].VersePointer.Should().Be(_versePointerFactory.CreateVersePointer("Мк 5:6-7"));
            }
        }

        [TestMethod]
        public void DocParser_TestScenario2()
        {
            var node1 = GetNode("<div>Это <p>тестовая <font>Мк 5:</font>6-7!!</p> Мк 5:8,10-11 строка</div>");
            var node2 = GetNode("Ин 1:1");
            var node3 = GetNode(":12");

            var docParseContext = new DocumentParseContext();
            DIContainer.Container.RegisterInstance<IDocumentParseContextEditor>(docParseContext);

            using (var docParser = _documentParserFactory.Create(_documentProvider))
            {
                using (docParser.ParseHierarchyElement(node1, ParagraphState.List))
                {
                    docParser.ParseParagraph(node1);

                    using (docParser.ParseHierarchyElement(node2, ParagraphState.ListElement))
                    {                        
                        docParser.ParseParagraph(node2);
                    }

                    using (docParser.ParseHierarchyElement(node3, ParagraphState.ListElement))
                    {
                        docParser.ParseParagraph(node3);
                    }
                }

                var results = docParser.DocumentParseResult.ParagraphParseResults;
                results.Count().Should().Be(3);
                results[0].VerseEntries.Count.Should().Be(3);
                results[1].VerseEntries.Count.Should().Be(1);
                results[2].VerseEntries.Count.Should().Be(1);
                results[2].VerseEntries[0].VersePointer.Should().Be(_versePointerFactory.CreateVersePointer("Мк 5:12"));
            }
        }
    }
}
