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
using BibleNote.Analytics.Services.VerseParsing.ParseContext;
using BibleNote.Analytics.Contracts.VerseParsing.ParseContext;

namespace BibleNote.Tests.Analytics
{
    [TestClass]
    public class DocumentParserTests : TestsBase
    {
        private IDocumentProviderInfo _documentProvider;
        private IDocumentParserFactory _documentParserFactory;
        private IVersePointerFactory _versePointerFactory;
        private DocumentParseContext _documentParseContext;

        [TestInitialize]
        public override void Init()
        {
            base.Init();

            _documentProvider = new MockDocumentProviderInfo() { IsReadonly = true };
            _documentParserFactory = DIContainer.Resolve<IDocumentParserFactory>();
            _versePointerFactory = DIContainer.Resolve<IVersePointerFactory>();

            _documentParseContext = new DocumentParseContext();
            DIContainer.Container.RegisterInstance<IDocumentParseContextEditor>(_documentParseContext);
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

        private void CheckParseResult(ParagraphParseResult parseResult, params string[] verses)
        {
            Assert.AreEqual(verses.Length, parseResult.VerseEntries.Count, "Verses length is not the same. Expected: {0}. Found: {1}", verses.Length, parseResult.VerseEntries.Count);
            var verseEntries = parseResult.VerseEntries.Select(ve => ve.VersePointer);
            foreach (var verse in verses)
                Assert.IsTrue(verseEntries.Contains(_versePointerFactory.CreateVersePointer(verse)), "Can not find the verse: '{0}'", verse);
        }

        [TestMethod]
        public void DocParser_TestScenario1()
        {
            var node = GetNode("<div>Это <p>тестовая <font>Мк 5:</font>6-7!!</p> строка</div>");
            using (var docParser = _documentParserFactory.Create(_documentProvider))
            {
                docParser.ParseParagraph(node);

                var results = docParser.DocumentParseResult.ParagraphParseResults;
                results.Count.Should().Be(1);
                CheckParseResult(results[0], "Мк 5:6-7");                
            }
        }

        [TestMethod]
        public void DocParser_TestScenario2()
        {
            var node1 = GetNode("Мк 5:6");
            var node2 = GetNode("Ин 1:1");
            var verseNode = GetNode(":12");

            using (var docParser = _documentParserFactory.Create(_documentProvider))
            {
                using (docParser.ParseHierarchyElement(ParagraphState.List))
                {
                    docParser.ParseParagraph(node1);

                    using (docParser.ParseHierarchyElement(ParagraphState.ListElement))
                    {                        
                        docParser.ParseParagraph(node2);
                    }

                    using (docParser.ParseHierarchyElement(ParagraphState.ListElement))
                    {
                        docParser.ParseParagraph(verseNode);
                    }
                }

                var results = docParser.DocumentParseResult.ParagraphParseResults;
                results.Count.Should().Be(3);
                CheckParseResult(results[0], "Мк 5:6");
                CheckParseResult(results[1], "Ин 1:1");
                CheckParseResult(results[2], "Мк 5:12");                
            }
        }

        [TestMethod]
        public void DocParser_TestScenario3()
        {
            var emptyNode = GetNode("Пустая строка");
            var node2 = GetNode("Мк 5:6");
            var node3 = GetNode("Ин 1:1");
            var verseNode = GetNode(":12");

            using (var docParser = _documentParserFactory.Create(_documentProvider))
            {
                using (docParser.ParseHierarchyElement(ParagraphState.Table))
                {
                    using (docParser.ParseHierarchyElement(ParagraphState.TableRow))
                    {
                        using (docParser.ParseHierarchyElement(ParagraphState.TableCell))
                        {
                            docParser.ParseParagraph(emptyNode);
                        }

                        using (docParser.ParseHierarchyElement(ParagraphState.TableCell))
                        {
                            docParser.ParseParagraph(node2);
                        }
                    }

                    using (docParser.ParseHierarchyElement(ParagraphState.TableRow))
                    {
                        using (docParser.ParseHierarchyElement(ParagraphState.TableCell))
                        {
                            docParser.ParseParagraph(node3);
                        }

                        using (docParser.ParseHierarchyElement(ParagraphState.TableCell))
                        {
                            docParser.ParseParagraph(verseNode);
                        }
                    }
                }

                var results = docParser.DocumentParseResult.ParagraphParseResults;
                results.Count.Should().Be(3);
                CheckParseResult(results[0], "Мк 5:6");
                CheckParseResult(results[1], "Ин 1:1");
                CheckParseResult(results[2], "Мк 5:12");
            }
        }

        [TestMethod]
        public void DocParser_TestScenario4()
        {
            var emptyNode = GetNode("Пустая строка");
            var node1 = GetNode("Ин 1:1");
            var node2 = GetNode("Мк 5:6");            
            var verseNode = GetNode(":12");            

            using (var docParser = _documentParserFactory.Create(_documentProvider))
            {
                using (docParser.ParseHierarchyElement(ParagraphState.Table))
                {
                    using (docParser.ParseHierarchyElement(ParagraphState.TableRow))
                    {
                        using (docParser.ParseHierarchyElement(ParagraphState.TableCell))
                        {
                            docParser.ParseParagraph(emptyNode);
                        }

                        using (docParser.ParseHierarchyElement(ParagraphState.TableCell))
                        {
                            docParser.ParseParagraph(emptyNode);
                        }

                        using (docParser.ParseHierarchyElement(ParagraphState.TableCell))
                        {
                            docParser.ParseParagraph(node2);
                            docParser.ParseParagraph(verseNode);
                        }
                    }

                    using (docParser.ParseHierarchyElement(ParagraphState.TableRow))
                    {
                        using (docParser.ParseHierarchyElement(ParagraphState.TableCell))
                        {
                            docParser.ParseParagraph(node1);
                        }

                        using (docParser.ParseHierarchyElement(ParagraphState.TableCell))
                        {
                            docParser.ParseParagraph(verseNode);
                        }

                        using (docParser.ParseHierarchyElement(ParagraphState.TableCell))
                        {
                            docParser.ParseParagraph(verseNode);
                        }
                    }

                    using (docParser.ParseHierarchyElement(ParagraphState.TableRow))
                    {
                        using (docParser.ParseHierarchyElement(ParagraphState.TableCell))
                        {
                            docParser.ParseParagraph(emptyNode);
                        }

                        using (docParser.ParseHierarchyElement(ParagraphState.TableCell))
                        {
                            docParser.ParseParagraph(emptyNode);
                        }

                        using (docParser.ParseHierarchyElement(ParagraphState.TableCell))
                        {
                            using (docParser.ParseHierarchyElement(ParagraphState.List))
                            {
                                docParser.ParseParagraph(node1);

                                using (docParser.ParseHierarchyElement(ParagraphState.ListElement))
                                {
                                    docParser.ParseParagraph(verseNode);
                                }                                
                            }

                            docParser.ParseParagraph(verseNode);
                        }
                    }

                    using (docParser.ParseHierarchyElement(ParagraphState.TableRow))
                    {
                        using (docParser.ParseHierarchyElement(ParagraphState.TableCell))
                        {
                            docParser.ParseParagraph(emptyNode);
                        }

                        using (docParser.ParseHierarchyElement(ParagraphState.TableCell))
                        {
                            docParser.ParseParagraph(emptyNode);
                        }

                        using (docParser.ParseHierarchyElement(ParagraphState.TableCell))
                        {
                            using (docParser.ParseHierarchyElement(ParagraphState.List))
                            {
                                using (docParser.ParseHierarchyElement(ParagraphState.ListElement))
                                {
                                    docParser.ParseParagraph(verseNode);
                                }
                            }                            
                        }
                    }
                }

                docParser.ParseParagraph(verseNode);

                var results = docParser.DocumentParseResult.ParagraphParseResults;
                results.Count.Should().Be(8);
                CheckParseResult(results[0], "Мк 5:6");
                CheckParseResult(results[1], "Ин 1:1");
                CheckParseResult(results[2], "Ин 1:12");
                CheckParseResult(results[3], "Мк 5:12");
                CheckParseResult(results[4], "Ин 1:1");
                CheckParseResult(results[5], "Ин 1:12");
                CheckParseResult(results[6], "Мк 5:12");
                CheckParseResult(results[7], "Мк 5:12");
            }
        }

        [TestMethod]
        public void DocParser_TestScenario5()
        {
            var emptyNode = GetNode("Пустая строка");
            var node1 = GetNode("Ин 1:1");
            var node2 = GetNode("Мк 5:6");
            var verseNode = GetNode(":12");

            using (var docParser = _documentParserFactory.Create(_documentProvider))
            {
                using (docParser.ParseHierarchyElement(ParagraphState.List))
                {
                    docParser.ParseParagraph(node1);

                    using (docParser.ParseHierarchyElement(ParagraphState.ListElement))
                    {
                        using (docParser.ParseHierarchyElement(ParagraphState.Table))
                        {
                            using (docParser.ParseHierarchyElement(ParagraphState.TableRow))
                            {
                                using (docParser.ParseHierarchyElement(ParagraphState.TableCell))
                                {
                                    docParser.ParseParagraph(node2);
                                }

                                using (docParser.ParseHierarchyElement(ParagraphState.TableCell))
                                {
                                    docParser.ParseParagraph(verseNode);
                                }
                            }
                        }
                    }

                    using (docParser.ParseHierarchyElement(ParagraphState.ListElement))
                    {
                        using (docParser.ParseHierarchyElement(ParagraphState.Table))
                        {
                            using (docParser.ParseHierarchyElement(ParagraphState.TableRow))
                            {
                                using (docParser.ParseHierarchyElement(ParagraphState.TableCell))
                                {
                                    docParser.ParseParagraph(emptyNode);
                                }

                                using (docParser.ParseHierarchyElement(ParagraphState.TableCell))
                                {
                                    docParser.ParseParagraph(verseNode);
                                    docParser.ParseParagraph(verseNode);
                                }
                            }
                        }
                    }
                }

                var results = docParser.DocumentParseResult.ParagraphParseResults;
                results.Count.Should().Be(5);
                CheckParseResult(results[0], "Ин 1:1");
                CheckParseResult(results[1], "Мк 5:6");
                CheckParseResult(results[2], "Мк 5:12");                
                CheckParseResult(results[3], "Ин 1:12");
                CheckParseResult(results[4], "Ин 1:12");
            }
        }

        [TestMethod]
        public void DocParser_TestScenario6()
        {
            var emptyNode = GetNode("Пустая строка");
            var node1 = GetNode("Ин 1:1");
            var node2 = GetNode("Мк 5:6");            
            var verseNode = GetNode(":12");

            using (var docParser = _documentParserFactory.Create(_documentProvider))
            {
                _documentParseContext.SetTitleVerse(_versePointerFactory.CreateVersePointer("Лк 3").ToChapterPointer());

                using (docParser.ParseHierarchyElement(ParagraphState.Table))
                {
                    using (docParser.ParseHierarchyElement(ParagraphState.TableRow))
                    {
                        using (docParser.ParseHierarchyElement(ParagraphState.TableCell))
                        {
                            docParser.ParseParagraph(node1);
                        }

                        using (docParser.ParseHierarchyElement(ParagraphState.TableCell))
                        {
                            docParser.ParseParagraph(emptyNode);
                        }
                    }

                    using (docParser.ParseHierarchyElement(ParagraphState.TableRow))
                    {
                        using (docParser.ParseHierarchyElement(ParagraphState.TableCell))
                        {
                            docParser.ParseParagraph(verseNode);
                        }

                        using (docParser.ParseHierarchyElement(ParagraphState.TableCell))
                        {
                            docParser.ParseParagraph(node2);
                        }
                    }

                    using (docParser.ParseHierarchyElement(ParagraphState.TableRow))
                    {
                        using (docParser.ParseHierarchyElement(ParagraphState.TableCell))
                        {
                            docParser.ParseParagraph(verseNode);
                        }

                        using (docParser.ParseHierarchyElement(ParagraphState.TableCell))
                        {
                            docParser.ParseParagraph(verseNode);
                        }
                    }

                    using (docParser.ParseHierarchyElement(ParagraphState.TableRow))
                    {
                        using (docParser.ParseHierarchyElement(ParagraphState.TableCell))
                        {
                            docParser.ParseParagraph(emptyNode);
                        }

                        using (docParser.ParseHierarchyElement(ParagraphState.TableCell))
                        {
                            docParser.ParseParagraph(verseNode);
                        }
                    }
                }

                var results = docParser.DocumentParseResult.ParagraphParseResults;
                results.Count.Should().Be(6);
                CheckParseResult(results[0], "Ин 1:1");
                CheckParseResult(results[1], "Ин 1:12");
                CheckParseResult(results[2], "Мк 5:6");
                CheckParseResult(results[3], "Ин 1:12");
                CheckParseResult(results[4], "Лк 3:12");
                CheckParseResult(results[5], "Лк 3:12");
            }
        }
    }
}
