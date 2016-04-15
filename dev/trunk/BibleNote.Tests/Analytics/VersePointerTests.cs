﻿using Microsoft.VisualStudio.TestTools.UnitTesting;
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

        private VersePointer CheckVerseParsing(string originalVerse, SimpleVersePointer expectedVerse)
        {
            var actualVerse = _versePointerFactory.CreateVersePointer(originalVerse);
            Assert.AreEqual(expectedVerse, actualVerse);

            return actualVerse;
        }

        public void CheckVerseExpanding(string originalVerse, int versesCount, params string[] verses)
        {
            var actualVerse = _versePointerFactory.CreateVersePointer(originalVerse);
            var versesList = actualVerse.ExpandMultiVerse();

            Assert.AreEqual(versesCount, versesList.VersesCount, "Verses count is wrong.");
            Assert.AreEqual(verses.Length, versesList.VersePointers.Count, "VersePointers count is wrong.");

            foreach (var verse in verses)            
                Assert.IsTrue(versesList.VersePointers.Contains(_versePointerFactory.CreateVersePointer(verse)), "Can not find the verse: '{0}'", verse);            
        }

        [TestMethod]
        public void TestSimpleParse()
        {            
            CheckVerseParsing("2Петр 3", new SimpleVersePointer(61, new VerseNumber(3)));
            CheckVerseParsing("2Петр 3:1", new SimpleVersePointer(61, new VerseNumber(3, 1)));           
            CheckVerseParsing("2Петр 3:1-2", new SimpleVersePointer(61, new VerseNumber(3, 1), new VerseNumber(3, 2)));
            CheckVerseParsing("2Петр 1-3", new SimpleVersePointer(61, new VerseNumber(1), new VerseNumber(3)));
            CheckVerseParsing("2Петр 1:1-2:2", new SimpleVersePointer(61, new VerseNumber(1, 1), new VerseNumber(2, 2)));
            CheckVerseParsing("2Петр 1-2:2", new SimpleVersePointer(61, new VerseNumber(1), new VerseNumber(2, 2)));
            CheckVerseParsing("2Петр 2 -3:1", new SimpleVersePointer(61, new VerseNumber(2), new VerseNumber(3, 1)));
            CheckVerseParsing("2 Петр1:4- 3:2", new SimpleVersePointer(61, new VerseNumber(1, 4), new VerseNumber(3, 2)));
            CheckVerseParsing("2 Петр1 : 4- 3 : 2", new SimpleVersePointer(61, new VerseNumber(1, 4), new VerseNumber(3, 2)));

            CheckVerseParsing("Ин 1:1", new SimpleVersePointer(43, 1, 1));
            CheckVerseParsing("Ин 1,2", new SimpleVersePointer(43, 1, 2));            
            CheckVerseParsing("Ин 1", new SimpleVersePointer(43, 1));
            CheckVerseParsing("Ин 1: 1", new SimpleVersePointer(43, 1, 1));
        }

        //todo: [TestMethod]
        public void TestExtendedParse()
        {
            CheckVerseParsing("2Петр (3:1)", new SimpleVersePointer(61, new VerseNumber(3, 1)));
            CheckVerseParsing("2Петр ( 3:1)", new SimpleVersePointer(61, new VerseNumber(3, 1)));
            CheckVerseParsing("2Петр ( 3:1 )", new SimpleVersePointer(61, new VerseNumber(3, 1)));
            CheckVerseParsing("2Петр (1-3)", new SimpleVersePointer(61, new VerseNumber(1), new VerseNumber(3)));
            CheckVerseParsing("2-e Петр1,4 - 3:2", new SimpleVersePointer(61, new VerseNumber(1, 4), new VerseNumber(3, 2)));
            CheckVerseParsing("2-е Петр1,4 - 3,2", new SimpleVersePointer(61, new VerseNumber(1, 4), new VerseNumber(3, 2)));
            CheckVerseParsing("2-е Петр1, 4 - 3,2", new SimpleVersePointer(61, new VerseNumber(1, 4), new VerseNumber(3, 2)));
            CheckVerseParsing("2-е Петр1, 4 - 3 ,2", new SimpleVersePointer(61, new VerseNumber(1, 4), new VerseNumber(3, 2)));
            CheckVerseParsing("2-е Петр1, 4 - 3 , 2", new SimpleVersePointer(61, new VerseNumber(1, 4), new VerseNumber(3, 2)));
            CheckVerseParsing("2-е Петр(1,4 - 3,2)", new SimpleVersePointer(61, new VerseNumber(1, 4), new VerseNumber(3, 2)));
            CheckVerseParsing("2-ое Петра1,4 -  3,2", new SimpleVersePointer(61, new VerseNumber(1, 4), new VerseNumber(3, 2)));
            CheckVerseParsing("2-oe Петра  1,4  -  3,2", new SimpleVersePointer(61, new VerseNumber(1, 4), new VerseNumber(3, 2)));
            CheckVerseParsing("2-oe Петра ( 1,4  -  3,2 )", new SimpleVersePointer(61, new VerseNumber(1, 4), new VerseNumber(3, 2)));
            CheckVerseParsing("Первом послании к Коринфянам (10:31)", new SimpleVersePointer(46, new VerseNumber(10, 31)));

            CheckVerseParsing("Ин (1:1)", new SimpleVersePointer(43, 1, 1));            
            CheckVerseParsing("Ин (1)", new SimpleVersePointer(43, 1));
        }

        [TestMethod]
        public void TestMultiVerseParse()
        {
            CheckVerseParsing("Ин 3:10-17", new SimpleVersePointer(43, new VerseNumber(3, 10), new VerseNumber(3, 17)));
        }

        //todo: [TestMethod]
        public void TestVerseExpanding()
        {
            CheckVerseExpanding("Ин 2:3-4:7", 66,
                                "Ин 2:3", "Ин 2:4", "Ин 2:5", "Ин 2:6", "Ин 2:7", "Ин 2:8", "Ин 2:9", "Ин 2:10", "Ин 2:11", "Ин 2:12",
                                "Ин 2:13", "Ин 2:14", "Ин 2:15", "Ин 2:16", "Ин 2:17", "Ин 2:18", "Ин 2:19", "Ин 2:20", "Ин 2:21", "Ин 2:22",
                                "Ин 2:23", "Ин 2:24", "Ин 2:25", "Ин 3", "Ин 4:1", "Ин 4:2", "Ин 4:3", "Ин 4:4", "Ин 4:5", "Ин 4:6", 
                                "Ин 4:7");

            CheckVerseExpanding("Ин 2:3-4", 2, "Ин 2:3", "Ин 2:4");
            CheckVerseExpanding("Ин 1:50-2:2", 4, "Ин 1:50", "Ин 1:51", "Ин 2:1", "Ин 2:2");
            
            CheckVerseExpanding("Ps 89:1-2", 3, "Пс 88:1", "Пс 88:2", "Пс 88:3");

            CheckVerseExpanding("Ин 1-2", 2, "Ин 1", "Ин 2");
            CheckVerseExpanding("Ин 1-2:2", 53, "Ин 1", "Ин 2:1", "Ин 2:2");
            CheckVerseExpanding("Ин 1:2-3", 2, "Ин 1:2", "Ин 1:3");
        }      
    }
}
