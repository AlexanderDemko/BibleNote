﻿using System.Linq;
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
        private IDocumentParseContextEditor _documentParseContext;

        [TestInitialize]
        public override void Init()
        {
            base.Init();

            _documentProvider = new MockDocumentProviderInfo() { IsReadonly = true };
            _documentParserFactory = DIContainer.Resolve<IDocumentParserFactory>();
            _versePointerFactory = DIContainer.Resolve<IVersePointerFactory>();

            _documentParseContext = new DocumentParseContext();
            DIContainer.Container.RegisterInstance(_documentParseContext);
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

        private void CheckParseResult(ParagraphParseResult parseResult, params string[] expectedVerses)
        {
            Assert.AreEqual(expectedVerses.Length, parseResult.VerseEntries.Count, "Verses length is not the same. Expected: {0}. Found: {1}", expectedVerses.Length, parseResult.VerseEntries.Count);
            var verseEntries = parseResult.VerseEntries.Select(ve => ve.VersePointer);
            foreach (var verse in expectedVerses)
                Assert.IsTrue(verseEntries.Contains(_versePointerFactory.CreateVersePointer(verse)), "Can not find the verse: '{0}'", verse);
        }

        private void CheckParseResults(IDocumentParser docParser, params string[][] expectedResults)
        {
            var results = docParser.DocumentParseResult.ParagraphParseResults;
            results.Count.Should().Be(expectedResults.Length);
            for (var i = 0; i < expectedResults.Length; i++)                        
            {
                CheckParseResult(results[i], expectedResults[i]);
            }
        }

        [TestMethod]
        public void DocParser_Test1()
        {
            var node = GetNode("<div>Это <p>тестовая <font>Мк 5:</font>6-7!!</p> строка</div>");
            using (var docParser = _documentParserFactory.Create(_documentProvider))
            {
                docParser.ParseParagraph(node);
                CheckParseResults(docParser, new string[] { "Мк 5:6-7" });
            }
        }

        [TestMethod]
        public void DocParser_Test2()
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

                CheckParseResults(docParser, 
                    new string[] { "Мк 5:6" },
                    new string[] { "Ин 1:1" },
                    new string[] { "Мк 5:12" });
            }
        }

        [TestMethod]
        public void DocParser_Test3()
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

                CheckParseResults(docParser,
                    new string[] { "Мк 5:6" },
                    new string[] { "Ин 1:1" },
                    new string[] { "Мк 5:12" });
            }
        }

        [TestMethod]
        public void DocParser_Test4()
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

                CheckParseResults(docParser,
                    new string[] { "Мк 5:6" },
                    new string[] { "Ин 1:1" },
                    new string[] { "Ин 1:12" },
                    new string[] { "Мк 5:12" },
                    new string[] { "Ин 1:1" },
                    new string[] { "Ин 1:12" },
                    new string[] { "Мк 5:12" },
                    new string[] { "Мк 5:12" });
            }
        }

        [TestMethod]
        public void DocParser_Test5()
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

                CheckParseResults(docParser,
                    new string[] { "Ин 1:1" },
                    new string[] { "Мк 5:6" },
                    new string[] { "Мк 5:12" },
                    new string[] { "Ин 1:12" },
                    new string[] { "Ин 1:12" });
            }
        }

        [TestMethod]
        public void DocParser_Test6()
        {
            var emptyNode = GetNode("Пустая строка");
            var node1 = GetNode("Ин 1:1");
            var node2 = GetNode("Мк 5:6");
            var verseNode = GetNode(":12");

            using (var docParser = _documentParserFactory.Create(_documentProvider))
            {
                _documentParseContext.SetTitleVerse(new ChapterEntryInfo(_versePointerFactory.CreateVersePointer("Лк 3").ToChapterPointer()) { AtStartOfParagraph = true });

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

                CheckParseResults(docParser,
                    new string[] { "Ин 1:1" },
                    new string[] { "Ин 1:12" },
                    new string[] { "Мк 5:6" },
                    new string[] { "Ин 1:12" },
                    new string[] { "Лк 3:12" },
                    new string[] { "Лк 3:12" });
            }
        }

        [TestMethod]
        public void DocParser_Test7()
        {
            var node = GetNode("Ин 1:1");
            var verseNode = GetNode(":12");

            using (var docParser = _documentParserFactory.Create(_documentProvider))
            {
                using (docParser.ParseHierarchyElement(ParagraphState.Title))
                {
                    docParser.ParseParagraph(node);
                }

                using (docParser.ParseHierarchyElement(ParagraphState.Block))
                {
                    docParser.ParseParagraph(verseNode);
                }

                CheckParseResults(docParser,
                    new string[] { "Ин 1:1" },
                    new string[] { "Ин 1:12" });
            }
        }

        [TestMethod]
        public void DocParser_Test8()
        {
            var emptyNode = GetNode("Пустая строка");
            var node1 = GetNode("Мф 1:1 - стих в начале");
            var node2 = GetNode("Стих не в начале - Мк 2:2");
            var node3 = GetNode("Лк 3-4 - несколько глав в начале");
            var node4 = GetNode("Несколько глав не в начале - Ин 5-6");            
            var verseNode = GetNode(":12");

            using (var docParser = _documentParserFactory.Create(_documentProvider))
            {
                using (docParser.ParseHierarchyElement(ParagraphState.Block))
                {
                    docParser.ParseParagraph(node1);
                    docParser.ParseParagraph(node2);
                    docParser.ParseParagraph(emptyNode);
                    docParser.ParseParagraph(verseNode);
                }

                using (docParser.ParseHierarchyElement(ParagraphState.Block))
                {
                    docParser.ParseParagraph(node1);                    
                    docParser.ParseParagraph(node3);                    
                    docParser.ParseParagraph(verseNode);
                }

                using (docParser.ParseHierarchyElement(ParagraphState.Block))
                {
                    docParser.ParseParagraph(node1);
                    docParser.ParseParagraph(node4);
                    docParser.ParseParagraph(verseNode);
                }

                CheckParseResults(docParser,
                    new string[] { "Мф 1:1" },
                    new string[] { "Мк 2:2" },
                    new string[] { "Мф 1:12" },
                    new string[] { "Мф 1:1" },
                    new string[] { "Лк 3-4" },
                    new string[] { "Мф 1:1" },
                    new string[] { "Ин 5-6" },
                    new string[] { "Мф 1:12" });
            }
        }

        [TestMethod]
        public void DocParser_Test9()
        {
            var emptyNode = GetNode("Пустая строка");
            var node0 = GetNode("1Петр 3:3");
            var node1 = GetNode("Мф 1:1 - стих в начале");
            var node2 = GetNode("Стих не в начале - Мк 2:2");
            var node3 = GetNode("Лк 3-4 - несколько глав в начале");
            var node4 = GetNode("Несколько глав не в начале - Ин 5-6");
            var verseNode = GetNode(":12");

            using (var docParser = _documentParserFactory.Create(_documentProvider))
            {
                using (docParser.ParseHierarchyElement(ParagraphState.List))
                {
                    using (docParser.ParseHierarchyElement(ParagraphState.ListElement))
                    {
                        docParser.ParseParagraph(node0);
                        docParser.ParseParagraph(emptyNode);
                        docParser.ParseParagraph(verseNode);
                    }

                    using (docParser.ParseHierarchyElement(ParagraphState.ListElement))
                    {
                        docParser.ParseParagraph(node1);

                        using (docParser.ParseHierarchyElement(ParagraphState.List))
                        {
                            using (docParser.ParseHierarchyElement(ParagraphState.ListElement))
                            {
                                docParser.ParseParagraph(emptyNode);
                                docParser.ParseParagraph(verseNode);
                            }

                            using (docParser.ParseHierarchyElement(ParagraphState.ListElement))
                            {
                                docParser.ParseParagraph(node0);
                                docParser.ParseParagraph(verseNode);
                            }

                            using (docParser.ParseHierarchyElement(ParagraphState.ListElement))
                            {
                                docParser.ParseParagraph(node2);
                                docParser.ParseParagraph(verseNode);
                            }

                            using (docParser.ParseHierarchyElement(ParagraphState.ListElement))
                            {
                                docParser.ParseParagraph(node3);
                                docParser.ParseParagraph(verseNode);
                            }

                            using (docParser.ParseHierarchyElement(ParagraphState.ListElement))
                            {
                                docParser.ParseParagraph(node4);
                                docParser.ParseParagraph(verseNode);
                            }
                        }
                    }

                    using (docParser.ParseHierarchyElement(ParagraphState.ListElement))
                    {
                        docParser.ParseParagraph(node2);

                        using (docParser.ParseHierarchyElement(ParagraphState.List))
                        {
                            using (docParser.ParseHierarchyElement(ParagraphState.ListElement))
                            {                                
                                docParser.ParseParagraph(verseNode);
                            }
                        }
                    }

                    using (docParser.ParseHierarchyElement(ParagraphState.ListElement))
                    {
                        docParser.ParseParagraph(node3);

                        using (docParser.ParseHierarchyElement(ParagraphState.List))
                        {
                            using (docParser.ParseHierarchyElement(ParagraphState.ListElement))
                            {
                                docParser.ParseParagraph(verseNode);
                            }
                        }
                    }
                }

                CheckParseResults(docParser,
                    new string[] { "1Петр 3:3" },
                    new string[] { "1Петр 3:12" },
                    new string[] { "Мф 1:1" },
                    new string[] { "Мф 1:12" },
                    new string[] { "1Петр 3:3" },
                    new string[] { "1Петр 3:12" },
                    new string[] { "Мк 2:2" },
                    new string[] { "Мф 1:12" },
                    new string[] { "Лк 3-4" },
                    new string[] { "Мф 1:12" },
                    new string[] { "Ин 5-6" },
                    new string[] { "Мф 1:12" },
                    new string[] { "Мк 2:2" },
                    //new string[] { "Мк 2:12" }, ?????
                    new string[] { "Лк 3-4" });
            }
        }

        [TestMethod]
        public void DocParser_Test10()
        {
            var node = GetNode("Мф 1:1 и Мк 2:2");
            var verseNode = GetNode(":12");

            using (var docParser = _documentParserFactory.Create(_documentProvider))
            {
                docParser.ParseParagraph(node);
                docParser.ParseParagraph(verseNode);

                CheckParseResults(docParser,
                    new string[] { "Мф 1:1", "Мк 2:2" });
            }
        }

        [TestMethod]
        public void DocParser_Test11()
        {
            var node1 = GetNode("Мф 1:1 и 2:2");
            var node2 = GetNode("Мф 1:1 и :2");
            var verseNode = GetNode(":12");

            using (var docParser = _documentParserFactory.Create(_documentProvider))
            {
                using (docParser.ParseHierarchyElement(ParagraphState.Block))
                {

                    docParser.ParseParagraph(node1);
                    docParser.ParseParagraph(verseNode);
                }

                using (docParser.ParseHierarchyElement(ParagraphState.Block))
                {

                    docParser.ParseParagraph(node2);
                    docParser.ParseParagraph(verseNode);
                }

                CheckParseResults(docParser,
                    new string[] { "Мф 1:1", "Мф 2:2" },
                    new string[] { "Мф 1:1", "Мф 1:2" },
                    new string[] { "Мф 1:12" });
            }
        }
    }
}
