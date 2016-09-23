﻿using System.Linq;
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

namespace BibleNote.Tests.Analytics
{
    [TestClass]
    public class OneNoteDocumentProviderTests : TestsBase
    {
        private IDocumentProvider _documentProvider;
        private IVersePointerFactory _versePointerFactory;

        [TestInitialize]
        public override void Init()
        {
            base.Init();

            DIContainer.Container.RegisterType<IOneNoteDocumentConnector, MockOneNoteDocumentConnector>();
            DIContainer.Container.RegisterType<IDocumentProvider, OneNoteProvider>("OneNote");
            
            _documentProvider = DIContainer.Resolve<IDocumentProvider>("OneNote");
            _versePointerFactory = DIContainer.Resolve<IVersePointerFactory>();
        }

        [TestCleanup]
        public void Done()
        {

        }

        private void CheckParseResult(ParagraphParseResult parseResult, params string[] verses)
        {
            Assert.AreEqual(verses.Length, parseResult.VerseEntries.Count, "Verses length is not the same. Expected: {0}. Found: {1}", verses.Length, parseResult.VerseEntries.Count);
            var verseEntries = parseResult.VerseEntries.Select(ve => ve.VersePointer);
            foreach (var verse in verses)
                Assert.IsTrue(verseEntries.Contains(_versePointerFactory.CreateVersePointer(verse)), "Can not find the verse: '{0}'", verse);
        }

        [TestMethod]
        public void ParseOneNote_Test1()
        {
            var parseResult = _documentProvider.ParseDocument(new FileDocumentId(@"..\..\Analytics\TestData\OneNote_1.html", true));

            var results = parseResult.ParagraphParseResults;
            results.Count.Should().Be(10);
            CheckParseResult(results[0], "Ин 1:1");
            CheckParseResult(results[1], "Исх 12:27");
            CheckParseResult(results[2], "1Кор 5:7");
            CheckParseResult(results[3], "Ис 44");
            CheckParseResult(results[4], "Ис 44:24");
            CheckParseResult(results[5], "Евр 1:2", "Евр 1:10");
            CheckParseResult(results[6], "Ис 44:6");
            CheckParseResult(results[7], "Ин 1:17");
            CheckParseResult(results[8], "Ис 44:5");
            CheckParseResult(results[9], "Ис 44:6");
        }

        [TestMethod]
        public void ParseOneNote_Test2()
        {
            var parseResult = _documentProvider.ParseDocument(new FileDocumentId(@"..\..\Analytics\TestData\OneNote_2.html", true));

            var results = parseResult.ParagraphParseResults;
            results.Count.Should().Be(6);
            CheckParseResult(results[0], "Ин 1");
            CheckParseResult(results[1], "Ин 1:5");
            CheckParseResult(results[2], "Ин 1:6");
            CheckParseResult(results[3], "Ин 1:7");
            CheckParseResult(results[4], "Ин 1:8");
            CheckParseResult(results[5], "Ин 1:9");
        }
    }
}