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
        public void ParseOneNote_1()
        {
            var parseResult = _documentProvider.ParseDocument(new FileDocumentId(@"..\..\Analytics\TestData\OneNote_Simple.html", true));

            var results = parseResult.ParagraphParseResults;
            results.Count.Should().Be(1);
            CheckParseResult(results[0], "Ин 1:1");        
        }
    }
}
