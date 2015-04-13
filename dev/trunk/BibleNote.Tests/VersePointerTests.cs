using System;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using BibleNote.Core.Common;
using BibleNote.Core.Services.System;
using BibleNote.Core.Contracts;

namespace BibleNote.Tests
{
    [TestClass]
    public class VersePointerTests
    {
        private IVersePointerFactory _verseParserService;

        [TestInitialize]
        public void Init()
        {
            DIContainer.InitWithDefaults();
            _verseParserService = DIContainer.Resolve<IVersePointerFactory>();
        }

        private void TestVerseParsing(string originalVerse, SimpleVersePointer expectedVerse)
        {
            var actualVerse = _verseParserService.CreateVersePointer(originalVerse);
            Assert.AreEqual(expectedVerse, actualVerse);
        }

        [TestMethod]
        public void TestParsing()
        {
            TestVerseParsing("2Петр 3", new SimpleVersePointer(61, new VerseNumber(3)));
            TestVerseParsing("2Петр 3:1", new SimpleVersePointer(61, new VerseNumber(3, 1)));
            TestVerseParsing("2Петр (3:1)", new SimpleVersePointer(61, new VerseNumber(3, 1)));
            TestVerseParsing("2Петр ( 3:1)", new SimpleVersePointer(61, new VerseNumber(3, 1)));
            TestVerseParsing("2Петр ( 3:1 )", new SimpleVersePointer(61, new VerseNumber(3, 1)));
            TestVerseParsing("2Петр 3:1-2", new SimpleVersePointer(61, new VerseNumber(3, 1), new VerseNumber(3, 2)));
            TestVerseParsing("2Петр 1-3", new SimpleVersePointer(61, new VerseNumber(1), new VerseNumber(3)));
            TestVerseParsing("2Петр (1-3)", new SimpleVersePointer(61, new VerseNumber(1), new VerseNumber(3)));
            TestVerseParsing("2Петр 2 -3:1", new SimpleVersePointer(61, new VerseNumber(2), new VerseNumber(3, 1)));
            TestVerseParsing("2 Петр1:4- 3:2", new SimpleVersePointer(61, new VerseNumber(1, 4), new VerseNumber(3, 2)));
            TestVerseParsing("2 Петр1 : 4- 3 : 2", new SimpleVersePointer(61, new VerseNumber(1, 4), new VerseNumber(3, 2)));
            TestVerseParsing("2-e Петр1,4 - 3:2", new SimpleVersePointer(61, new VerseNumber(1, 4), new VerseNumber(3, 2)));
            TestVerseParsing("2-е Петр1,4 - 3,2", new SimpleVersePointer(61, new VerseNumber(1, 4), new VerseNumber(3, 2)));
            TestVerseParsing("2-е Петр1, 4 - 3,2", new SimpleVersePointer(61, new VerseNumber(1, 4), new VerseNumber(3, 2)));
            TestVerseParsing("2-е Петр1, 4 - 3 ,2", new SimpleVersePointer(61, new VerseNumber(1, 4), new VerseNumber(3, 2)));
            TestVerseParsing("2-е Петр1, 4 - 3 , 2", new SimpleVersePointer(61, new VerseNumber(1, 4), new VerseNumber(3, 2)));
            TestVerseParsing("2-е Петр(1,4 - 3,2)", new SimpleVersePointer(61, new VerseNumber(1, 4), new VerseNumber(3, 2)));
            TestVerseParsing("2-ое Петра1,4 -  3,2", new SimpleVersePointer(61, new VerseNumber(1, 4), new VerseNumber(3, 2)));
            TestVerseParsing("2-oe Петра  1,4  -  3,2", new SimpleVersePointer(61, new VerseNumber(1, 4), new VerseNumber(3, 2)));
            TestVerseParsing("2-oe Петра ( 1,4  -  3,2 )", new SimpleVersePointer(61, new VerseNumber(1, 4), new VerseNumber(3, 2)));

            TestVerseParsing("Ин 1:1", new SimpleVersePointer(43, 1, 1));
            TestVerseParsing("Ин (1:1)", new SimpleVersePointer(43, 1, 1));
            TestVerseParsing("Ин 1: 1", new SimpleVersePointer(43, 1, 1));
            TestVerseParsing("Ин 1", new SimpleVersePointer(43, 1));
            TestVerseParsing("Ин (1)", new SimpleVersePointer(43, 1));
        }

        [TestMethod]
        public void TestVerseExpanding()
        {
            var versesListInfo = _verseParserService.CreateVersePointer("Ин 2:3-4:7").ExpandMultiVerse();
            Assert.AreEqual(66, versesListInfo.VersesCount);
            Assert.AreEqual(31, versesListInfo.VersePointers.Count);
        }
    }
}
