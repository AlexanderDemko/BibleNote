using Microsoft.VisualStudio.TestTools.UnitTesting;
using BibleNote.Tests.Analytics.Mocks;
using BibleNote.Analytics.Services.VerseParsing.Contracts;
using BibleNote.Analytics.Services.ModulesManager.Models;
using BibleNote.Analytics.Services.VerseParsing.Models;
using BibleNote.Analytics.Services.Configuration.Contracts;

namespace BibleNote.Tests.Analytics
{
    [TestClass]
    public class VersePointerTests
    {
        private IVersePointerFactory _versePointerFactory;        
        private IVerseCorrectionService _verseCorrectionService;

        [TestInitialize]
        public void Init()
        {
            DIContainer.InitWithDefaults();
            DIContainer.Container.RegisterInstance<IConfigurationManager>(new MockConfigurationManager());

            _versePointerFactory = DIContainer.Resolve<IVersePointerFactory>();            
            _verseCorrectionService = DIContainer.Resolve<IVerseCorrectionService>();
        }

        private VersePointer CheckVerseParsing(string originalVerse, SimpleVersePointer expectedVerse)
        {
            var actualVerse = _versePointerFactory.CreateVersePointer(originalVerse);
            Assert.AreEqual(expectedVerse, actualVerse);

            return actualVerse;
        }

        public void CheckVerseExpanding(string originalVerse, int versesCount, string[] notFoundVerses, params string[] verses)
        {
            if (notFoundVerses == null)
                notFoundVerses = new string[0];

            var actualVerse = _versePointerFactory.CreateVersePointer(originalVerse);
            _verseCorrectionService.CheckAndCorrectVerse(actualVerse);            

            Assert.AreEqual(versesCount, actualVerse.SubVerses.VersesCount, "Verses count is wrong.");
            Assert.AreEqual(verses.Length, actualVerse.SubVerses.Verses.Count, "VersePointers count is wrong.");
            Assert.AreEqual(notFoundVerses.Length, actualVerse.SubVerses.NotFoundVerses.Count, "NotFoundVersePointers count is wrong.");

            foreach (var verse in verses)            
                Assert.IsTrue(actualVerse.SubVerses.Verses.Contains(_versePointerFactory.CreateVersePointer(verse).ToModuleVersePointer()), "Can not find the verse: '{0}'", verse);

            foreach (var verse in notFoundVerses)
                Assert.IsTrue(actualVerse.SubVerses.NotFoundVerses.Contains(_versePointerFactory.CreateVersePointer(verse).ToModuleVersePointer()), "Can not find the verse: '{0}'", verse);
        }

        [TestMethod]
        public void VersePointer_Test1()
        {            
            CheckVerseParsing("2Петр 3", new SimpleVersePointer(61, new VerseNumber(3)));
            CheckVerseParsing("2Петр 3:1", new SimpleVersePointer(61, new VerseNumber(3, 1)));           
            CheckVerseParsing("2Петр 3:1-2", new SimpleVersePointer(61, new VerseNumber(3, 1), new VerseNumber(3, 2)));
            CheckVerseParsing("2Петр 3:0-1", new SimpleVersePointer(61, new VerseNumber(3)));
            CheckVerseParsing("2Петр 1-3", new SimpleVersePointer(61, new VerseNumber(1), new VerseNumber(3)));
            CheckVerseParsing("2Петр 1:1-2:2", new SimpleVersePointer(61, new VerseNumber(1, 1), new VerseNumber(2, 2)));
            CheckVerseParsing("2Петр 1-2:2", new SimpleVersePointer(61, new VerseNumber(1), new VerseNumber(2, 2)));
            CheckVerseParsing("2Петр 2 -3:1", new SimpleVersePointer(61, new VerseNumber(2), new VerseNumber(3, 1)));
            CheckVerseParsing("2 Петр1:4- 3:2", new SimpleVersePointer(61, new VerseNumber(1, 4), new VerseNumber(3, 2)));
            CheckVerseParsing("2 Петр1 : 4- 3 : 2", new SimpleVersePointer(61, new VerseNumber(1, 4), new VerseNumber(3, 2)));

            CheckVerseParsing("Ин 1:1", new SimpleVersePointer(43, 1, 1));
            CheckVerseParsing("Ин  1:1", new SimpleVersePointer(43, 1, 1));
            CheckVerseParsing("Ин   1:1", new SimpleVersePointer(43, 1, 1));
            CheckVerseParsing("Ин    1:1", new SimpleVersePointer(43, 1, 1));
            CheckVerseParsing("Ин 1 1 : 1 1", new SimpleVersePointer(43, 11, 11));
            CheckVerseParsing("Ин 1  1 : 1 1", new SimpleVersePointer(43, 1));
            CheckVerseParsing("Ин 1,2", new SimpleVersePointer(43, 1, 2));            
            CheckVerseParsing("Ин 1", new SimpleVersePointer(43, 1));
            CheckVerseParsing("Ин 1: 1", new SimpleVersePointer(43, 1, 1));
        }

        [TestMethod]
        public void VersePointer_Test2()
        {
            CheckVerseParsing("2Петр (3:1)", new SimpleVersePointer(61, new VerseNumber(3, 1)));
            CheckVerseParsing("2Петр ( 3:1)", new SimpleVersePointer(61, new VerseNumber(3, 1)));
            CheckVerseParsing("2Петр ( 3:1 )", new SimpleVersePointer(61, new VerseNumber(3, 1)));
            CheckVerseParsing("2Петр (1-3)", new SimpleVersePointer(61, new VerseNumber(1), new VerseNumber(3)));
            CheckVerseParsing("2-е Петр1,4 - 3:2", new SimpleVersePointer(61, new VerseNumber(1, 4), new VerseNumber(3, 2)));            
            CheckVerseParsing("2-е Петр1, 4 - 3:2", new SimpleVersePointer(61, new VerseNumber(1, 4), new VerseNumber(3, 2)));
            CheckVerseParsing("2-е Петр1, 4 - 3 :2", new SimpleVersePointer(61, new VerseNumber(1, 4), new VerseNumber(3, 2)));
            CheckVerseParsing("2-е Петр1, 4 - 3 : 2", new SimpleVersePointer(61, new VerseNumber(1, 4), new VerseNumber(3, 2)));
            CheckVerseParsing("2-е Петр(1,4 - 3:2)", new SimpleVersePointer(61, new VerseNumber(1, 4), new VerseNumber(3, 2)));            
            CheckVerseParsing("2-ое Петра  1,4 - 3:2", new SimpleVersePointer(61, new VerseNumber(1, 4), new VerseNumber(3, 2)));
            CheckVerseParsing("2-ое Петра ( 1,4 - 3:2 )", new SimpleVersePointer(61, new VerseNumber(1, 4), new VerseNumber(3, 2)));
            CheckVerseParsing("Первом послании к Коринфянам (10:31)", new SimpleVersePointer(46, new VerseNumber(10, 31)));
            CheckVerseParsing("Ин 1-3:20", new SimpleVersePointer(43, new VerseNumber(1), new VerseNumber(3, 20)));
            CheckVerseParsing("Ин (1:1)", new SimpleVersePointer(43, 1, 1));            
            CheckVerseParsing("Ин (1)", new SimpleVersePointer(43, 1));
        }

        [TestMethod]
        public void VersePointer_Test3()
        {
            CheckVerseParsing("Ин 3:10-17", new SimpleVersePointer(43, new VerseNumber(3, 10), new VerseNumber(3, 17)));
        }

        [TestMethod]
        public void VersePointer_Test4()
        {
            CheckVerseExpanding("Ин 2:3-4:7", 66, null,
                                "Ин 2:3", "Ин 2:4", "Ин 2:5", "Ин 2:6", "Ин 2:7", "Ин 2:8", "Ин 2:9", "Ин 2:10", "Ин 2:11", "Ин 2:12",
                                "Ин 2:13", "Ин 2:14", "Ин 2:15", "Ин 2:16", "Ин 2:17", "Ин 2:18", "Ин 2:19", "Ин 2:20", "Ин 2:21", "Ин 2:22",
                                "Ин 2:23", "Ин 2:24", "Ин 2:25", "Ин 3", "Ин 4:1", "Ин 4:2", "Ин 4:3", "Ин 4:4", "Ин 4:5", "Ин 4:6", 
                                "Ин 4:7");

            CheckVerseExpanding("Ин 2:3-4", 2, null, "Ин 2:3", "Ин 2:4");
            CheckVerseExpanding("Ин 1:50-2:2", 4, null, "Ин 1:50", "Ин 1:51", "Ин 2:1", "Ин 2:2");
            
            CheckVerseExpanding("Ps 89:1-2", 3, null, "Пс 88:1", "Пс 88:2", "Пс 88:3");

            CheckVerseExpanding("Ин 1-2", 2, null, "Ин 1", "Ин 2");
            CheckVerseExpanding("Ин 1-2:2", 53, null, "Ин 1", "Ин 2:1", "Ин 2:2");
            CheckVerseExpanding("Ин 1:2-3", 2, null, "Ин 1:2", "Ин 1:3");
            CheckVerseExpanding("Ин 3:30-40", 7, new string[] { "Ин 3:37" }, "Ин 3:30", "Ин 3:31", "Ин 3:32", "Ин 3:33", "Ин 3:34", "Ин 3:35", "Ин 3:36");
            CheckVerseExpanding("Ин 21:24-23:3", 2, new string[] { "Ин 22" }, "Ин 21:24", "Ин 21:25");
        }      
    }
}
