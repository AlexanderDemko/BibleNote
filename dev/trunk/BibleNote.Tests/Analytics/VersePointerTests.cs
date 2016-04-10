using Microsoft.VisualStudio.TestTools.UnitTesting;
using BibleNote.Analytics.Models.Common;
using BibleNote.Analytics.Contracts.VerseParsing;
using BibleNote.Analytics.Services.Unity;
using Microsoft.Practices.Unity;
using BibleNote.Analytics.Contracts.Environment;
using BibleNote.Tests.Analytics.Mocks;

namespace BibleNote.Tests.Analytics
{
    [TestClass]
    public class VersePointerTests
    {
        private IVersePointerFactory _versePointerFactory;

        [TestInitialize]
        public void Init()
        {
            DIContainer.InitWithDefaults();
            DIContainer.Container.RegisterInstance<IConfigurationManager>(new MockConfigurationManager());

            _versePointerFactory = DIContainer.Resolve<IVersePointerFactory>();            
        }

        private VersePointer TestVerseParsing(string originalVerse, SimpleVersePointer expectedVerse)
        {
            var actualVerse = _versePointerFactory.CreateVersePointer(originalVerse);
            Assert.AreEqual(expectedVerse, actualVerse);

            return actualVerse;
        }

        [TestMethod]
        public void TestSimpleParse()
        {            
            TestVerseParsing("2Петр 3", new SimpleVersePointer(61, new VerseNumber(3)));
            TestVerseParsing("2Петр 3:1", new SimpleVersePointer(61, new VerseNumber(3, 1)));           
            TestVerseParsing("2Петр 3:1-2", new SimpleVersePointer(61, new VerseNumber(3, 1), new VerseNumber(3, 2)));
            TestVerseParsing("2Петр 1-3", new SimpleVersePointer(61, new VerseNumber(1), new VerseNumber(3)));
            TestVerseParsing("2Петр 1:1-2:2", new SimpleVersePointer(61, new VerseNumber(1, 1), new VerseNumber(2, 2)));
            TestVerseParsing("2Петр 1-2:2", new SimpleVersePointer(61, new VerseNumber(1), new VerseNumber(2, 2)));
            TestVerseParsing("2Петр 2 -3:1", new SimpleVersePointer(61, new VerseNumber(2), new VerseNumber(3, 1)));
            TestVerseParsing("2 Петр1:4- 3:2", new SimpleVersePointer(61, new VerseNumber(1, 4), new VerseNumber(3, 2)));
            TestVerseParsing("2 Петр1 : 4- 3 : 2", new SimpleVersePointer(61, new VerseNumber(1, 4), new VerseNumber(3, 2)));

            TestVerseParsing("Ин 1:1", new SimpleVersePointer(43, 1, 1));            
            TestVerseParsing("Ин 1", new SimpleVersePointer(43, 1));
            TestVerseParsing("Ин 1: 1", new SimpleVersePointer(43, 1, 1));
        }

        //todo: [TestMethod]
        public void TestExtendedParse()
        {
            TestVerseParsing("2Петр (3:1)", new SimpleVersePointer(61, new VerseNumber(3, 1)));
            TestVerseParsing("2Петр ( 3:1)", new SimpleVersePointer(61, new VerseNumber(3, 1)));
            TestVerseParsing("2Петр ( 3:1 )", new SimpleVersePointer(61, new VerseNumber(3, 1)));
            TestVerseParsing("2Петр (1-3)", new SimpleVersePointer(61, new VerseNumber(1), new VerseNumber(3)));
            TestVerseParsing("2-e Петр1,4 - 3:2", new SimpleVersePointer(61, new VerseNumber(1, 4), new VerseNumber(3, 2)));
            TestVerseParsing("2-е Петр1,4 - 3,2", new SimpleVersePointer(61, new VerseNumber(1, 4), new VerseNumber(3, 2)));
            TestVerseParsing("2-е Петр1, 4 - 3,2", new SimpleVersePointer(61, new VerseNumber(1, 4), new VerseNumber(3, 2)));
            TestVerseParsing("2-е Петр1, 4 - 3 ,2", new SimpleVersePointer(61, new VerseNumber(1, 4), new VerseNumber(3, 2)));
            TestVerseParsing("2-е Петр1, 4 - 3 , 2", new SimpleVersePointer(61, new VerseNumber(1, 4), new VerseNumber(3, 2)));
            TestVerseParsing("2-е Петр(1,4 - 3,2)", new SimpleVersePointer(61, new VerseNumber(1, 4), new VerseNumber(3, 2)));
            TestVerseParsing("2-ое Петра1,4 -  3,2", new SimpleVersePointer(61, new VerseNumber(1, 4), new VerseNumber(3, 2)));
            TestVerseParsing("2-oe Петра  1,4  -  3,2", new SimpleVersePointer(61, new VerseNumber(1, 4), new VerseNumber(3, 2)));
            TestVerseParsing("2-oe Петра ( 1,4  -  3,2 )", new SimpleVersePointer(61, new VerseNumber(1, 4), new VerseNumber(3, 2)));
            TestVerseParsing("Первом послании к Коринфянам (10:31)", new SimpleVersePointer(46, new VerseNumber(10, 31)));

            TestVerseParsing("Ин (1:1)", new SimpleVersePointer(43, 1, 1));            
            TestVerseParsing("Ин (1)", new SimpleVersePointer(43, 1));
        }

        //todo: [TestMethod]
        public void TestVerseExpanding()
        {
            var versesListInfo = _versePointerFactory.CreateVersePointer("Ин 2:3-4:7").ExpandMultiVerse();
            Assert.AreEqual(66, versesListInfo.VersesCount);
            Assert.AreEqual(31, versesListInfo.VersePointers.Count);
        }

        [TestMethod]
        public void TestMultiVerseParse()
        {
            TestVerseParsing("Ин 3:10-17", new SimpleVersePointer(43, new VerseNumber(3, 10), new VerseNumber(3, 17)));
        }
    }
}
